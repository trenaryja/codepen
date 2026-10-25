import {
	Button,
	RadioGroup,
	ThemeProvider,
	Toaster,
	cn,
	daisyThemeMap,
	isDaisyThemeName,
	useTheme,
} from 'https://esm.sh/@trenaryja/ui'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import React, { useEffect, useEffectEvent, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { FaBorderAll } from 'https://esm.sh/react-icons/fa'
import {
	DEFAULT_MAP_STYLE,
	DEFAULT_ZOOM,
	FORMATS,
	type Format,
	type GeoBounds,
	MAX_ZOOM,
	MIN_ZOOM,
	type MapStyle,
	ZERO_BOUNDS,
	isFormat,
} from './map-config'
import { DownloadButton, LocateButton, MapStats, StyleSelect, ZoomControl } from './map-controls'
import { getPosition, syncTileGrid } from './map-layers'
import { getGeoBounds, toTileBounds } from './tile-math'

import { env } from './env'

// Set via .env.local locally, Vercel env vars for deploys — see .env.example
mapboxgl.accessToken = env.VITE_MAPBOX_TOKEN

const MapPrinter = () => {
	const { resolvedTheme } = useTheme()
	const colorScheme = isDaisyThemeName(resolvedTheme) ? daisyThemeMap[resolvedTheme].colorScheme : 'dark'

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

		void getPosition().then((center) => {
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
				<nav className='bg-base-100/50 rounded-box fixed top-2 left-1/2 grid w-fit -translate-x-1/2 gap-2 p-2 shadow-lg backdrop-blur'>
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
							options={FORMATS}
							value={format}
							onChange={(e) => isFormat(e.target.value) && setFormat(e.target.value)}
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

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(
	<ThemeProvider>
		<MapPrinter />
	</ThemeProvider>,
)
