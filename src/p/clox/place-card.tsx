import { useSortable } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import type { ReactNode } from 'https://esm.sh/react'
import React, { useRef, useState } from 'https://esm.sh/react'
import { flushSync } from 'https://esm.sh/react-dom'
import { LuClock, LuMapPin } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { type Place, useSettings } from './board'
import {
	type City,
	dayDelta,
	dayDeltaLabel,
	formatSignedGap,
	formatTime,
	hourLabel,
	isUtc,
	localMs,
	parseWallTime,
	round,
	solarAltitude,
	zoneOffset,
} from './time'
import { useForecast, weatherGlyph, weatherKey } from './weather'

// A display button that swaps in place for a daisy input sized to match its own type scale
const Editable = ({
	display,
	edit,
	commit,
	title,
	placeholder,
	className = '',
}: {
	display: ReactNode
	edit: string
	commit: (draft: string) => void
	title: string
	placeholder?: string
	className?: string
}) => {
	const [draft, setDraft] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	// display and input share one box so swapping shifts nothing — 1lh is exactly one line of the caller's own text size
	const shared = `h-[1lh] leading-tight field-sizing-content ${className}`
	if (draft === null)
		return (
			<button
				type='button'
				title={title}
				className={`flex cursor-text items-center truncate text-left hover:opacity-75 ${shared}`}
				onClick={() => {
					flushSync(() => setDraft(edit))
					inputRef.current?.focus()
				}}
			>
				{display}
			</button>
		)
	return (
		<input
			className={`input px-[0.15em] ${shared}`}
			value={draft}
			placeholder={placeholder}
			ref={inputRef}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				commit(draft)
				setDraft(null)
			}}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur()
				else if (event.key === 'Escape') setDraft(null)
			}}
		/>
	)
}

const EditableTime = ({ timeZone, className = '' }: { timeZone: string; className?: string }) => {
	const { instant, hour12, showSeconds, scrubToWall } = useSettings()
	const pickerRef = useRef<HTMLInputElement>(null)
	return (
		// picker leads, digits trail — so the time itself is what lines up with the edge it's aligned to
		<span className='relative inline-flex items-center gap-1'>
			<button
				type='button'
				aria-label='pick a time'
				className='btn btn-circle btn-ghost btn-sm text-lg opacity-40 hover:opacity-100'
				onClick={() => {
					// showPicker throws where it isn't allowed — notably a cross-origin frame, which is
					// what a CodePen preview is. Focusing is the most a fallback can do; phones raise
					// their own wheel for a focused time input anyway
					try {
						pickerRef.current?.showPicker()
					} catch {
						pickerRef.current?.focus()
					}
				}}
			>
				<LuClock />
			</button>
			{/* invisible, but rendered and sized like the button: it's what the native picker anchors to */}
			<input
				ref={pickerRef}
				type='time'
				aria-hidden
				tabIndex={-1}
				className='pointer-events-none absolute left-0 size-8 opacity-0'
				value={new Date(localMs(timeZone, instant)).toISOString().slice(11, 16)}
				onChange={(event) => {
					const [hours, minutes] = event.target.value.split(':', 2)
					if (hours && minutes) scrubToWall(timeZone, [Number(hours) * 60 + Number(minutes)])
				}}
			/>
			<Editable
				display={formatTime({ instant, timeZone, hour12, seconds: showSeconds })}
				edit=''
				commit={(draft) => {
					const candidates = parseWallTime(draft)
					if (candidates) scrubToWall(timeZone, candidates)
				}}
				title='type a time to scrub there'
				placeholder={hour12 ? '9:30p' : '21:30'}
				className={`font-mono ${className}`}
			/>
		</span>
	)
}

// Pressing the block itself expands its forecast; clicks that land on a control belong to that control
const expandOnClick = (onToggle: () => void) => (event: { target: EventTarget | null }) => {
	// Element, not HTMLElement — clicks on the react-icons <svg> inside buttons must be caught too
	if (event.target instanceof Element && event.target.closest('button, input')) return
	onToggle()
}

export const WeatherChip = ({ city }: { city: City }) => {
	const { instant, weather, weatherReady, fahrenheit } = useSettings()
	if (isUtc(city)) return null
	if (!weatherReady) return <span className='skeleton text-transparent'>00°</span>
	const current = weather[weatherKey(city)]
	const day = solarAltitude(instant, city.latitude, city.longitude) > -6
	if (!current) return weatherGlyph(0, day, 'text-xl')
	const temperature = round(current.temperature)
	const feels = round(current.feelsLike)
	return (
		<span className='flex flex-wrap items-center gap-x-0.5'>
			{weatherGlyph(current.code, day, 'text-xl')}
			{temperature}°{fahrenheit ? 'F' : 'C'}
			{Math.abs(feels - temperature) >= 2 && <span className='ml-1 opacity-60'>feels {feels}°</span>}
		</span>
	)
}

