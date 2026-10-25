import { makeTypeGuard } from 'https://esm.sh/@trenaryja/ui'

export const TILE_SIZE = 1024
export const TILE_BATCH_SIZE = 12
export const BYTES_PER_PIXEL = { png: 0.45, jpg: 0.23 } as const
export const DEFAULT_ZOOM = 12
export const MIN_ZOOM = 1
export const MAX_ZOOM = 22

export const STYLES = {
	'streets-v12': 'Streets',
	'dark-v11': 'Dark',
	'light-v11': 'Light',
	'outdoors-v12': 'Outdoors',
	'satellite-v9': 'Satellite',
	'satellite-streets-v12': 'Satellite Streets',
	'navigation-day-v1': 'Navigation Day',
	'navigation-night-v1': 'Navigation Night',
} as const

export type MapStyle = keyof typeof STYLES
export const isMapStyle = (value: string): value is MapStyle => Object.hasOwn(STYLES, value)

export const FORMATS = ['png', 'jpg'] as const
export type Format = (typeof FORMATS)[number]
export const isFormat = makeTypeGuard(FORMATS)

export type TileBounds = { north: number; south: number; east: number; west: number }

/** The map's visible corners in degrees. Zoom-independent, so it is what the component stores. */
export type GeoBounds = { north: number; south: number; east: number; west: number }

export type Piece = { url: string; dx: number; dy: number }

/** The tile rectangle currently framed by the map, at the zoom level it is read at. */
export type MapRegion = { bounds: TileBounds; zoom: number }

/** Everything needed to address a Mapbox raster tile. */
export type TileSource = MapRegion & { style: MapStyle }

export type DownloadRequest = TileSource & { format: Format; filename?: string }

/** One output file's slice of the grid: where it starts and how many tiles it covers. */
export type ChunkPlacement = {
	chunkX: number
	chunkY: number
	startCol: number
	startRow: number
	colsInChunk: number
	rowsInChunk: number
}

export const ZERO_BOUNDS: TileBounds = { north: 0, south: 0, east: 0, west: 0 }
export const DEFAULT_MAP_STYLE: Record<'dark' | 'light', MapStyle> = { dark: 'dark-v11', light: 'light-v11' }

export const { CANVAS_MAX_TILES_PER_DIM, CANVAS_MAX_TILE_AREA } = (() => {
	const test = (w: number, h: number) => {
		try {
			const c = new OffscreenCanvas(w, h)
			const ctx = c.getContext('2d')
			if (!ctx) return false
			ctx.fillRect(0, 0, 1, 1)
			return (ctx.getImageData(0, 0, 1, 1).data[3] ?? 0) > 0
		} catch {
			return false
		}
	}

	const search = (high: number, ok: (n: number) => boolean) => {
		let lo = 1
		let hi = high

		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2)
			if (ok(mid)) lo = mid
			else hi = mid - 1
		}

		return lo
	}

	const maxDim = search(32, (n) => test(n * TILE_SIZE, TILE_SIZE))
	const maxArea = search(maxDim ** 2, (n) => {
		const side = Math.min(Math.ceil(Math.sqrt(n)), maxDim)
		const other = Math.ceil(n / side)
		return other <= maxDim && test(side * TILE_SIZE, other * TILE_SIZE)
	})
	return { CANVAS_MAX_TILES_PER_DIM: maxDim, CANVAS_MAX_TILE_AREA: maxArea }
})()
