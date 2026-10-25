import type { FeatureCollection } from 'geojson'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import type { MapRegion } from './map-config'
import { boundsToGrid, line, tile2lat, tile2lng } from './tile-math'

export const syncTileGrid = (map: mapboxgl.Map, show: boolean, { bounds, zoom }: MapRegion) => {
	const source = map.getSource<mapboxgl.GeoJSONSource>('tile-grid')

	if (!show) {
		if (source) map.setLayoutProperty('tile-grid-lines', 'visibility', 'none')
		return
	}

	const { cols, rows } = boundsToGrid(bounds)
	if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return

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

	const data: FeatureCollection = { type: 'FeatureCollection', features }

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

export const getPosition = () =>
	new Promise<GeolocationPosition>((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(resolve, reject)
	})
		.then((p) => [p.coords.longitude, p.coords.latitude] satisfies [number, number])
		.catch(() => [-74.006, 40.7128] satisfies [number, number])