export const ForecastPanel = ({ city }: { city: City }) => {
	const { hour12, fahrenheit, forecastMode } = useSettings()
	const { cells, loading } = useForecast(city, fahrenheit, forecastMode)
	return (
		<div className='mt-1 w-full'>
			<div className='divider my-1' />
			{loading && <div className='skeleton h-16 w-full' />}
			{!!cells?.length && (
				<div className='flex justify-between gap-2 overflow-x-auto pb-1'>
					{cells.map((cell) => (
						<div key={cell.time} className='flex flex-col items-center gap-0.5 text-xs opacity-80'>
							<span>{cell.label || hourLabel(Number(cell.time.slice(11, 13)), hour12)}</span>
							{weatherGlyph(cell.code, cell.day, 'text-2xl')}
							{/* high over low on phones — seven days of "89°/76°" on one line needs a scroll to read */}
							<span className='flex flex-col items-center font-mono leading-tight sm:flex-row'>
								{cell.primary}
								{cell.secondary && (
									<>
										<span className='hidden sm:inline'>/</span>
										<span className='opacity-60 sm:opacity-100'>{cell.secondary}</span>
									</>
								)}
							</span>
							<span className='font-mono opacity-60'>{cell.precip >= 10 ? `${cell.precip}%` : ' '}</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export const PlaceCard = ({
	place,
	expanded,
	onToggle,
	onEditLocation,
}: {
	place: Place
	expanded: boolean
	onToggle: () => void
	onEditLocation: () => void
}) => {
	const { instant, reference, rename, remove } = useSettings()
	const { city, id, label } = place
	const gap = zoneOffset(city.timeZone, instant) - zoneOffset(reference.timeZone, instant)
	const delta = dayDelta(city.timeZone, reference.timeZone, instant)
	const expandable = !isUtc(city)
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
	return (
		<div
			ref={setNodeRef}
			// Translate, not Transform — Transform includes a scale that stretches cards when
			// an expanded card and a collapsed one trade differently-sized slots mid-drag
			style={{ transform: CSS.Translate.toString(transform), transition }}
			role='button'
			tabIndex={0}
			{...R.omit(attributes, ['role', 'tabIndex'])}
			{...listeners}
			className={`card group bg-base-200 cursor-grab touch-manipulation select-none active:cursor-grabbing ${isDragging ? 'z-10 opacity-60' : ''}`}
			onClick={expandOnClick(() => expandable && onToggle())}
			// role and tabIndex make the card focusable and announce it as a button; this is
			// what makes it operable. The currentTarget check is the keyboard twin of expandOnClick's guard —
			// a nested button or input gets its own Enter, and the press must not also toggle the card.
			onKeyDown={(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return
				if (event.target !== event.currentTarget) return
				event.preventDefault()
				if (expandable) onToggle()
			}}
		>
			<div className='card-body gap-2 px-4 py-3 sm:px-5 sm:py-4'>
				<div className='flex items-center gap-2 sm:gap-3'>
					<div className='min-w-0 grow'>
						<div className='flex items-baseline gap-2'>
							<Editable
								display={label}
								edit={label}
								// clearing the field is how you un-rename: the city name back in `label` *is* the unlabeled state
								commit={(draft) => rename(id, draft.trim() || city.name)}
								title='rename'
								placeholder={city.name}
								className='text-lg font-medium sm:text-xl'
							/>
							<button
								type='button'
								title={`move ${label} to a different city`}
								className='min-w-0 truncate text-xs tracking-wider uppercase opacity-40 hover:opacity-80'
								onClick={onEditLocation}
							>
								{city.name.toLowerCase() === label.toLowerCase() ? <LuMapPin /> : city.name}
							</button>
						</div>
						<div className='mt-1 text-sm opacity-60'>
							<WeatherChip city={city} />
						</div>
					</div>
					<div className='flex shrink-0 flex-col items-end'>
						<EditableTime timeZone={city.timeZone} className='text-3xl font-extralight tracking-tight sm:text-5xl' />
						<div className='flex items-center gap-2 font-mono text-xs opacity-60 sm:text-sm'>
							<span>{formatSignedGap(gap)}</span>
							{delta !== 0 && <span className='badge badge-sm'>{dayDeltaLabel(delta)}</span>}
						</div>
					</div>
					{/* no hover on touch, so the remove button only fades out where a pointer can bring it back */}
					<button
						type='button'
						aria-label={`remove ${label}`}
						className='btn btn-circle btn-xs absolute -top-2 -right-2 transition hover:opacity-100! sm:opacity-0 sm:group-hover:opacity-60'
						onClick={() => remove(id)}
					>
						✕
					</button>
				</div>
				{expanded && expandable && <ForecastPanel city={city} />}
			</div>
		</div>
	)
}
