import type { Feature } from 'geojson'
import { gcd } from 'https://esm.sh/@trenaryja/ui'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import { CANVAS_MAX_TILES_PER_DIM, CANVAS_MAX_TILE_AREA, type GeoBounds, type TileBounds } from './map-config'

export const lng2tile = (lng: number, zoom: number) => Math.floor(((lng + 180) / 360) * 2 ** zoom)
export const lat2tile = (lat: number, zoom: number) =>
	Math.floor(
		((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom,
	)
export const tile2lng = (x: number, zoom: number) => (x / 2 ** zoom) * 360 - 180
export const tile2lat = (y: number, zoom: number) =>
	(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI

export const getRatio = (w: number, h: number) => {
	const divisor = gcd(w, h)
	return `${w}:${h}${divisor === 1 ? '' : ` (${w / divisor}:${h / divisor})`}`
}

export const formatBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
	return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export const boundsToGrid = (bounds: TileBounds) => ({
	cols: Math.abs(bounds.west - bounds.east) + 1,
	rows: Math.abs(bounds.north - bounds.south) + 1,
})

export const line = (coords: [number, number][]): Feature => ({
	type: 'Feature',
	properties: {},
	geometry: { type: 'LineString', coordinates: coords },
})

export const getGeoBounds = (map: mapboxgl.Map): GeoBounds => {
	const geoBounds = map.getBounds()
	return {
		north: geoBounds.getNorth(),
		south: geoBounds.getSouth(),
		east: geoBounds.getEast(),
		west: geoBounds.getWest(),
	}
}

/** Which tiles cover a geographic box at a given zoom. Pure, so the same box re-projects for free. */
export const toTileBounds = ({ north, south, east, west }: GeoBounds, zoom: number): TileBounds => ({
	north: lat2tile(north, zoom),
	south: lat2tile(south, zoom),
	east: lng2tile(east, zoom),
	west: lng2tile(west, zoom),
})

export const chunkGrid = (cols: number, rows: number) => {
	const chunkCols = Math.max(1, Math.min(CANVAS_MAX_TILES_PER_DIM, cols))
	const chunkRows = Math.max(1, Math.min(CANVAS_MAX_TILES_PER_DIM, Math.floor(CANVAS_MAX_TILE_AREA / chunkCols), rows))
	return { chunkCols, chunkRows, chunksX: Math.ceil(cols / chunkCols), chunksY: Math.ceil(rows / chunkRows) }
}

/** Flattens the grid into one placement per output file, in row-major order. */
export const planChunks = (cols: number, rows: number) => {
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
