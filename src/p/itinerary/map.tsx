import { cn } from 'https://esm.sh/@trenaryja/ui'
import {
	geoGraticule10,
	geoInterpolate,
	geoNaturalEarth1Raw,
	geoOrthographicRaw,
	geoPath,
	geoProjection,
	geoRotation,
} from 'https://esm.sh/d3-geo'
import React, { type ComponentProps, useEffect, useLayoutEffect, useRef, useState } from 'https://esm.sh/react'
import { LuMoveDiagonal } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'
import { BORDERS, JsonText, LAND, type Leg } from './data'
import { Choice } from './views'

const SPHERE = { type: 'Sphere' } as const
const GRATICULE = geoGraticule10()
const WIDTH = 480
const FLIGHT_MS = 450
const MORPH_MS = 600
/** The flat view; swaps for any projection whose y follows latitude alone and whose x per radian of longitude shrinks no faster than cos(latitude) */
const FLAT = geoNaturalEarth1Raw
/** A blend `flatness` of the way folds the far side over itself past acos(-EQUATOR_SCALE × flatness / (1 − flatness)) of longitude from center */
const [EQUATOR_SCALE] = FLAT(1, 0)
const DOCK_KEY = 'itinerary-globe-dock'
const RESIZE_KEYS = new Map([
	['ArrowUp', 16],
	['ArrowRight', 16],
	['ArrowDown', -16],
	['ArrowLeft', -16],
])

export type Here = { coordinates: [number, number]; label: string }

/** Pointer drags past a 4px slop, as offsets from the press; `dragged()` stays true through the click a drag ends with */
const useDrag = <From,>(from: From, onMove: (from: From, dx: number, dy: number) => void) => {
	const pressRef = useRef<{ x: number; y: number; from: From; moved: boolean }>(null)
	const handlers = {
		onPointerDown: (e: React.PointerEvent) =>
			void (pressRef.current = { x: e.clientX, y: e.clientY, from, moved: false }),
		onPointerMove: (e: React.PointerEvent) => {
			const start = pressRef.current
			if (!start || !e.buttons) return
			const dx = e.clientX - start.x
			const dy = e.clientY - start.y
			if (!start.moved && Math.hypot(dx, dy) < 4) return
			if (!start.moved) e.currentTarget.setPointerCapture(e.pointerId)
			start.moved = true
			onMove(start.from, dx, dy)
		},
		// The click fires after pointerup, so the press clears on the next task
		onPointerUp: () => setTimeout(() => (pressRef.current = null), 0),
	}
	return [handlers, () => !!pressRef.current?.moved] as const
}

/** Eases the view's center to `target` over 900ms */
const useCenter = (target: [number, number]) => {
	const [center, setCenter] = useState(target)
	const [longitude, latitude] = target
	useEffect(() => {
		let interpolate: ((t: number) => [number, number]) | undefined
		let started: number | undefined
		let frame = requestAnimationFrame(function step(time) {
			started ??= time
			const t = Math.min(1, (time - started) / 900)
			setCenter((current) => (interpolate ??= geoInterpolate(current, [longitude, latitude]))(1 - (1 - t) ** 3))
			if (t < 1) frame = requestAnimationFrame(step)
		})
		return () => cancelAnimationFrame(frame)
	}, [longitude, latitude])
	return [center, setCenter] as const
}

/** Eases from 0 (globe) to 1 (flat) and back, from wherever a switch caught it */
const useFlatness = (flat: boolean) => {
	const [flatness, setFlatness] = useState(flat ? 1 : 0)
	useEffect(() => {
		let from: number | undefined
		let started: number | undefined
		let frame = requestAnimationFrame(function step(time) {
			started ??= time
			const t = Math.min(1, (time - started) / MORPH_MS)
			setFlatness((current) => {
				from ??= current
				return from + ((flat ? 1 : 0) - from) * t * t * (3 - 2 * t)
			})
			if (t < 1) frame = requestAnimationFrame(step)
		})
		return () => cancelAnimationFrame(frame)
	}, [flat])
	return flatness
}

/** Radians of longitude either side of center the blend shows before it folds: 90° as a globe, all 180° from a little past halfway flat */
const reachOf = (flatness: number) => Math.acos(Math.max(-1, (-EQUATOR_SCALE * flatness) / (1 - flatness)))

/** Orthographic blended toward Natural Earth by `flatness`; longitudes past `reach` collapse onto it, so fills end there as if clipped */
const blended = (flatness: number, reach: number) =>
	geoProjection((x, y) => {
		const longitude = R.clamp(x, { min: -reach, max: reach })
		const [globeX, globeY] = geoOrthographicRaw(longitude, y)
		const [flatX, flatY] = FLAT(longitude, y)
		return [globeX + flatness * (flatX - globeX), globeY + flatness * (flatY - globeY)]
	})

