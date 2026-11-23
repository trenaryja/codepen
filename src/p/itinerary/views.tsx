import { cn, css, getDuration } from 'https://esm.sh/@trenaryja/ui'
import { geoDistance } from 'https://esm.sh/d3-geo'
import React, { useEffect, useState } from 'https://esm.sh/react'
import { LuBedDouble, LuCheck, LuClock, LuMapPin, LuPlane } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { type Airport, DAY, type Leg, type Place, type TripEvent, dateKey, statusOf } from './data'

const SHORT_DAY = { weekday: 'short', month: 'short', day: 'numeric' } as const
const COUNTDOWN_UNITS = ['days', 'hours', 'minutes', 'seconds'] as const
const ICONS = { flight: LuPlane, layover: LuClock, stay: LuBedDouble, leave: LuMapPin, return: LuMapPin }
const STATUS_TONES = {
	done: 'bg-primary text-primary-content',
	now: 'bg-accent text-accent-content',
	upcoming: 'bg-base-300',
}

const nightsBetween = (start: number, end: number, timeZone: string) =>
	Math.round((Date.parse(dateKey(end, timeZone)) - Date.parse(dateKey(start, timeZone))) / DAY)
const formatTime = (time: number, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(time)
const formatSpan = (ms: number) =>
	new Intl.DurationFormat('en-US', { style: 'narrow' }).format(
		getDuration({ start: new Date(0), end: new Date(ms), units: ['hours', 'minutes'] }),
	)
const formatUnit = (value: number, unit: string, unitDisplay: 'short' | 'long' = 'short') =>
	new Intl.NumberFormat('en-US', { style: 'unit', unit, unitDisplay, maximumFractionDigits: 0 }).format(value)

export const useNow = (intervalMs: number) => {
	const [now, setNow] = useState(Date.now)
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs)
		return () => clearInterval(timer)
	}, [intervalMs])
	return now
}

export const Choice = <Option extends string>(props: {
	options: readonly Option[]
	value: Option
	onChange: (option: Option) => void
}) => (
	<div className='join'>
		{props.options.map((option) => (
			<input
				key={option}
				type='radio'
				name={props.options.join(',')}
				className='join-item btn btn-sm'
				aria-label={option}
				checked={option === props.value}
				onChange={() => props.onChange(option)}
			/>
		))}
	</div>
)

/** Ticks its own one-second clock; the trip's shared `now` only moves once a minute */
export const Countdown = ({ legs, events }: { legs: Leg[]; events: TripEvent[] }) => {
	const now = useNow(1000)
	const event = events.find((x) => statusOf(x, now) === 'now')
	const leg = event?.leg ?? legs.find((x) => now < x.start)
	if (!leg) return <div className='surface panel card-body text-3xl font-black'>Trip complete</div>
	const flying = !!event?.leg
	// Not @trenaryja/ui's useDuration: its effect keys on the Date object, so a target built during render loops forever
	const duration = getDuration({
		start: new Date(now),
		end: new Date(flying ? leg.end : leg.start),
		units: COUNTDOWN_UNITS,
	})
	const where = flying
		? `In the air on ${leg.number}`
		: event?.kind === 'layover'
			? `Layover in ${event.place.title}`
			: event && `In ${event.place.title}`
	return (
		<div className='surface panel card-body gap-4'>
			{where && <span className='badge badge-soft badge-accent'>{where}</span>}
			<h2 className='text-lg font-semibold'>
				{flying ? `Landing in ${leg.stop.title} in` : `${leg.number} to ${leg.stop.title} departs in`}
			</h2>
			<div className='flex gap-3 sm:gap-5'>
				{COUNTDOWN_UNITS.map((unit) => (
					<div key={unit} className='flex flex-col'>
						<span className='countdown font-mono text-4xl sm:text-5xl'>
							<span style={css({ '--value': duration[unit], '--digits': 2 })} aria-label={String(duration[unit])}>
								{duration[unit]}
							</span>
						</span>
						<span className='text-xs opacity-60'>{unit}</span>
					</div>
				))}
			</div>
		</div>
	)
}

export const Stats = ({ legs }: { legs: readonly [Leg, ...Leg[]] }) => {
	const [first] = legs
	const last = legs.at(-1) ?? first
	const timeZone = first.origin.timeZone
	const km = 6371 * R.sumBy(legs, (leg) => geoDistance(leg.origin.coordinates, leg.destination.coordinates))
	const dates = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' })
	return (
		<div className='grid grid-cols-2 gap-2'>
			{[
				['Flights', legs.length],
				['Distance', formatUnit(km, 'kilometer'), formatUnit(km / 1.609344, 'mile')],
				['In the air', formatSpan(R.sumBy(legs, (leg) => leg.end - leg.start))],
				[
					'Duration',
					formatUnit(nightsBetween(first.start, last.end, timeZone), 'day', 'long'),
					dates.formatRange(first.start, last.end),
				],
			].map(([title, value, detail]) => (
				<div key={title} className='surface panel px-4 py-3'>
					<div className='stat-title'>{title}</div>
					<div className='stat-value text-xl sm:text-2xl'>{value}</div>
					<div className='stat-desc'>{detail}</div>
				</div>
			))}
		</div>
	)
}

