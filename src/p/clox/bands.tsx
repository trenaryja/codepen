import React from 'https://esm.sh/react'
import { type Place, useSettings } from './board'
import {
	type City,
	DAY,
	HOUR,
	QUARTER_HOUR,
	dayDelta,
	dayDeltaLabel,
	formatSignedGap,
	formatTime,
	hourLabel,
	isUtc,
	localMs,
	solarAltitude,
	zoneOffset,
} from './time'

const BAND_SAMPLE = HOUR / 2 // civil twilight lasts about one half-hour stop, so the gradient interpolates it softly
const LABEL_STEP = 3 * HOUR

// Wall-clock tick → instant. The offset sampled at the tick itself can be stale near a DST edge; one resample fixes it
const instantOfLocal = (timeZone: string, local: number) =>
	local - zoneOffset(timeZone, local - zoneOffset(timeZone, local))

// Day/night at this city across the window, as evenly spaced gradient stops. Tones nudge the theme's own
// base-200 lighter (day) or darker (night) in oklch — base-100/base-300 alone are near-identical in dark
// themes. Nightness ramps over 0…-6°, the same civil-twilight cutoff WeatherChip picks day icons by
const bandGradient = (city: City, start: number) =>
	`linear-gradient(90deg, ${Array.from({ length: DAY / BAND_SAMPLE + 1 }, (_, index) => {
		const altitude = solarAltitude(start + index * BAND_SAMPLE, city.latitude, city.longitude)
		const night = Math.min(1, Math.max(0, -altitude / 6))
		return `oklch(from var(--color-base-200) calc(l + ${(0.06 - 0.18 * night).toFixed(3)}) c h)`
	}).join(',')})`

// The whole row is the band: meta rides on top of the gradient, so bars get the full width
// and the row auto-sizes to its content before growing into the leftover screen
const BandRow = ({ label, city, start }: { label: string; city: City; start: number }) => {
	const { instant, reference, hour12, showSeconds } = useSettings()
	const gap = zoneOffset(city.timeZone, instant) - zoneOffset(reference.timeZone, instant)
	const delta = dayDelta(city.timeZone, reference.timeZone, instant)
	const firstTick = Math.ceil(localMs(city.timeZone, start) / LABEL_STEP) * LABEL_STEP
	return (
		<div
			className='rounded-field bg-base-200 relative grow overflow-hidden'
			style={isUtc(city) ? undefined : { background: bandGradient(city, start) }}
		>
			<div className='flex items-baseline justify-between gap-2 p-2 pb-5 sm:gap-3 sm:p-3 sm:pb-3'>
				<div className='flex min-w-0 items-baseline gap-2'>
					<span className='truncate font-medium'>{label}</span>
					{city.name.toLowerCase() !== label.toLowerCase() && (
						<span className='truncate text-xs tracking-wider uppercase opacity-40'>{city.name}</span>
					)}
					{delta !== 0 && <span className='badge badge-sm'>{dayDeltaLabel(delta)}</span>}
				</div>
				{/* time anchors right so an extra digit grows into the slack instead of shifting the row */}
				<div className='flex items-baseline gap-2 font-mono whitespace-nowrap'>
					<span className='text-xs opacity-60 sm:text-sm'>{formatSignedGap(gap)}</span>
					<span className='text-xl font-extralight tracking-tight sm:text-2xl'>
						{formatTime({ instant, timeZone: city.timeZone, hour12, seconds: showSeconds })}
					</span>
				</div>
			</div>
			{Array.from({ length: DAY / LABEL_STEP }, (_, index) => firstTick + index * LABEL_STEP).map((tick, index) => (
				<span
					key={tick}
					// narrow bars fit only every other label — a 6h rhythm instead of colliding 3h ones
					className={`absolute bottom-1 -translate-x-1/2 text-xs opacity-40 ${index % 2 ? 'max-sm:hidden' : ''}`}
					style={{ left: `${((instantOfLocal(city.timeZone, tick) - start) / DAY) * 100}%` }}
				>
					{hourLabel(Math.floor(tick / HOUR) % 24, hour12)}
				</span>
			))}
		</div>
	)
}

// How far you've travelled and the way back. Nothing to say at rest: the board is one turn of the clock,
// so every card already carries its own offset and its own today/tomorrow — no calendar date required.
// It stays mounted and merely hides, so the row it reserves is its own content's height and a scrub
// shoves nothing below it. `invisible` over `opacity-0` so the hidden button can't be clicked or tabbed to
export const InstantStrip = ({
	now,
	scrubbed,
	onSettle,
}: {
	now: number
	scrubbed: number | null
	onSettle: (target: number | null) => void
}) => {
	const { instant } = useSettings()
	return (
		<div
			className={`flex items-center justify-center gap-3 text-sm sm:text-base ${scrubbed === null ? 'invisible' : 'opacity-70'}`}
		>
			<span className='font-mono'>{formatSignedGap(instant - now)}</span>
			<button type='button' className='btn btn-xs' onClick={() => onSettle(null)}>
				↺ now
			</button>
		</div>
	)
}

export const BandsView = ({
	places,
	now,
	scrubbed,
	onScrub,
	onSettle,
}: {
	places: Place[]
	now: number
	scrubbed: number | null
	onScrub: (instant: number) => void
	onSettle: (target: number | null) => void
}) => {
	const { instant } = useSettings()
	// ±12h around now, floored to the scrub grain so bars and labels don't creep a hair every tick
	const start = Math.floor(now / QUARTER_HOUR) * QUARTER_HOUR - DAY / 2

	const instantAt = (surface: HTMLElement, clientX: number) => {
		const { left, width } = surface.getBoundingClientRect()
		return start + Math.min(1, Math.max(0, (clientX - left) / width)) * DAY
	}

	return (
		<main className='mx-auto flex w-full max-w-6xl grow flex-col p-3 sm:p-4'>
			<InstantStrip now={now} scrubbed={scrubbed} onSettle={onSettle} />
			{/* Rows share the leftover height; the container is the drag surface so one line
			    crosses every bar, gaps included. Keyboard scrubbing stays on the global arrow keys */}
			<div
				className='relative flex grow cursor-ew-resize touch-none flex-col gap-2 select-none'
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId)
					onScrub(instantAt(event.currentTarget, event.clientX))
				}}
				onPointerMove={(event) => {
					if (event.buttons) onScrub(instantAt(event.currentTarget, event.clientX))
				}}
				onPointerUp={(event) =>
					onSettle(Math.round(instantAt(event.currentTarget, event.clientX) / QUARTER_HOUR) * QUARTER_HOUR)
				}
			>
				{places.map((place) => (
					<BandRow key={place.id} label={place.label} city={place.city} start={start} />
				))}
				<div
					className='border-base-content/40 pointer-events-none absolute inset-y-0 border-l'
					style={{ left: `${((Math.min(start + DAY, Math.max(start, instant)) - start) / DAY) * 100}%` }}
				/>
			</div>
		</main>
	)
}