export const RouteMap = (props: {
	legs: Leg[]
	now: number
	here?: Here
	selectedId?: string
	flat: boolean
	onSelect: (id: string) => void
}) => {
	const { legs, here, selectedId } = props
	const flatness = useFlatness(props.flat)
	const selected = legs.find((leg) => leg.id === selectedId)
	const [center, setCenter] = useCenter(
		selected
			? geoInterpolate(selected.origin.coordinates, selected.destination.coordinates)(0.5)
			: (here?.coordinates ?? [0, 20]),
	)
	const [drag, dragged] = useDrag(center, (from, dx, dy) =>
		setCenter([from[0] - dx / 3, R.clamp(from[1] + dy / 3, { min: -80, max: 80 })]),
	)
	const height = WIDTH - (WIDTH / 2) * flatness
	const rotation: [number, number] = [-center[0], -center[1] * (1 - flatness)]
	const reach = reachOf(flatness)
	// A globe clips at its rim; any flatter, the antimeridian splits what the blend would tear
	const projection = blended(flatness, reach)
		.rotate(rotation)
		.clipAngle(flatness ? null : 90)
		.fitExtent(
			[
				[8, 8],
				[WIDTH - 8, height - 8],
			],
			SPHERE,
		)
	const path = geoPath(projection)
	const onFace = (coordinates: [number, number]) =>
		Math.abs(geoRotation(rotation)(coordinates)[0]) < (reach * 180) / Math.PI
	const dot = (coordinates: [number, number]) => {
		const [cx = 0, cy = 0] = projection(coordinates) ?? []
		return { cx, cy }
	}
	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${height}`}
			className='route-map w-full'
			role='img'
			aria-label='Map of the flight route'
			{...drag}
		>
			<path className='sphere' d={path(SPHERE) ?? ''} />
			<path className='graticule' d={path(GRATICULE) ?? ''} />
			<path className='land' d={path(LAND) ?? ''} />
			<path className='borders' d={path(BORDERS) ?? ''} />
			{R.sortBy(legs, (leg) => leg.id === selectedId).map((leg) => {
				const d = path({ type: 'LineString', coordinates: [leg.origin.coordinates, leg.destination.coordinates] }) ?? ''
				const status = leg.id === selectedId ? 'selected' : leg.end <= props.now ? 'flown' : 'upcoming'
				return (
					<g key={leg.id} className={`route route-${status}`} onClick={() => !dragged() && props.onSelect(leg.id)}>
						<title>{`${leg.number} · ${leg.origin.city} → ${leg.destination.city}`}</title>
						<path className='route-hit' d={d} />
						<path className='route-line' d={d} />
					</g>
				)
			})}
			{R.uniqueBy(
				legs.flatMap((leg) => [leg.origin, leg.destination]),
				(airport) => airport.code,
			)
				.filter((airport) => onFace(airport.coordinates))
				.map((airport) => (
					<circle key={airport.code} className='airport' r={3.5} {...dot(airport.coordinates)}>
						<title>{`${airport.code} · ${airport.city}`}</title>
					</circle>
				))}
			{here && onFace(here.coordinates) && (
				<circle className='here' r={6} {...dot(here.coordinates)}>
					<title>{here.label}</title>
				</circle>
			)}
		</svg>
	)
}

/** The centered box of `aspect` (width over height) that fills `rect` */
const fitIn = (rect: DOMRect, aspect: number) => {
	const width = Math.min(rect.width, rect.height * aspect)
	return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - width / aspect) / 2, width }
}

const Dock = JsonText.pipe(z.object({ size: z.number(), right: z.number(), bottom: z.number() })).catch({
	size: 144,
	right: 16,
	bottom: 16,
})

/** The docked map's box inside the viewport; a flat map docks twice as wide as tall, with the area of a globe `size` across */
const fitDock = (spot: z.output<typeof Dock>, flat: boolean) => {
	const stretch = flat ? Math.SQRT2 : 1
	const size = Math.round(
		R.clamp(spot.size, {
			min: 96,
			max: Math.min((innerWidth - 32) / stretch, (innerHeight - 32) * stretch),
		}),
	)
	const width = size * stretch
	const height = size / stretch
	return {
		size,
		width,
		height,
		right: R.clamp(spot.right, { min: 8, max: innerWidth - width - 8 }),
		bottom: R.clamp(spot.bottom, { min: 8, max: innerHeight - height - 8 }),
	}
}

/** Once the map is half scrolled off the top, it flies to a button you can drag and resize, and flies back as the map returns */
export const RouteCard = (props: Omit<ComponentProps<typeof RouteMap>, 'flat'>) => {
	const [view, setView] = useState('Globe')
	const flat = view === 'Flat'
	const [docked, setDocked] = useState(false)
	/** Stays true while the globe flies home, so the button outlives `docked` */
	const [shown, setShown] = useState(false)
	const [spot, setSpot] = useState(() => Dock.parse(localStorage.getItem(DOCK_KEY)))
	const box = fitDock(spot, flat)
	const [drag, dragged] = useDrag(box, (from, dx, dy) =>
		setSpot({ size: from.size, right: from.right - dx, bottom: from.bottom - dy }),
	)
	const resize = (size: number) => setSpot({ size, right: box.right, bottom: box.bottom })
	const map = useRef<HTMLDivElement>(null)
	const dock = useRef<HTMLDivElement>(null)
	/** 0 at rest in the corner, 1 over the map; a reversed flight starts where the last one stopped */
	const progress = useRef(1)

	useEffect(() => {
		const check = () => {
			const rect = map.current?.getBoundingClientRect()
			const isDocked = !!rect && rect.top + rect.height / 2 < 0
			setDocked(isDocked)
			if (isDocked) setShown(true)
		}
		check()
		addEventListener('scroll', check, { passive: true })
		return () => removeEventListener('scroll', check)
	}, [])

	useEffect(() => localStorage.setItem(DOCK_KEY, JSON.stringify(spot)), [spot])

	useLayoutEffect(() => {
		const dockBox = dock.current
		const mapBox = map.current
		if (!dockBox || !mapBox) return
		const goal = docked ? 0 : 1
		dockBox.style.transform = ''
		const rest = dockBox.getBoundingClientRect()
		// Reads the map's box every frame, so the globe tracks it through a scroll
		const place = () => {
			const t = progress.current
			const k = t * t * (3 - 2 * t)
			const target = fitIn(mapBox.getBoundingClientRect(), rest.width / rest.height)
			dockBox.style.transform = `translate(${(target.left - rest.left) * k}px, ${(target.top - rest.top) * k}px) scale(${1 + (target.width / rest.width - 1) * k})`
		}
		place()
		let last = performance.now()
		let frame = requestAnimationFrame(function step(time) {
			const delta = Math.sign(goal - progress.current) * ((time - last) / FLIGHT_MS)
			last = time
			progress.current = R.clamp(progress.current + delta, { min: 0, max: 1 })
			place()
			if (progress.current !== goal) frame = requestAnimationFrame(step)
			else if (goal === 1) setShown(false)
		})
		return () => cancelAnimationFrame(frame)
	}, [shown, docked, spot, flat])

	return (
		<section className='surface panel card-body gap-3 p-4 lg:sticky lg:top-6'>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<h2 className='card-title'>Route</h2>
				<Choice options={['Globe', 'Flat']} value={view} onChange={setView} />
			</div>
			<div ref={map} className={cn(shown && 'invisible')}>
				<RouteMap {...props} flat={flat} />
			</div>
			{shown && (
				<div
					ref={dock}
					className='fixed z-40 origin-top-left'
					style={{ width: box.width, height: box.height, right: box.right, bottom: box.bottom }}
				>
					<button
						type='button'
						aria-label='Back to the route map'
						className={cn(
							'btn size-full touch-none p-0 shadow-lg *:pointer-events-none',
							flat ? 'rounded-box' : 'btn-circle',
						)}
						{...drag}
						onClick={() => !dragged() && map.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
					>
						<RouteMap {...props} flat={flat} />
					</button>
					{docked && (
						<div
							role='slider'
							tabIndex={0}
							aria-label='Map size'
							aria-valuenow={box.size}
							aria-valuemin={96}
							aria-valuemax={fitDock({ ...spot, size: Infinity }, flat).size}
							className='btn btn-circle btn-xs absolute top-0 left-0 cursor-nwse-resize touch-none'
							onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
							onPointerMove={(e) => {
								const rect = dock.current?.getBoundingClientRect()
								if (rect && e.currentTarget.hasPointerCapture(e.pointerId))
									resize(
										box.size * Math.max((rect.right - e.clientX) / box.width, (rect.bottom - e.clientY) / box.height),
									)
							}}
							onKeyDown={(e) => {
								const step = RESIZE_KEYS.get(e.key)
								if (step) resize(box.size + step)
							}}
						>
							<LuMoveDiagonal />
						</div>
					)}
				</div>
			)}
		</section>
	)
}
