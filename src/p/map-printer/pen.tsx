import {
	Button,
	cn,
	daisyThemeMap,
	RadioGroup,
	Select,
	ThemeProvider,
	Toaster,
	toast,
	useTheme,
} from 'https://esm.sh/@trenaryja/ui'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
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

// Set via VITE_MAPBOX_TOKEN env var — see .env locally, Vercel env vars for deploys
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const TILE_SIZE = 1024
const TILE_BATCH_SIZE = 12
const BYTES_PER_PIXEL = { png: 0.45, jpg: 0.23 } as const
const DEFAULT_ZOOM = 12

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
type Format = 'png' | 'jpg'
type TileBounds = { north: number; south: number; east: number; west: number }

const ZERO_BOUNDS: TileBounds = { north: 0, south: 0, east: 0, west: 0 }
const DEFAULT_MAP_STYLE: Record<'dark' | 'light', MapStyle> = { dark: 'dark-v11', light: 'light-v11' }

const { CANVAS_MAX_TILES_PER_DIM, CANVAS_MAX_TILE_AREA } = (() => {
	const test = (w: number, h: number) => {
		try {
			const c = new OffscreenCanvas(w, h)
			const ctx = c.getContext('2d')
			if (!ctx) return false
			ctx.fillRect(0, 0, 1, 1)
			return ctx.getImageData(0, 0, 1, 1).data[3] > 0
		} catch {
			return false
		}
	}
	const search = (lo: number, hi: number, ok: (n: number) => boolean) => {
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
	console.log(`[map-printer] Canvas limits: ${maxDim} tiles/dim (${maxDim * TILE_SIZE}px), ${maxArea} tile area`)
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
	const gcd = (a: number, b: number): number => (!b ? a : gcd(b, a % b))
	const d = gcd(w, h)
	return `${w}:${h}${d !== 1 ? ` (${w / d}:${h / d})` : ''}`
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

const getTileBounds = (map: mapboxgl.Map, zoom = Math.floor(map.getZoom())): TileBounds => {
	const b = map.getBounds()
	if (!b) return ZERO_BOUNDS
	return {
		north: lat2tile(b.getNorth(), zoom),
		south: lat2tile(b.getSouth(), zoom),
		east: lng2tile(b.getEast(), zoom),
		west: lng2tile(b.getWest(), zoom),
	}
}

const chunkGrid = (cols: number, rows: number) => {
	const chunkCols = Math.max(1, Math.min(CANVAS_MAX_TILES_PER_DIM, cols))
	const chunkRows = Math.max(1, Math.min(CANVAS_MAX_TILES_PER_DIM, Math.floor(CANVAS_MAX_TILE_AREA / chunkCols), rows))
	return { chunkCols, chunkRows, chunksX: Math.ceil(cols / chunkCols), chunksY: Math.ceil(rows / chunkRows) }
}

const syncTileGrid = (map: mapboxgl.Map, show: boolean, bounds: TileBounds, zoom: number) => {
	const source = map.getSource('tile-grid') as mapboxgl.GeoJSONSource | undefined
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
	new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject))
		.then((p) => [p.coords.longitude, p.coords.latitude] satisfies [number, number])
		.catch(() => [-74.006, 40.7128] satisfies [number, number])

let downloadController: AbortController | null = null

const downloadMap = async (bounds: TileBounds, zoom: number, format: Format, style: MapStyle, filename?: string) => {
	downloadController?.abort()
	const controller = new AbortController()
	downloadController = controller
	const { signal } = controller

	const { cols, rows } = boundsToGrid(bounds)
	const { chunkCols, chunkRows, chunksX, chunksY } = chunkGrid(cols, rows)
	const totalChunks = chunksX * chunksY
	const multiFile = totalChunks > 1

	const ext = `.${format}`
	const baseName = filename ?? `map_z${zoom}_${cols}x${rows}${ext}`
	const stem = baseName.endsWith(ext) ? baseName.slice(0, -ext.length) : baseName

	const cancelAction = { label: 'Cancel', onClick: () => controller.abort() }
	const id = toast.loading('Downloading tiles...', { description: '0%', cancel: cancelAction })

	try {
		let totalLoaded = 0
		const totalTiles = cols * rows
		let totalSize = 0

		for (let cy = 0; cy < chunksY; cy++) {
			for (let cx = 0; cx < chunksX; cx++) {
				signal.throwIfAborted()

				const startCol = cx * chunkCols
				const startRow = cy * chunkRows
				const cCols = Math.min(chunkCols, cols - startCol)
				const cRows = Math.min(chunkRows, rows - startRow)

				if (cCols <= 0 || cRows <= 0) {
					console.warn(`[map-printer] Skipping empty chunk r${cy}c${cx}: ${cCols}x${cRows}`)
					continue
				}

				const canvasW = cCols * TILE_SIZE
				const canvasH = cRows * TILE_SIZE
				const chunkLabel = multiFile ? ` (part ${cy * chunksX + cx + 1}/${totalChunks})` : ''
				console.log(`[map-printer] Chunk r${cy}c${cx}: ${cCols}x${cRows} tiles, ${canvasW}x${canvasH}px`)

				const canvas = new OffscreenCanvas(canvasW, canvasH)
				const ctx = canvas.getContext('2d')
				if (!ctx) throw new Error('Could not create canvas context')

				const pieces: { url: string; dx: number; dy: number }[] = []
				for (let x = 0; x < cCols; x++) {
					for (let y = 0; y < cRows; y++) {
						const tileX = bounds.west + startCol + x
						const tileY = bounds.north + startRow + y
						pieces.push({
							url: `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/${zoom}/${tileX}/${tileY}@2x?access_token=${mapboxgl.accessToken}`,
							dx: x,
							dy: y,
						})
					}
				}

				for (let i = 0; i < pieces.length; i += TILE_BATCH_SIZE) {
					signal.throwIfAborted()
					await Promise.all(
						pieces.slice(i, i + TILE_BATCH_SIZE).map(async (p) => {
							const res = await fetch(p.url, { signal, cache: 'force-cache' })
							if (!res.ok) throw new Error(`Tile fetch failed: ${res.status}`)
							const img = await createImageBitmap(await res.blob())
							ctx.drawImage(img, p.dx * TILE_SIZE, p.dy * TILE_SIZE)
							img.close()
							totalLoaded++
							toast.loading('Downloading tiles...', {
								id,
								cancel: cancelAction,
								description: `${Math.round((totalLoaded / totalTiles) * 100)}% (${totalLoaded}/${totalTiles})${chunkLabel}`,
							})
						}),
					)
				}

				toast.loading(`Encoding image...${chunkLabel}`, { id, cancel: cancelAction, description: format.toUpperCase() })

				const type = format === 'jpg' ? 'image/jpeg' : 'image/png'
				let blob: Blob
				try {
					blob = await canvas.convertToBlob({ type, ...(format === 'jpg' && { quality: 0.92 }) })
				} catch (blobErr) {
					throw new Error(
						`convertToBlob failed for chunk r${cy}c${cx} (${canvasW}x${canvasH}px). ` +
							`Detected limits: ${CANVAS_MAX_TILES_PER_DIM * TILE_SIZE}px/dim, ${CANVAS_MAX_TILE_AREA} tile area. ` +
							`${blobErr instanceof Error ? blobErr.message : blobErr}`,
					)
				}
				totalSize += blob.size

				const name = multiFile ? `${stem}_r${cy}c${cx}${ext}` : `${stem}${ext}`
				const url = URL.createObjectURL(blob)
				Object.assign(document.createElement('a'), { download: name, href: url }).click()
				URL.revokeObjectURL(url)
			}
		}

		const desc = multiFile
			? `${totalChunks} files, ${chunksX}x${chunksY} grid (${formatBytes(totalSize)})`
			: `${stem}${ext} (${formatBytes(totalSize)})`
		toast.success('Download complete', { id, description: desc })
		return totalSize
	} catch (e) {
		if (signal.aborted) {
			toast.dismiss(id)
			return
		}
		toast.error('Download failed', { id, description: e instanceof Error ? e.message : 'Unknown error' })
		throw e
	} finally {
		if (downloadController === controller) downloadController = null
	}
}

const MapPrinter = () => {
	const { resolvedTheme } = useTheme()
	const colorScheme =
		resolvedTheme && resolvedTheme in daisyThemeMap
			? daisyThemeMap[resolvedTheme as keyof typeof daisyThemeMap].colorScheme
			: 'dark'

	const containerRef = useRef<HTMLDivElement>(null)
	const mapRef = useRef<mapboxgl.Map | null>(null)
	const [bounds, setBounds] = useState(ZERO_BOUNDS)
	const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM)
	const [zoomLocked, setZoomLocked] = useState(false)
	const [lockedZoom, setLockedZoom] = useState(DEFAULT_ZOOM)
	const [format, setFormat] = useState<Format>('png')
	const [style, setStyle] = useState<MapStyle>(() => DEFAULT_MAP_STYLE[colorScheme])
	const [downloading, setDownloading] = useState(false)
	const [showGrid, setShowGrid] = useState(false)
	const showGridRef = useRef(showGrid)
	showGridRef.current = showGrid

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		getPosition().then((center) => {
			const map = new mapboxgl.Map({
				container,
				style: `mapbox://styles/mapbox/${style}`,
				attributionControl: false,
				zoom: DEFAULT_ZOOM,
				center,
			})
			mapRef.current = map

			const sync = () => {
				const z = Math.floor(map.getZoom())
				setCurrentZoom(z)
				setBounds(getTileBounds(map, z))
			}

			map.on('moveend', sync)
			map.on('load', sync)
			map.on('style.load', () => {
				const z = Math.floor(map.getZoom())
				syncTileGrid(map, showGridRef.current, getTileBounds(map, z), z)
			})
		})

		return () => {
			mapRef.current?.remove()
			mapRef.current = null
		}
	}, [])

	useEffect(() => {
		const s = DEFAULT_MAP_STYLE[colorScheme]
		setStyle(s)
		mapRef.current?.setStyle(`mapbox://styles/mapbox/${s}`)
	}, [colorScheme])

	useEffect(() => {
		const map = mapRef.current
		if (!map?.isStyleLoaded()) return
		const z = zoomLocked ? lockedZoom : currentZoom
		const b = zoomLocked ? getTileBounds(map, z) : bounds
		syncTileGrid(map, showGrid, b, z)
	}, [showGrid, bounds, currentZoom, zoomLocked, lockedZoom])

	const zoom = zoomLocked ? lockedZoom : currentZoom
	const effectiveBounds = zoomLocked ? (mapRef.current ? getTileBounds(mapRef.current, zoom) : ZERO_BOUNDS) : bounds
	const { cols, rows } = boundsToGrid(effectiveBounds)
	const tileCount = cols * rows
	const { chunksX, chunksY } = chunkGrid(cols, rows)
	const totalChunks = chunksX * chunksY

	return (
		<>
			<Toaster />
			<main className='relative h-screen w-screen'>
				<div ref={containerRef} className='absolute size-full' />
				<nav className='fixed top-2 left-1/2 -translate-x-1/2 w-fit bg-base-100/50 backdrop-blur rounded-box shadow-lg p-2 grid gap-2'>
					<div className='flex gap-2'>
						<Button
							className='btn-square'
							disabled={downloading}
							onClick={async () => {
								const geoBounds = mapRef.current?.getBounds()
								if (!geoBounds) return
								const nw = geoBounds.getNorthWest()
								const name = prompt(
									'Filename:',
									`map_z${zoom}_[${nw.lat.toFixed(4)}_${nw.lng.toFixed(4)}]_${cols}x${rows}.${format}`,
								)
								if (!name) return
								setDownloading(true)
								try {
									await downloadMap(effectiveBounds, zoom, format, style, name)
								} finally {
									setDownloading(false)
								}
							}}
						>
							{downloading ? <span className='loading loading-spinner loading-xs' /> : <FaDownload />}
						</Button>
						<Button
							className='btn-square'
							title='Go to current location'
							onClick={() => getPosition().then((center) => mapRef.current?.flyTo({ center }))}
						>
							<FaCrosshairs />
						</Button>
						<div className='join'>
							<Button
								className='btn-square join-item'
								onClick={() => {
									if (zoomLocked) setLockedZoom(Math.max(lockedZoom - 1, 1))
									else mapRef.current?.zoomTo(currentZoom - 1)
								}}
							>
								<FaMinus />
							</Button>
							<Button
								className='join-item gap-1'
								onClick={() => {
									setZoomLocked(!zoomLocked)
									setLockedZoom(zoom)
								}}
							>
								{zoomLocked ? <FaLock /> : <FaLockOpen />}
								<span className='font-mono'>{zoom}</span>
							</Button>
							<Button
								className='btn-square join-item'
								onClick={() => {
									if (zoomLocked) setLockedZoom(Math.min(lockedZoom + 1, 22))
									else mapRef.current?.zoomTo(currentZoom + 1)
								}}
							>
								<FaPlus />
							</Button>
						</div>
						<Select
							className='w-fit'
							value={style}
							onChange={(e) => {
								const s = e.target.value as MapStyle
								setStyle(s)
								mapRef.current?.setStyle(`mapbox://styles/mapbox/${s}`)
							}}
						>
							{Object.entries(STYLES).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</Select>
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