const Endpoint = (props: { airport: Airport; place: string; time: number; local: boolean; className?: string }) => {
	const timeZone = props.local ? props.airport.timeZone : undefined
	return (
		<div className={props.className}>
			<div className='text-2xl font-black'>{props.airport.code}</div>
			<div className='text-sm font-semibold'>
				{formatTime(props.time, timeZone, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
			</div>
			<div className='text-xs opacity-60'>
				{props.place}
				<br />
				{formatTime(props.time, timeZone, SHORT_DAY)}
			</div>
		</div>
	)
}

type ItineraryProps = { selected?: string; onSelect: (id: string) => void }

const FlightCard = (props: ItineraryProps & { leg: Leg; place: Place; status: string; local: boolean }) => {
	const { leg, status, local } = props
	return (
		<button
			type='button'
			aria-pressed={leg.id === props.selected}
			onClick={() => props.onSelect(leg.id)}
			className={cn(
				'btn btn-block outline-accent h-auto flex-col items-stretch gap-3 p-4 text-left font-normal aria-pressed:outline-2',
				status === 'done' && 'opacity-60',
			)}
		>
			<div className='flex items-center justify-between gap-2 text-sm'>
				<span className='font-bold'>{leg.number}</span>
				{status === 'now' ? (
					<span className='badge badge-accent badge-sm'>In the air</span>
				) : (
					<span className='opacity-60'>{formatSpan(leg.end - leg.start)}</span>
				)}
			</div>
			<div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2'>
				<Endpoint airport={leg.origin} place={props.place.title} time={leg.start} local={local} />
				<LuPlane className='opacity-40' />
				<Endpoint
					airport={leg.destination}
					place={leg.stop.title}
					time={leg.end}
					local={local}
					className='text-right'
				/>
			</div>
		</button>
	)
}

const StayCard = ({ event, status, local }: { event: TripEvent; status: string; local: boolean }) => {
	const { place } = event
	const when = (time: number) => formatTime(time, local ? event.airport.timeZone : undefined, SHORT_DAY)
	const [title, dates] =
		event.kind === 'leave'
			? [`Leaving ${place.title}`, `Departing ${when(event.end)}`]
			: event.kind === 'return'
				? [`Ending in ${place.title}`, when(event.start)]
				: [place.title, `${when(event.start)} → ${when(event.end)}`]
	return (
		<div className='surface panel card-body gap-1 p-4'>
			<div className='flex flex-wrap items-center gap-2'>
				<h3 className='font-bold'>{title}</h3>
				{event.kind === 'stay' && (
					<span className='badge badge-sm'>{nightsBetween(event.start, event.end, event.airport.timeZone)} nights</span>
				)}
				{status === 'now' && <span className='badge badge-soft badge-accent badge-sm'>Here now</span>}
			</div>
			{place.note && <p className='text-sm opacity-70'>{place.note}</p>}
			{place.address && (
				<a
					className='link link-hover flex items-center gap-1 text-sm'
					target='_blank'
					rel='noreferrer'
					href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`}
				>
					<LuMapPin className='shrink-0' />
					{place.address}
				</a>
			)}
			<p className='text-xs opacity-60'>{dates}</p>
		</div>
	)
}

export const Itinerary = (props: ItineraryProps & { events: TripEvent[]; now: number; local: boolean }) => (
	<ul className='timeline timeline-vertical timeline-compact'>
		{props.events.map((event, i) => {
			const status = statusOf(event, props.now)
			const Icon = status === 'done' ? LuCheck : ICONS[event.kind]
			return (
				<li key={event.id}>
					{i > 0 && <hr className={cn(status !== 'upcoming' && 'bg-primary')} />}
					<div className={cn('timeline-middle grid size-8 place-items-center rounded-full', STATUS_TONES[status])}>
						<Icon />
					</div>
					<div className='timeline-end my-3 justify-self-stretch'>
						{event.leg ? (
							<FlightCard
								leg={event.leg}
								place={event.place}
								status={status}
								local={props.local}
								selected={props.selected}
								onSelect={props.onSelect}
							/>
						) : event.kind === 'layover' ? (
							<p className='py-1 text-sm opacity-70'>
								{formatSpan(event.end - event.start)} layover in {event.place.title}
							</p>
						) : (
							<StayCard event={event} status={status} local={props.local} />
						)}
					</div>
					{i < props.events.length - 1 && <hr className={cn(status === 'done' && 'bg-primary')} />}
				</li>
			)
		})}
	</ul>
)
