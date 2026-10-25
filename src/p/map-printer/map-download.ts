import { toast } from 'https://esm.sh/@trenaryja/ui'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import {
	CANVAS_MAX_TILES_PER_DIM,
	CANVAS_MAX_TILE_AREA,
	type ChunkPlacement,
	type DownloadRequest,
	type Format,
	type MapRegion,
	type Piece,
	TILE_BATCH_SIZE,
	TILE_SIZE,
	type TileSource,
} from './map-config'
import { boundsToGrid, formatBytes, planChunks } from './tile-math'

export const chunkPieces = ({ bounds, zoom, style }: TileSource, chunk: ChunkPlacement) =>
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

export const encodeChunk = async (canvas: OffscreenCanvas, format: Format, chunk: ChunkPlacement) => {
	const type = format === 'jpg' ? 'image/jpeg' : 'image/png'

	try {
		return await canvas.convertToBlob({ type, ...(format === 'jpg' && { quality: 0.92 }) })
	} catch (error) {
		throw new Error(
			`convertToBlob failed for chunk r${chunk.chunkY}c${chunk.chunkX} (${canvas.width}x${canvas.height}px). Detected limits: ${CANVAS_MAX_TILES_PER_DIM * TILE_SIZE}px/dim, ${CANVAS_MAX_TILE_AREA} tile area. ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		)
	}
}

export const saveBlob = (blob: Blob, name: string) => {
	const url = URL.createObjectURL(blob)
	Object.assign(document.createElement('a'), { download: name, href: url }).click()
	URL.revokeObjectURL(url)
}

export const downloadMap = async ({ bounds, zoom, format, style, filename }: DownloadRequest) => {
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

		// serial on purpose: each chunk holds a full-size OffscreenCanvas, so overlapping them multiplies peak memory
		for (const [index, chunk] of chunks.entries()) {
			signal.throwIfAborted()

			const chunkLabel = multiFile ? ` (part ${index + 1}/${totalChunks})` : ''
			const canvas = new OffscreenCanvas(chunk.colsInChunk * TILE_SIZE, chunk.rowsInChunk * TILE_SIZE)
			const ctx = canvas.getContext('2d')
			if (!ctx) throw new Error('Could not create canvas context')

			const pieces = chunkPieces({ bounds, zoom, style }, chunk)

			// batch, don't flatten to one Promise.all — TILE_BATCH_SIZE caps concurrent tile fetches so Mapbox doesn't 429
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
export const defaultFilename = ({
	map,
	bounds,
	zoom,
	format,
}: MapRegion & { map: mapboxgl.Map | null; format: Format }) => {
	const northWest = map?.getBounds().getNorthWest()
	if (!northWest) return null
	const { cols, rows } = boundsToGrid(bounds)
	return `map_z${zoom}_[${northWest.lat.toFixed(4)}_${northWest.lng.toFixed(4)}]_${cols}x${rows}.${format}`
}
