import {
	Button,
	cn,
	daisyThemeMap,
	Field,
	gcd,
	Input,
	Modal,
	RadioGroup,
	Select,
	ThemeProvider,
	toast,
	Toaster,
	useTheme,
} from 'https://esm.sh/@trenaryja/ui'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import { useEffect, useEffectEvent, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import {
	FaBorderAll,
	FaCrosshairs,
	FaDownload,
	FaExclamationTriangle,
	FaLock,
	FaLockOpen,
	FaMinus,
	FaPlus,
} from 'https://esm.sh/react-icons/fa'
import { env } from './env'

// Set via .env.local locally, Vercel env vars for deploys — see .env.example
mapboxgl.accessToken = env.VITE_MAPBOX_TOKEN

const TILE_SIZE = 1024
const TILE_BATCH_SIZE = 12
const BYTES_PER_PIXEL = { png: 0.45, jpg: 0.23 } as const
const DEFAULT_ZOOM = 12
const MIN_ZOOM = 1
const MAX_ZOOM = 22

const STYLES = {
	'streets-v12': 'Streets',
	'dark-v11': 'Dark',
	'light-v11': 'Light',
	'outdoors-v12': 'Outdoors',
	'satellite-v9': 'Satellite',
	'satellite-streets-v12': 'Satellite Streets',
	'navigation-day-v1': 'Navigation Day',
	'navigation-night-v1': 'Navigation Night',
} as const

type MapStyle = keyof typeof STYLES

type Format = 'jpg' | 'png'

type TileBounds = { north: number; south: number; east: number; west: number }

/** The map's visible corners in degrees. Zoom-independent, so it is what the component stores. */
type GeoBounds = { north: number; south: number; east: number; west: number }

type Piece = { url: string; dx: number; dy: number }

/** The tile rectangle currently framed by the map, at the zoom level it is read at. */
type MapRegion = { bounds: TileBounds; zoom: number }

/** Everything needed to address a Mapbox raster tile. */
type TileSource = MapRegion & { style: MapStyle }

type DownloadRequest = TileSource & { format: Format; filename?: string }

/** One output file's slice of the grid: where it starts and how many tiles it covers. */
type ChunkPlacement = {
	chunkX: number
	chunkY: number
	startCol: number
	startRow: number
	colsInChunk: number
	rowsInChunk: number
}

const ZERO_BOUNDS: TileBounds = { north: 0, south: 0, east: 0, west: 0 }
const DEFAULT_MAP_STYLE: Record<'dark' | 'light', MapStyle> = { dark: 'dark-v11', light: 'light-v11' }

const { CANVAS_MAX_TILES_PER_DIM, CANVAS_MAX_TILE_AREA } = (() => {
	const test = (w: number, h: number) => {
		try {
			const c = new OffscreenCanvas(w, h)
			const ctx = c.getContext('2d')
			if (!ctx) return false
			ctx.fillRect(0, 0, 1, 1)
			return ctx.getImageData(0, 0, 1, 1).data[3]! > 0
		} catch {
			return false
		}
	}

	const search = (low: number, high: number, ok: (n: number) => boolean) => {
		let lo = low
		let hi = high

		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2)
			if (ok(mid)) lo = mid
			else hi = mid - 1
		}

		return lo
	}

	const maxDim = search(1, 32, (n) => test(n * TILE_SIZE, TILE_SIZE))
	const maxArea = search(1, maxDim ** 2, (n) => {
		const side = Math.min(Math.ceil(Math.sqrt(n)), maxDim)
		const other = Math.ceil(n / side)
		return other <= maxDim && test(side * TILE_SIZE, other * TILE_SIZE)
	})
	return { CANVAS_MAX_TILES_PER_DIM: maxDim, CANVAS_MAX_TILE_AREA: maxArea }
})()

