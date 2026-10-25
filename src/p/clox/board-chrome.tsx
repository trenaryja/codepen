import type { DragEndEvent } from 'https://esm.sh/@dnd-kit/core'
import {
	closestCenter,
	DndContext,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from 'https://esm.sh/@dnd-kit/sortable'
import { ThemePicker } from 'https://esm.sh/@trenaryja/ui'
import type { ReactNode, RefObject } from 'https://esm.sh/react'
import React, { useRef, useState } from 'https://esm.sh/react'
import { flushSync } from 'https://esm.sh/react-dom'
import { LuChevronsDownUp, LuChevronsUpDown, LuLocateFixed } from 'https://esm.sh/react-icons/lu'
import { InstantStrip } from './bands'
import { type Place, type Preferences, type View, VIEWS } from './board'
import { useCitySearch } from './location'
import { PlaceCard } from './place-card'
import { type City, FINE_POINTER, formatTime, isUtc } from './time'

type SearchMode = { kind: 'add' } | { kind: 'place'; id: string }

type Toggle = { key: string; content: ReactNode; label?: string; onClick: () => void }

export const BoardHeader = ({
	view,
	onView,
	places,
	preferences,
	onPreferences,
	expandedIds,
	onExpandedIds,
}: {
	view: View
	onView: (view: View) => void
	places: Place[]
	preferences: Preferences
	onPreferences: (patch: Partial<Preferences>) => void
	expandedIds: string[]
	onExpandedIds: (ids: string[]) => void
}) => {
	const { hour12, fahrenheit, showSeconds, forecastMode } = preferences
	const expandableIds = places.filter((place) => !isUtc(place.city)).map((place) => place.id)
	const allExpanded = expandableIds.every((id) => expandedIds.includes(id))

	// weather/forecast toggles only matter where weather shows — the list's cards
	const toggles: Toggle[] = [
		...(view === 'list'
			? [
					{
						key: 'expand',
						content: allExpanded ? <LuChevronsDownUp /> : <LuChevronsUpDown />,
						label: `${allExpanded ? 'collapse' : 'expand'} all cards`,
						onClick: () => onExpandedIds(allExpanded ? [] : expandableIds),
					},
					{
						key: 'mode',
						content: forecastMode,
						onClick: () => onPreferences({ forecastMode: forecastMode === 'hourly' ? 'daily' : 'hourly' }),
					},
					{
						key: 'unit',
						content: `°${fahrenheit ? 'F' : 'C'}`,
						onClick: () => onPreferences({ fahrenheit: !fahrenheit }),
					},
				]
			: []),
		{
			key: 'seconds',
			content: showSeconds ? ':ss' : ':—',
			onClick: () => onPreferences({ showSeconds: !showSeconds }),
		},
		{ key: 'cycle', content: hour12 ? '12h' : '24h', onClick: () => onPreferences({ hour12: !hour12 }) },
	]

	// shrink-0 keeps the tablist from being squeezed into a two-line stack; the toggle
	// group wraps whole, and its ml-auto keeps it right-aligned on the line it lands on
	return (
		<header className='flex flex-wrap items-center gap-2 px-4 py-3'>
			<div role='tablist' className='tabs tabs-border tabs-sm mr-auto shrink-0'>
				{VIEWS.map((entry) => (
					<button
						key={entry}
						type='button'
						role='tab'
						aria-selected={entry === view}
						className={`tab ${entry === view ? 'tab-active' : ''}`}
						onClick={() => onView(entry)}
					>
						{entry}
					</button>
				))}
			</div>
			<div className='ml-auto flex items-center gap-1 sm:gap-2'>
				<ThemePicker variant='modal' />
				{toggles.map(({ key, content, label, onClick }) => (
					<button key={key} type='button' aria-label={label} className='btn btn-ghost btn-xs' onClick={onClick}>
						{content}
					</button>
				))}
			</div>
		</header>
	)
}

export const ListView = ({
	places,
	now,
	scrubbed,
	expandedIds,
	onSettle,
	onExpandedIds,
	onReorder,
	onEditLocation,
}: {
	places: Place[]
	now: number
	scrubbed: number | null
	expandedIds: string[]
	onSettle: (target: number | null) => void
	onExpandedIds: (ids: string[]) => void
	onReorder: (places: Place[]) => void
	onEditLocation: (place: Place) => void
}) => {
	// Mouse, not Pointer: PointerSensor claims touch too, and with the card free to scroll the browser
	// wins that race and cancels every drag — so on a phone reordering never started. Mouse leaves touch
	// to the TouchSensor, where a long press means drag and a plain swipe still scrolls the board
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
	)

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return
		const from = places.findIndex((place) => place.id === active.id)
		const to = places.findIndex((place) => place.id === over.id)
		if (from !== -1 && to !== -1) onReorder(arrayMove(places, from, to))
	}

	const toggleExpanded = (id: string) =>
		onExpandedIds(expandedIds.includes(id) ? expandedIds.filter((entry) => entry !== id) : [...expandedIds, id])

	return (
		<main className='mx-auto flex w-full max-w-xl flex-col gap-3 p-3 pb-28 sm:p-4 sm:pb-28'>
			<InstantStrip now={now} scrubbed={scrubbed} onSettle={onSettle} />
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
				<SortableContext items={places.map((place) => place.id)} strategy={verticalListSortingStrategy}>
					{places.map((place) => (
						<PlaceCard
							key={place.id}
							place={place}
							expanded={expandedIds.includes(place.id)}
							onToggle={() => toggleExpanded(place.id)}
							onEditLocation={() => onEditLocation(place)}
						/>
					))}
				</SortableContext>
			</DndContext>
			{!places.length && <p className='py-12 text-center opacity-60'>No places yet — add one to start the board.</p>}
		</main>
	)
}

