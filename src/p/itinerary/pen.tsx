import { ThemePicker, ThemeProvider, Toaster, cn, toast } from 'https://esm.sh/@trenaryja/ui'
import { geoInterpolate } from 'https://esm.sh/d3-geo'
import { useQueryStates } from 'https://esm.sh/nuqs'
import { NuqsAdapter } from 'https://esm.sh/nuqs/adapters/react'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuClipboardPaste, LuCopy, LuPencil, LuPlane, LuShare2 } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'
import { Flight, PROMPT, TRIP_PARAMS, Trip, TripJson, sampleTrip, statusOf, tripEvents } from './data'
import { type Here, RouteCard } from './map'
import { Choice, Countdown, Itinerary, Stats, useNow } from './views'

const share = async (title: string) => {
	try {
		await navigator.share({ title, url: location.href })
	} catch (error) {
		// Firefox desktop has no navigator.share, so its TypeError lands here too
		if (error instanceof DOMException && error.name === 'AbortError') return
		await navigator.clipboard.writeText(location.href)
		toast.success('Link copied')
	}
}

const copyPrompt = async () => {
	await navigator.clipboard.writeText(PROMPT)
	toast.success('Prompt copied: paste it into any LLM or agent and answer its questions')
}

const EmptyTrip = (props: { onPlan: () => void; onSample: () => void }) => (
	<div className='hero rounded-box bg-base-200 py-12'>
		<div className='hero-content flex-col text-center'>
			<LuPlane className='size-10 opacity-50' />
			<h2 className='text-2xl font-bold'>No flights to show</h2>
			<p className='max-w-md opacity-70'>
				The whole trip lives in this page's link: plan it with any LLM or agent, then share the URL. Nothing is stored
				anywhere else.
			</p>
			<div className='flex flex-wrap justify-center gap-2'>
				<button type='button' className='btn btn-primary' onClick={props.onPlan}>
					Plan a trip
				</button>
				<button type='button' className='btn' onClick={props.onSample}>
					Load a sample trip
				</button>
			</div>
		</div>
	</div>
)

const TripEditor = ({ trip, onChange }: { trip: object; onChange: (trip: z.output<typeof Trip> | null) => void }) => {
	const [text, setText] = useState(() => JSON.stringify(trip, null, 2))
	const result = TripJson.safeParse(text)
	const edit = (next: string) => {
		setText(next)
		const parsed = TripJson.safeParse(next)
		if (parsed.success) onChange(parsed.data)
	}
	return (
		<section className='surface panel card-body gap-3 p-4'>
			<div className='flex flex-wrap gap-2'>
				<button type='button' className='btn btn-primary btn-sm' onClick={() => void copyPrompt()}>
					<LuCopy /> Copy planning prompt
				</button>
				<button type='button' className='btn btn-sm' onClick={() => void navigator.clipboard.readText().then(edit)}>
					<LuClipboardPaste /> Paste reply
				</button>
				<button
					type='button'
					className='btn btn-ghost btn-sm'
					onClick={() => {
						setText('')
						onChange(null)
					}}
				>
					Start over
				</button>
			</div>
			<textarea
				className='textarea h-72 w-full font-mono text-xs'
				aria-label='Trip as JSON'
				spellCheck={false}
				value={text}
				onChange={(e) => edit(e.target.value)}
			/>
			{result.success || !text.trim() ? (
				<p className='text-xs opacity-60'>Valid JSON saves to the link as you type.</p>
			) : (
				<pre className='text-error text-xs whitespace-pre-wrap'>{z.prettifyError(result.error)}</pre>
			)}
		</section>
	)
}