const lng2tile = (lng: number, zoom: number) => Math.floor(((lng + 180) / 360) * 2 ** zoom)
const lat2tile = (lat: number, zoom: number) =>
	Math.floor(
		((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom,
	)
const tile2lng = (x: number, zoom: number) => (x / 2 ** zoom) * 360 - 180
const tile2lat = (y: number, zoom: number) =>
	(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI

const getRatio = (w: number, h: number) => {
	const divisor = gcd(w, h)
	return `${w}:${h}${divisor !== 1 ? ` (${w / divisor}:${h / divisor})` : ''}`
}

const formatBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
	return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

const boundsToGrid = (bounds: TileBounds) => ({
	cols: Math.abs(bounds.west - bounds.east) + 1,
	rows: Math.abs(bounds.north - bounds.south) + 1,
})

const getGeoBounds = (map: mapboxgl.Map): GeoBounds | null => {
	const geoBounds = map.getBounds()
	if (!geoBounds) return null
	return {
		north: geoBounds.getNorth(),
		south: geoBounds.getSouth(),
		east: geoBounds.getEast(),
		west: geoBounds.getWest(),
	}
}

/** Which tiles cover a geographic box at a given zoom. Pure, so the same box re-projects for free. */
const toTileBounds = ({ north, south, east, west }: GeoBounds, zoom: number): TileBounds => ({
	north: lat2tile(north, zoom),
	south: lat2tile(south, zoom),
	east: lng2tile(east, zoom),
	west: lng2tile(west, zoom),
})

const chunkGrid = (cols: number, rows: number) => {
	const chunkCols = Math.max(1, Math.min(CANVAS_MAX_TILES_PER_DIM, cols))
	const chunkRows = Math.max(1, Math.min(CANVAS_MAX_TILES_PER_DIM, Math.floor(CANVAS_MAX_TILE_AREA / chunkCols), rows))
	return { chunkCols, chunkRows, chunksX: Math.ceil(cols / chunkCols), chunksY: Math.ceil(rows / chunkRows) }
}

/** Flattens the grid into one placement per output file, in row-major order. */
const planChunks = (cols: number, rows: number) => {
	const { chunkCols, chunkRows, chunksX, chunksY } = chunkGrid(cols, rows)
	const chunks = Array.from({ length: chunksY }, (_chunkRow, chunkY) =>
		Array.from({ length: chunksX }, (_chunkColumn, chunkX) => ({
			chunkX,
			chunkY,
			startCol: chunkX * chunkCols,
			startRow: chunkY * chunkRows,
			colsInChunk: Math.min(chunkCols, cols - chunkX * chunkCols),
			rowsInChunk: Math.min(chunkRows, rows - chunkY * chunkRows),
		})),
	).flat()
	return { chunks, chunksX, chunksY }
}

const chunkPieces = ({ bounds, zoom, style }: TileSource, chunk: ChunkPlacement) =>
	Array.from({ length: chunk.colsInChunk }, (_column, dx) =>
		Array.from({ length: chunk.rowsInChunk }, (_row, dy) => {
			const tileX = bounds.west + chunk.startCol + dx
			const tileY = bounds.north + chunk.startRow + dy
			return {
				url: `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/${zoom}/${tileX}/${tileY}@2x?access_token=${mapboxgl.accessToken}`,
				dx,
				dy,
			}
		}),
	).flat()

const encodeChunk = async (canvas: OffscreenCanvas, format: Format, chunk: ChunkPlacement) => {
	const type = format === 'jpg' ? 'image/jpeg' : 'image/png'

	try {
		return await canvas.convertToBlob({ type, ...(format === 'jpg' && { quality: 0.92 }) })
	} catch (error) {
		throw new Error(
			`convertToBlob failed for chunk r${chunk.chunkY}c${chunk.chunkX} (${canvas.width}x${canvas.height}px). ` +
				`Detected limits: ${CANVAS_MAX_TILES_PER_DIM * TILE_SIZE}px/dim, ${CANVAS_MAX_TILE_AREA} tile area. ` +
				`${error instanceof Error ? error.message : error}`,
		)
	}
}

const saveBlob = (blob: Blob, name: string) => {
	const url = URL.createObjectURL(blob)
	Object.assign(document.createElement('a'), { download: name, href: url }).click()
	URL.revokeObjectURL(url)
}

const syncTileGrid = (map: mapboxgl.Map, show: boolean, { bounds, zoom }: MapRegion) => {
	const source = map.getSource<mapboxgl.GeoJSONSource>('tile-grid')

	if (!show) {
		if (source) map.setLayoutProperty('tile-grid-lines', 'visibility', 'none')
		return
	}

	const { cols, rows } = boundsToGrid(bounds)
	if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return

	const line = (coords: [number, number][]): GeoJSON.Feature => ({
		type: 'Feature',
		properties: {},
		geometry: { type: 'LineString', coordinates: coords },
	})
	const features = [
		...Array.from({ length: cols + 1 }, (_, i) => {
			const lng = tile2lng(bounds.west + i, zoom)
			return line([
				[lng, tile2lat(bounds.north, zoom)],
				[lng, tile2lat(bounds.south + 1, zoom)],
			])
		}),
		...Array.from({ length: rows + 1 }, (_, i) => {
			const lat = tile2lat(bounds.north + i, zoom)
			return line([
				[tile2lng(bounds.west, zoom), lat],
				[tile2lng(bounds.east + 1, zoom), lat],
			])
		}),
	]

	const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

	if (source) {
		source.setData(data)
		map.setLayoutProperty('tile-grid-lines', 'visibility', 'visible')
	} else {
		map.addSource('tile-grid', { type: 'geojson', data })
		map.addLayer({
			id: 'tile-grid-lines',
			type: 'line',
			source: 'tile-grid',
			paint: { 'line-color': '#ef4444', 'line-width': 1.5, 'line-dasharray': [4, 2] },
		})
	}
}

const getPosition = () =>
	new Promise<GeolocationPosition>((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(resolve, reject)
	})
		.then((p) => [p.coords.longitude, p.coords.latitude] satisfies [number, number])
		.catch(() => [-74.006, 40.7128] satisfies [number, number])

const downloadMap = async ({ bounds, zoom, format, style, filename }: DownloadRequest) => {
	const controller = new AbortController()
	const { signal } = controller

	const { cols, rows } = boundsToGrid(bounds)
	const { chunks, chunksX, chunksY } = planChunks(cols, rows)
	const totalChunks = chunks.length
	const multiFile = totalChunks > 1

	const ext = `.${format}`
	const baseName = filename ?? `map_z${zoom}_${cols}x${rows}${ext}`
	const stem = baseName.endsWith(ext) ? baseName.slice(0, -ext.length) : baseName

	const cancelAction = { label: 'Cancel', onClick: () => controller.abort() }
	const id = toast.loading('Downloading tiles...', { description: '0%', cancel: cancelAction })

	try {
		let totalLoaded = 0
		let totalSize = 0
		const totalTiles = cols * rows

		const loadTile = async (piece: Piece, ctx: OffscreenCanvasRenderingContext2D, chunkLabel: string) => {
			const res = await fetch(piece.url, { signal, cache: 'force-cache' })
			if (!res.ok) throw new Error(`Tile fetch failed: ${res.status}`)
			const img = await createImageBitmap(await res.blob())
			ctx.drawImage(img, piece.dx * TILE_SIZE, piece.dy * TILE_SIZE)
			img.close()
			totalLoaded++
			toast.loading('Downloading tiles...', {
				id,
				cancel: cancelAction,
				description: `${Math.round((totalLoaded / totalTiles) * 100)}% (${totalLoaded}/${totalTiles})${chunkLabel}`,
			})
		}

		for (const [index, chunk] of chunks.entries()) {
			signal.throwIfAborted()

			const chunkLabel = multiFile ? ` (part ${index + 1}/${totalChunks})` : ''
			const canvas = new OffscreenCanvas(chunk.colsInChunk * TILE_SIZE, chunk.rowsInChunk * TILE_SIZE)
			const ctx = canvas.getContext('2d')
			if (!ctx) throw new Error('Could not create canvas context')

			const pieces = chunkPieces({ bounds, zoom, style }, chunk)

			for (let i = 0; i < pieces.length; i += TILE_BATCH_SIZE) {
				signal.throwIfAborted()
				await Promise.all(pieces.slice(i, i + TILE_BATCH_SIZE).map((piece) => loadTile(piece, ctx, chunkLabel)))
			}

			toast.loading(`Encoding image...${chunkLabel}`, { id, cancel: cancelAction, description: format.toUpperCase() })
			const blob = await encodeChunk(canvas, format, chunk)
			totalSize += blob.size
			saveBlob(blob, multiFile ? `${stem}_r${chunk.chunkY}c${chunk.chunkX}${ext}` : `${stem}${ext}`)
		}

		const description = multiFile
			? `${totalChunks} files, ${chunksX}x${chunksY} grid (${formatBytes(totalSize)})`
			: `${stem}${ext} (${formatBytes(totalSize)})`
		toast.success('Download complete', { id, description })
		return totalSize
	} catch (error) {
		if (signal.aborted) {
			toast.dismiss(id)
			return
		}

		toast.error('Download failed', { id, description: error instanceof Error ? error.message : 'Unknown error' })
		throw error
	}
}

/** Zoom, north-west corner and grid size — enough to tell two exports of the same area apart. */
const defaultFilename = ({ map, bounds, zoom, format }: MapRegion & { map: mapboxgl.Map | null; format: Format }) => {
	const northWest = map?.getBounds()?.getNorthWest()
	if (!northWest) return null
	const { cols, rows } = boundsToGrid(bounds)
	return `map_z${zoom}_[${northWest.lat.toFixed(4)}_${northWest.lng.toFixed(4)}]_${cols}x${rows}.${format}`
}

type DownloadButtonProps = TileSource & { map: mapboxgl.Map | null; format: Format }

const DownloadButton = ({ map, bounds, zoom, format, style }: DownloadButtonProps) => {
	const [downloading, setDownloading] = useState(false)
	// Non-null is also what opens the dialog: there is no draft filename unless one is being edited
	const [draft, setDraft] = useState<string | null>(null)

	const save = async (filename: string) => {
		setDraft(null)
		setDownloading(true)

		try {
			await downloadMap({ bounds, zoom, format, style, filename })
		} finally {
			setDownloading(false)
		}
	}

	return (
		<>
			<Button
				className='btn-square'
				disabled={downloading}
				title='Download'
				onClick={() => setDraft(defaultFilename({ map, bounds, zoom, format }))}
			>
				{downloading ? <span className='loading loading-spinner loading-xs' /> : <FaDownload />}
			</Button>
			<Modal open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
				<form
					className='grid gap-4'
					onSubmit={(event) => {
						event.preventDefault()
						const filename = draft?.trim()
						if (filename) void save(filename)
					}}
				>
					<Field label='Filename'>
						<Input
							className='w-full'
							autoFocus
							value={draft ?? ''}
							onChange={(event) => setDraft(event.target.value)}
						/>
					</Field>
					<Button type='submit' className='btn-primary' disabled={!draft?.trim()}>
						Download
					</Button>
				</form>
			</Modal>
		</>
	)
}

const LocateButton = ({ map }: { map: mapboxgl.Map | null }) => (
	<Button
		className='btn-square'
		title='Go to current location'
		onClick={() => getPosition().then((center) => map?.flyTo({ center }))}
	>
		<FaCrosshairs />
	</Button>
)

type ZoomControlProps = { zoom: number; locked: boolean; onToggleLock: () => void; onStep: (delta: number) => void }

const ZoomControl = ({ zoom, locked, onToggleLock, onStep }: ZoomControlProps) => (
	<div className='join'>
		<Button className='btn-square join-item' onClick={() => onStep(-1)}>
			<FaMinus />
		</Button>
		<Button className='join-item gap-1' onClick={onToggleLock}>
			{locked ? <FaLock /> : <FaLockOpen />}
			<span className='font-mono'>{zoom}</span>
		</Button>
		<Button className='btn-square join-item' onClick={() => onStep(1)}>
			<FaPlus />
		</Button>
	</div>
)

type StyleSelectProps = { value: MapStyle; onChange: (style: MapStyle) => void }

const StyleSelect = ({ value, onChange }: StyleSelectProps) => (
	<Select className='w-fit' value={value} onChange={(e) => onChange(e.target.value as MapStyle)}>
		{Object.entries(STYLES).map(([styleId, label]) => (
			<option key={styleId} value={styleId}>
				{label}
			</option>
		))}
	</Select>
)

const MapStats = ({ bounds, format }: { bounds: TileBounds; format: Format }) => {
	const { cols, rows } = boundsToGrid(bounds)
	const tileCount = cols * rows
	const { chunksX, chunksY } = chunkGrid(cols, rows)
	const totalChunks = chunksX * chunksY

	return (
		<div className='flex items-center justify-center gap-4 font-mono text-xs opacity-75'>
			{totalChunks === 1 && tileCount > 100 && format === 'png' && (
				<FaExclamationTriangle className='text-warning cursor-help' title='Large map — JPG will export faster' />
			)}
			<span>{getRatio(cols, rows)}</span>
			<span>{tileCount} tiles</span>
			<span>~{formatBytes(tileCount * TILE_SIZE ** 2 * BYTES_PER_PIXEL[format])}</span>
			{totalChunks > 1 && (
				<span>
					{totalChunks} downloads ({chunksX}x{chunksY})
				</span>
			)}
		</div>
	)
}

const MapPrinter = () => {
	const { resolvedTheme } = useTheme()
	const colorScheme =
		resolvedTheme && resolvedTheme in daisyThemeMap
			? daisyThemeMap[resolvedTheme as keyof typeof daisyThemeMap].colorScheme
			: 'dark'

	const containerRef = useRef<HTMLDivElement>(null)
	// State, not a ref: the toolbar renders from the map, and the listeners below can only be wired
	// once it exists — both of which need a render to happen when it appears.
	const [map, setMap] = useState<mapboxgl.Map | null>(null)
	const [geoBounds, setGeoBounds] = useState<GeoBounds | null>(null)
	const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM)
	const [zoomLocked, setZoomLocked] = useState(false)
	const [lockedZoom, setLockedZoom] = useState(DEFAULT_ZOOM)
	const [format, setFormat] = useState<Format>('png')
	const [style, setStyle] = useState<MapStyle>(() => DEFAULT_MAP_STYLE[colorScheme])
	const [showGrid, setShowGrid] = useState(false)

	const zoom = zoomLocked ? lockedZoom : currentZoom
	// The stored box is zoom-independent, so the locked and unlocked cases are the same projection
	const effectiveBounds = geoBounds ? toTileBounds(geoBounds, zoom) : ZERO_BOUNDS

	// Reads showGrid and the export zoom at style.load time, not at map-creation time
	const onStyleLoad = useEffectEvent(() => {
		if (!map) return
		syncTileGrid(map, showGrid, { bounds: effectiveBounds, zoom })
	})

	// Reads the chosen style at creation time; later changes go through the restyle effect below
	const createMap = useEffectEvent(
		(container: HTMLDivElement, center: mapboxgl.LngLatLike) =>
			new mapboxgl.Map({
				container,
				style: `mapbox://styles/mapbox/${style}`,
				attributionControl: false,
				zoom: DEFAULT_ZOOM,
				center,
			}),
	)

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		let created: mapboxgl.Map | null = null
		let cancelled = false

		getPosition().then((center) => {
			if (cancelled) return
			created = createMap(container, center)
			// Seeded here, not left to `load`: with the style cached the map can finish loading before the
			// listener effect below attaches, and `load` does not fire twice.
			setGeoBounds(getGeoBounds(created))
			setMap(created)
		})

		return () => {
			cancelled = true
			created?.remove()
		}
	}, [])

	useEffect(() => {
		if (!map) return

		const sync = () => {
			setCurrentZoom(Math.floor(map.getZoom()))
			setGeoBounds(getGeoBounds(map))
		}

		map.on('moveend', sync)
		map.on('load', sync)
		map.on('style.load', onStyleLoad)

		return () => {
			map.off('moveend', sync)
			map.off('load', sync)
			map.off('style.load', onStyleLoad)
		}
	}, [map])

	// Track the theme as it changes; `style` is the one source of truth the map is synced from
	const [prevColorScheme, setPrevColorScheme] = useState(colorScheme)

	if (prevColorScheme !== colorScheme) {
		setPrevColorScheme(colorScheme)
		setStyle(DEFAULT_MAP_STYLE[colorScheme])
	}

	useEffect(() => {
		map?.setStyle(`mapbox://styles/mapbox/${style}`)
	}, [map, style])

	useEffect(() => {
		if (!map) return

		const draw = () => syncTileGrid(map, showGrid, { bounds: effectiveBounds, zoom })
		// `moveend` fires while the new viewport's tiles are still in flight, so `isStyleLoaded()` is
		// routinely false here; `idle` is the event that means every tile has landed.
		if (map.isStyleLoaded()) draw()
		else map.once('idle', draw)

		return () => {
			map.off('idle', draw)
		}
	}, [map, showGrid, effectiveBounds, zoom])

	return (
		<>
			<Toaster />
			<main className='relative h-screen w-screen'>
				<div ref={containerRef} className='absolute size-full' />
				<nav className='fixed top-2 left-1/2 -translate-x-1/2 w-fit bg-base-100/50 backdrop-blur rounded-box shadow-lg p-2 grid gap-2'>
					<div className='flex gap-2'>
						<DownloadButton map={map} bounds={effectiveBounds} zoom={zoom} format={format} style={style} />
						<LocateButton map={map} />
						<ZoomControl
							zoom={zoom}
							locked={zoomLocked}
							onToggleLock={() => {
								setZoomLocked(!zoomLocked)
								setLockedZoom(zoom)
							}}
							onStep={(delta) => {
								if (zoomLocked) setLockedZoom(Math.min(Math.max(lockedZoom + delta, MIN_ZOOM), MAX_ZOOM))
								else map?.zoomTo(currentZoom + delta)
							}}
						/>
						<StyleSelect value={style} onChange={setStyle} />
						<RadioGroup
							variant='btn'
							options={['png', 'jpg']}
							value={format}
							onChange={(e) => setFormat(e.target.value as Format)}
						/>
						<Button
							className={cn(showGrid ? 'btn-primary' : '', 'btn-square')}
							onClick={() => setShowGrid(!showGrid)}
							title='Show tile boundaries'
						>
							<FaBorderAll />
						</Button>
					</div>
					<MapStats bounds={effectiveBounds} format={format} />
				</nav>
			</main>
		</>
	)
}

createRoot(document.getElementById('root')!).render(
	<ThemeProvider>
		<MapPrinter />
	</ThemeProvider>,
)