// keyboard hints only make sense where a keyboard is likely
export const KeyboardHints = () => {
	if (!FINE_POINTER) return null
	return (
		<footer className='mt-auto flex items-center justify-center gap-4 p-4 text-xs opacity-40'>
			{[
				['15m', '←', '→'],
				['1h', '⇧', '←', '→'],
				['now', 'n'],
			].map(([label, ...keys]) => (
				<span key={label} className='flex items-center gap-1'>
					{keys.map((key) => (
						<kbd key={key} className='kbd kbd-xs'>
							{key}
						</kbd>
					))}
					{label}
				</span>
			))}
		</footer>
	)
}

// bands has no card affordances, but an empty board still needs a way back in
export const AddPlaceButton = ({ shown, onClick }: { shown: boolean; onClick: () => void }) => {
	if (!shown) return null
	return (
		<div className='fab'>
			<button type='button' aria-label='add a place' className='btn btn-circle btn-xl shadow-lg' onClick={onClick}>
				＋
			</button>
		</div>
	)
}

export const SearchDialog = ({
	query,
	onQuery,
	now,
	hour12,
	detected,
	detectPending,
	onPick,
	onClose,
	inputRef,
}: {
	query: string
	onQuery: (query: string) => void
	now: number
	hour12: boolean
	detected: City
	detectPending: boolean
	onPick: (city: City) => void
	onClose: () => void
	inputRef: RefObject<HTMLInputElement | null>
}) => {
	const { matches, searching } = useCitySearch(query)
	return (
		<div className='modal modal-open modal-bottom sm:modal-middle'>
			<div className='modal-box flex flex-col gap-2'>
				<label className='input w-full'>
					<input
						className='grow'
						placeholder='search any city…'
						value={query}
						ref={inputRef}
						onFocus={(event) => event.target.select()}
						onChange={(event) => onQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && matches[0]) onPick(matches[0])
						}}
					/>
					{searching && <span className='loading loading-spinner loading-sm' />}
				</label>
				<ul className='menu w-full'>
					{/* wherever you are, as one press — the same IP lookup that seeds the board on a first visit */}
					<li>
						<button
							type='button'
							className='flex items-baseline justify-between'
							disabled={detectPending}
							onClick={() => onPick(detected)}
						>
							<span className='flex items-baseline gap-2'>
								<LuLocateFixed className='self-center' />
								here
								{!detectPending && <span className='text-xs opacity-50'>{detected.name}</span>}
							</span>
							{detectPending && <span className='loading loading-spinner loading-xs' />}
						</button>
					</li>
					{matches.map((city) => (
						<li key={`${city.name}-${city.latitude}-${city.longitude}`}>
							<button type='button' className='flex items-baseline justify-between' onClick={() => onPick(city)}>
								<span>
									{city.name} <span className='text-xs opacity-50'>{city.country}</span>
								</span>
								<span className='font-mono text-xs opacity-60'>
									{formatTime({ instant: now, timeZone: city.timeZone, hour12, seconds: false })}
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>
			<button type='button' className='modal-backdrop' aria-label='close' onClick={onClose} />
		</div>
	)
}

export const useSearch = () => {
	const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
	const [query, setQuery] = useState('')
	const searchInputRef = useRef<HTMLInputElement>(null)

	// pre-fill retarget searches with the current city so a typo or misclick is a two-keystroke fix
	const openSearch = (mode: SearchMode, prefill = '') => {
		flushSync(() => {
			setSearchMode(mode)
			setQuery(prefill)
		})
		searchInputRef.current?.focus()
	}

	const closeSearch = () => {
		setSearchMode(null)
		setQuery('')
	}

	return { searchMode, query, setQuery, searchInputRef, openSearch, closeSearch }
}