const App = () => {
	// Typing in the JSON box writes the link on every valid keystroke; pushing each would bury the back button
	const [trip, setTrip] = useQueryStates(TRIP_PARAMS, { history: 'replace' })
	const [editing, setEditing] = useState(false)
	/** undefined follows the trip to its current or next flight; null is the reader clearing the selection */
	const [picked, setPicked] = useState<string | null>()
	const [clock, setClock] = useState('Local times')
	const now = useNow(60_000)

	const [readable, { length: unreadable }] = R.partition(trip.flights, (flight) => R.values(flight).some(Boolean))
	const parsed = readable.map((flight) => Flight.safeParse(flight))
	const problems = [
		...(unreadable
			? [
					`${unreadable} flight${unreadable > 1 ? 's' : ''} in this link can't be read: an older version of this page likely wrote it`,
				]
			: []),
		...parsed.flatMap((result, i) =>
			result.error
				? `${readable[i]?.number || `Flight ${i + 1}`}: ${result.error.issues.map((x) => [...x.path, x.message].join(': ')).join('; ')}`
				: [],
		),
	]
	const legs = R.sortBy(
		parsed.flatMap((result, i) => (result.success ? { ...result.data, id: String(i) } : [])),
		(leg) => leg.start,
	)
	const events = tripEvents(legs)
	const current = events.find((event) => statusOf(event, now) === 'now')
	const progress = current ? (now - current.start) / (current.end - current.start) : 0
	const here: Here | undefined = current?.leg
		? {
				coordinates: geoInterpolate(current.leg.origin.coordinates, current.leg.destination.coordinates)(progress),
				label: `${current.leg.number} · about ${Math.round(progress * 100)}% of the way`,
			}
		: current && { coordinates: current.airport.coordinates, label: `Here now · ${current.place.title}` }
	const selected = picked === null ? undefined : (picked ?? (legs.find((leg) => now < leg.end) ?? legs.at(-1))?.id)
	const onSelect = (id: string) => setPicked(id === selected ? null : id)
	const route = R.uniqueBy(
		events.filter((event) => !event.leg && event.kind !== 'layover'),
		(event) => event.airport.code,
	)

	return (
		<main className='mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6'>
			<header className='flex flex-wrap items-start justify-between gap-4'>
				<div className='min-w-0'>
					<h1 className='text-3xl font-black sm:text-5xl'>{trip.title || 'Untitled trip'}</h1>
					<p className='mt-2 opacity-70'>{route.map((event) => event.place.title).join(' → ')}</p>
				</div>
				<div className='flex items-center gap-2'>
					<button
						type='button'
						className={cn('btn btn-ghost btn-sm', editing && 'btn-active')}
						aria-pressed={editing}
						onClick={() => setEditing(!editing)}
					>
						<LuPencil /> Edit
					</button>
					<button
						type='button'
						className='btn btn-primary btn-sm'
						disabled={!legs.length}
						onClick={() => void share(trip.title || 'Trip')}
					>
						<LuShare2 /> Share
					</button>
					<ThemePicker variant='modal' />
				</div>
			</header>
			{editing && <TripEditor trip={trip} onChange={(next) => void setTrip(next)} />}
			{problems.length > 0 && (
				<ul role='alert' className='alert alert-soft alert-error flex flex-col items-start text-sm'>
					{problems.map((problem) => (
						<li key={problem}>{problem}</li>
					))}
				</ul>
			)}
			{R.hasAtLeast(legs, 1) ? (
				<>
					<div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
						<Countdown legs={legs} events={events} />
						<Stats legs={legs} />
					</div>
					<div className='grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]'>
						<RouteCard legs={legs} now={now} here={here} selectedId={selected} onSelect={onSelect} />
						<section className='flex flex-col gap-4'>
							<div className='flex flex-wrap items-center justify-between gap-2'>
								<h2 className='text-xl font-bold'>Itinerary</h2>
								<Choice options={['Local times', 'My time']} value={clock} onChange={setClock} />
							</div>
							<Itinerary
								events={events}
								now={now}
								local={clock === 'Local times'}
								selected={selected}
								onSelect={onSelect}
							/>
						</section>
					</div>
				</>
			) : (
				!editing && (
					<EmptyTrip onPlan={() => setEditing(true)} onSample={() => void setTrip(Trip.parse(sampleTrip()))} />
				)
			)}
			<Toaster />
		</main>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(
	<NuqsAdapter>
		<ThemeProvider>
			<App />
		</ThemeProvider>
	</NuqsAdapter>,
)
