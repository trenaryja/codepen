import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import { ThemePicker, ThemeProvider, useNativePopover } from 'https://esm.sh/@trenaryja/ui'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuChevronDown, LuChevronsDownUp, LuChevronsUpDown, LuClock, LuMapPin } from 'https://esm.sh/react-icons/lu'
import {
	WiCloudy,
	WiDayCloudy,
	WiDaySunny,
	WiFog,
	WiNightAltCloudy,
	WiNightClear,
	WiRain,
	WiShowers,
	WiSnow,
	WiSprinkle,
	WiThunderstorm,
} from 'https://esm.sh/react-icons/wi'

// ── Constants ─────────────────────────────────────────────────────────────────
const HOUR = 3_600_000
const DAY = 86_400_000
const QUARTER_HOUR = 900_000
const RADIAN = Math.PI / 180
const STORAGE_KEY = 'clox'
const GHOST_BUTTON = 'btn btn-ghost btn-xs'
const ICON_BUTTON = 'btn btn-circle btn-ghost btn-xs'
// Editable's display and its input share this box so swapping between them shifts nothing.
// 1lh is exactly one line of whatever text size the caller passed, so the box tracks it for free
const EDITABLE_BOX = 'h-[1lh] leading-tight field-sizing-content'

type City = { name: string; country: string; latitude: number; longitude: number; timeZone: string }
const UTC_CITY: City = { name: 'UTC', country: '', latitude: 0, longitude: 0, timeZone: 'UTC' }
const isUtc = (city: City) => city.timeZone === 'UTC'
const DEMO_TRACKS = [
	{
		label: 'Home',
		city: { name: 'New York', country: 'US', latitude: 40.71, longitude: -74.01, timeZone: 'America/New_York' },
	},
	{
		label: 'Nashville',
		city: { name: 'Nashville', country: 'US', latitude: 36.16, longitude: -86.78, timeZone: 'America/Chicago' },
	},
	{ label: 'UTC', city: UTC_CITY },
]

const round = (value: unknown) => Math.round(Number(value ?? 0))

// ── Time helpers (Intl-based) ─────────────────────────────────────────────────
const formatterCache = new Map<string, Intl.DateTimeFormat>()
const getFormatter = (options: Intl.DateTimeFormatOptions) => {
	const key = JSON.stringify(options)
	const cached = formatterCache.get(key)
	if (cached) return cached
	const formatter = new Intl.DateTimeFormat('en-US', options)
	formatterCache.set(key, formatter)
	return formatter
}

const offsetCache = new Map<string, number>()
const zoneOffset = (timeZone: string, instant: number) => {
	const key = `${timeZone}:${Math.floor(instant / QUARTER_HOUR)}`
	const cached = offsetCache.get(key)
	if (cached !== undefined) return cached
	const parts = getFormatter({ timeZone, timeZoneName: 'longOffset' }).formatToParts(instant)
	const match = parts.find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2}):(\d{2})/)
	const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * HOUR + Number(match[3]) * 60_000) : 0
	offsetCache.set(key, offset)
	return offset
}

// Shifting the instant by the zone's offset makes UTC rendering read as that zone's wall clock
const localMs = (timeZone: string, instant: number) => instant + zoneOffset(timeZone, instant)
const wallClock = (timeZone: string, instant: number) =>
	new Date(localMs(timeZone, instant)).toISOString().slice(11, 16)

const formatTime = (instant: number, timeZone: string, hour12: boolean, seconds: boolean) =>
	getFormatter({
		timeZone,
		hour: 'numeric',
		minute: '2-digit',
		second: seconds ? '2-digit' : undefined,
		hour12,
	}).format(instant)

const formatDateLong = (instant: number, timeZone: string) =>
	getFormatter({ timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(instant)

const hourLabel = (localHour: number, hour12: boolean) =>
	hour12 ? `${((localHour + 11) % 12) + 1}${localHour < 12 ? 'a' : 'p'}` : String(localHour).padStart(2, '0')

const weekdayOf = (date: string) => getFormatter({ weekday: 'short' }).format(new Date(`${date}T12:00`))

// Calendar-day difference between a zone and the base zone at one instant: -1 = yesterday there
const dayDelta = (timeZone: string, baseTimeZone: string, instant: number) =>
	Math.floor(localMs(timeZone, instant) / DAY) - Math.floor(localMs(baseTimeZone, instant) / DAY)
const dayDeltaLabel = (delta: number) =>
	delta === 1 ? 'tomorrow' : delta === -1 ? 'yesterday' : `${delta > 0 ? '+' : ''}${delta} days`

const localeHour12 = () => {
	const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
	return cycle === 'h11' || cycle === 'h12'
}

const localeFahrenheit = () => navigator.language.toUpperCase().includes('US')

// Signed like Android's world clock: "-9h 30m", "+2h 30m", "0h"
const formatSignedGap = (milliseconds: number) => {
	const totalMinutes = Math.round(milliseconds / 60_000)
	if (totalMinutes === 0) return '0h'
	const hours = Math.floor(Math.abs(totalMinutes) / 60)
	const minutes = Math.abs(totalMinutes) % 60
	return `${totalMinutes < 0 ? '-' : '+'}${hours}h${minutes ? ` ${minutes}m` : ''}`
}

// Accepts "9", "9:30", "930", "0930", "9.30", "9 30", "9p", "9:30 pm", "noon", "midnight".
// Without a meridiem, 1–12 returns both wall-clock candidates; the scrubber jumps to whichever is nearest.
// A leading zero ("09", "0930") or an hour ≥ 13 reads as explicit 24h and stays single.
const parseWallTime = (raw: string): number[] | null => {
	const text = raw.trim().toLowerCase()
	if (text === 'noon') return [720]
	if (text === 'midnight') return [0]
	const match = text.match(/^(\d{1,2})(?:[:. ]?(\d{2}))?\s*(?:(a|p)\.?m?\.?)?$/)
	if (!match) return null
	let hour = Number(match[1])
	const minute = Number(match[2] ?? 0)
	if (hour > 23 || minute > 59) return null
	const meridiem = match[3]
	if (meridiem === 'p' && hour < 12) hour += 12
	if (meridiem === 'a' && hour === 12) hour = 0
	const explicit24 = match[1].length === 2 && match[1].startsWith('0')
	if (meridiem || explicit24 || hour === 0 || hour > 12) return [hour * 60 + minute]
	return [(hour % 12) * 60 + minute, ((hour % 12) + 12) * 60 + minute]
}

// ── Solar altitude (NOAA-style, used only to pick day vs night icons) ─────────
const solarAltitude = (instant: number, latitude: number, longitude: number) => {
	const days = instant / DAY - 10957.5
	const meanLongitude = 280.46 + 0.9856474 * days
	const meanAnomaly = (357.528 + 0.9856003 * days) * RADIAN
	const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RADIAN
	const obliquity = 23.439 * RADIAN
	const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude))
	const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude))
	const siderealDegrees = 280.46061837 + 360.98564736629 * days + longitude
	const hourAngle = (((siderealDegrees - rightAscension / RADIAN + 540) % 360) - 180) * RADIAN
	return (
		Math.asin(
			Math.sin(latitude * RADIAN) * Math.sin(declination) +
				Math.cos(latitude * RADIAN) * Math.cos(declination) * Math.cos(hourAngle),
		) / RADIAN
	)
}

const isDaytime = (instant: number, city: City) =>
	isUtc(city) || solarAltitude(instant, city.latitude, city.longitude) > -6

// ── Weather (open-meteo, no key) ──────────────────────────────────────────────
type Weather = { temperature: number; code: number; feelsLike: number }
const weatherKey = (city: City) => `${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`
const tempUnit = (fahrenheit: boolean) => (fahrenheit ? '&temperature_unit=fahrenheit' : '')

const weatherIcon = (code: number, day: boolean) => {
	if (code === 0) return day ? WiDaySunny : WiNightClear
	if (code <= 2) return day ? WiDayCloudy : WiNightAltCloudy
	if (code === 3) return WiCloudy
	if (code === 45 || code === 48) return WiFog
	if (code < 60) return WiSprinkle
	if (code < 70) return WiRain
	if (code < 80) return WiSnow
	if (code < 85) return WiShowers
	if (code < 95) return WiSnow
	return WiThunderstorm
}

const useWeather = (cities: City[], fahrenheit: boolean) => {
	const [weather, setWeather] = useState<Record<string, Weather>>({})
	const [ready, setReady] = useState(false)
	const signature = cities
		.filter((city) => !isUtc(city))
		.map(weatherKey)
		.join(';')

	useEffect(() => {
		if (!signature) return
		let cancelled = false
		const keys = signature.split(';')
		const load = async () => {
			try {
				const coords = (index: number) => keys.map((key) => key.split(',')[index]).join(',')
				const parsed = await (
					await fetch(
						`https://api.open-meteo.com/v1/forecast?latitude=${coords(0)}&longitude=${coords(1)}&current=temperature_2m,weather_code,apparent_temperature${tempUnit(fahrenheit)}`,
					)
				).json()
				type Current = { temperature_2m: number; weather_code: number; apparent_temperature: number }
				const list: { current?: Current }[] = Array.isArray(parsed) ? parsed : [parsed]
				if (cancelled) return
				const next: Record<string, Weather> = {}
				list.forEach(({ current }, index) => {
					if (current)
						next[keys[index]] = {
							temperature: current.temperature_2m,
							code: current.weather_code,
							feelsLike: current.apparent_temperature,
						}
				})
				setWeather(next)
			} catch {
				// weather is decoration — fail silent, cards just omit it
			} finally {
				if (!cancelled) setReady(true)
			}
		}
		load()
		const id = setInterval(load, 15 * 60_000)
		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [signature, fahrenheit])

	return { weather, ready }
}

// ── Forecast, fetched per city per mode on first expand ───────────────────────
// One cell shape serves both modes: hourly = temp + rain %, daily = high/low + rain %
type ForecastCell = {
	key: string
	label: string
	hour: number
	code: number
	day: boolean
	primary: string
	precip: number
}
type ForecastMode = 'hourly' | 'daily'
const FORECAST_FIELDS: Record<ForecastMode, string> = {
	hourly: 'hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=12',
	daily: 'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7',
}
const forecastCache = new Map<string, ForecastCell[]>()

const useForecast = (city: City, fahrenheit: boolean, mode: ForecastMode) => {
	const [, bump] = useState(0)
	const key = `${weatherKey(city)}:${fahrenheit}:${mode}`

	useEffect(() => {
		if (forecastCache.has(key)) return
		let cancelled = false
		const load = async () => {
			try {
				const parsed: Partial<Record<ForecastMode, Record<string, unknown[]>>> = await (
					await fetch(
						`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&${FORECAST_FIELDS[mode]}&timezone=auto${tempUnit(fahrenheit)}`,
					)
				).json()
				const block = parsed[mode] ?? {}
				const at = (field: string, index: number) => round(block[field]?.[index])
				const hourly = mode === 'hourly'
				forecastCache.set(
					key,
					(block.time ?? []).map(String).map((time, index) => ({
						key: time,
						// hourly labels depend on the 12/24h setting, so they resolve from `hour` at render
						label: index === 0 ? (hourly ? 'now' : 'today') : hourly ? '' : weekdayOf(time),
						hour: Number(time.slice(11, 13)),
						code: at('weather_code', index),
						day: !hourly || at('is_day', index) === 1,
						primary: hourly
							? `${at('temperature_2m', index)}°`
							: `${at('temperature_2m_max', index)}°/${at('temperature_2m_min', index)}°`,
						precip: at(hourly ? 'precipitation_probability' : 'precipitation_probability_max', index),
					})),
				)
			} catch {
				forecastCache.set(key, []) // failed — panel just shows nothing
			}
			if (!cancelled) bump((count) => count + 1)
		}
		load()
		return () => {
			cancelled = true
		}
	}, [key, city, fahrenheit, mode])

	const cells = forecastCache.get(key)
	return { cells, loading: cells === undefined }
}

// ── Home detection: IANA zone immediately, IP geolocation refines it ──────────
const TIME_ZONE_ALIASES: Record<string, string> = {
	'Asia/Calcutta': 'Asia/Kolkata',
	'Asia/Saigon': 'Asia/Ho_Chi_Minh',
	'Asia/Rangoon': 'Asia/Yangon',
	'Europe/Kiev': 'Europe/Kyiv',
	'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
}
const unalias = (timeZone: string | undefined) => (timeZone ? (TIME_ZONE_ALIASES[timeZone] ?? timeZone) : undefined)
const homeTimeZone = unalias(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC'
const fallbackHome: City = {
	name: homeTimeZone.split('/').at(-1)?.replaceAll('_', ' ') ?? homeTimeZone,
	country: '',
	latitude: 20,
	longitude: (zoneOffset(homeTimeZone, Date.now()) / HOUR) * 15,
	timeZone: homeTimeZone,
}

// ipwho.is first (keyless, CORS, generous), ipapi.co as backup — both throttle bursts with 429s
const IP_LOOKUPS = ['https://ipwho.is/', 'https://ipapi.co/json/']

const useDetectedHome = () => {
	const [detected, setDetected] = useState(fallbackHome)
	const [pending, setPending] = useState(true)
	useEffect(() => {
		let cancelled = false
		const lookup = async () => {
			for (const url of IP_LOOKUPS) {
				try {
					const data = await (await fetch(url)).json()
					if (cancelled || typeof data?.latitude !== 'number' || !data.city) continue
					setDetected({
						name: data.city,
						country: data.country_code ?? '',
						latitude: data.latitude,
						longitude: data.longitude ?? fallbackHome.longitude,
						// ipwho.is nests the zone under timezone.id; ipapi.co returns it flat
						timeZone: unalias(data.timezone?.id ?? data.timezone) ?? homeTimeZone,
					})
					break
				} catch {}
			}
			if (!cancelled) setPending(false)
		}
		lookup()
		return () => {
			cancelled = true
		}
	}, [])
	return { detected, pending }
}

// ── City search (open-meteo geocoding, no key) ────────────────────────────────
const useCitySearch = (query: string) => {
	const [matches, setMatches] = useState<City[]>([])
	const [searching, setSearching] = useState(false)
	useEffect(() => {
		const lower = query.trim().toLowerCase()
		const utcMatch = lower && 'utc'.startsWith(lower) ? [UTC_CITY] : []
		if (lower.length < 2) {
			setSearching(false)
			return setMatches(utcMatch)
		}
		setSearching(true)
		const controller = new AbortController()
		const id = setTimeout(async () => {
			try {
				type Result = {
					name: string
					admin1?: string
					country_code?: string
					latitude: number
					longitude: number
					timezone?: string
				}
				const parsed: { results?: Result[] } = await (
					await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lower)}&count=8`, {
						signal: controller.signal,
					})
				).json()
				const cities = (parsed.results ?? [])
					.filter((result) => result.timezone)
					.map(({ name, admin1, country_code, latitude, longitude, timezone }) => ({
						name,
						country: [admin1, country_code].filter(Boolean).join(', '),
						latitude,
						longitude,
						timeZone: timezone ?? 'UTC',
					}))
				setMatches([...utcMatch, ...cities])
				setSearching(false)
			} catch {
				// aborted or offline — keep previous matches
			}
		}, 250)
		return () => {
			clearTimeout(id)
			controller.abort()
		}
	}, [query])
	return { matches, searching }
}

// ── Tracks + shared view settings ─────────────────────────────────────────────
const VIEWS = ['list'] as const
type View = (typeof VIEWS)[number]
type Track = { id: string; label: string; city: City }
type ScrubToWall = (timeZone: string, candidates: number[]) => void
type Preferences = {
	hour12: boolean
	fahrenheit: boolean
	showSeconds: boolean
	forecastMode: ForecastMode
	homeOverride: City | null
}
type Stored = Partial<Preferences> & { tracks?: { label: string; city: City }[]; view?: View }

// Everything below the App reads the same view state, so it rides context instead of props
type Settings = Omit<Preferences, 'homeOverride'> & {
	instant: number
	home: City
	weather: Record<string, Weather>
	weatherReady: boolean
	scrubToWall: ScrubToWall
}
const SettingsContext = createContext<Settings>(null!)
const useSettings = () => useContext(SettingsContext)

const loadStored = (): Stored | null => {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
	} catch {
		return null
	}
}

const initialRoster = (stored: Stored | null): Track[] =>
	(stored?.tracks ?? DEMO_TRACKS.filter((entry) => entry.city.timeZone !== homeTimeZone))
		.filter((entry) => entry.city?.timeZone)
		.map((entry, index) => ({ id: `track-${index}`, label: entry.label, city: entry.city }))

// ── Editable primitive ────────────────────────────────────────────────────────
// A display button that swaps in place for a daisy input sized to match its own type scale
const Editable = ({
	display,
	edit,
	commit,
	title,
	placeholder,
	className,
}: {
	display: ReactNode
	edit: string
	commit: (draft: string) => void
	title: string
	placeholder?: string
	className?: string
}) => {
	const [draft, setDraft] = useState<string | null>(null)
	const shared = `${EDITABLE_BOX} ${className ?? ''}`
	if (draft === null)
		return (
			<button
				type='button'
				title={title}
				className={`flex cursor-text items-center truncate text-left hover:opacity-75 ${shared}`}
				onClick={() => setDraft(edit)}
			>
				{display}
			</button>
		)
	return (
		<input
			className={`input px-[0.15em] ${shared}`}
			value={draft}
			placeholder={placeholder}
			// biome-ignore lint/a11y/noAutofocus: input only exists after an explicit click on the value it replaces
			autoFocus
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				commit(draft)
				setDraft(null)
			}}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur()
				if (event.key === 'Escape') setDraft(null)
			}}
		/>
	)
}

const EditableTime = ({ timeZone, className }: { timeZone: string; className?: string }) => {
	const { instant, hour12, showSeconds, scrubToWall } = useSettings()
	const { triggerProps, contentProps } = useNativePopover({ position: 'bottom center' })
	return (
		<span className='inline-flex items-center gap-1'>
			<Editable
				display={formatTime(instant, timeZone, hour12, showSeconds)}
				edit=''
				commit={(draft) => {
					const candidates = parseWallTime(draft)
					if (candidates) scrubToWall(timeZone, candidates)
				}}
				title='type a time to scrub there'
				placeholder={hour12 ? '9:30p' : '21:30'}
				className={`font-mono ${className ?? ''}`}
			/>
			<button
				type='button'
				aria-label='pick a time'
				className={`${ICON_BUTTON} opacity-40 hover:opacity-100`}
				{...triggerProps}
			>
				<LuClock />
			</button>
			<div {...contentProps} className='rounded-box bg-base-200 p-3 shadow-xl'>
				<input
					type='time'
					className='input field-sizing-content font-mono [&::-webkit-calendar-picker-indicator]:hidden'
					value={wallClock(timeZone, instant)}
					onChange={(event) => {
						const [hours, minutes] = event.target.value.split(':')
						if (hours && minutes) scrubToWall(timeZone, [Number(hours) * 60 + Number(minutes)])
					}}
				/>
			</div>
		</span>
	)
}

const ExpandButton = ({ expanded, onClick }: { expanded: boolean; onClick: () => void }) => (
	<button
		type='button'
		aria-label={`${expanded ? 'collapse' : 'expand'} forecast`}
		className={ICON_BUTTON}
		onClick={onClick}
	>
		<LuChevronDown className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
	</button>
)

// ── Weather widgets ───────────────────────────────────────────────────────────
const WeatherChip = ({ city }: { city: City }) => {
	const { instant, weather, weatherReady, fahrenheit } = useSettings()
	if (isUtc(city)) return null
	if (!weatherReady) return <span className='skeleton text-transparent'>00°</span>
	const current = weather[weatherKey(city)]
	const day = isDaytime(instant, city)
	const Icon = weatherIcon(current?.code ?? 0, day)
	if (!current) return <Icon className='text-xl' />
	const temperature = round(current.temperature)
	const feels = round(current.feelsLike)
	return (
		<span className='flex items-center gap-0.5'>
			<Icon className='text-xl' />
			{temperature}°{fahrenheit ? 'F' : 'C'}
			{Math.abs(feels - temperature) >= 2 && <span className='ml-1 opacity-60'>feels {feels}°</span>}
		</span>
	)
}

const ForecastPanel = ({ city }: { city: City }) => {
	const { hour12, fahrenheit, forecastMode } = useSettings()
	const { cells, loading } = useForecast(city, fahrenheit, forecastMode)
	return (
		<div className='mt-1 w-full'>
			<div className='divider my-1' />
			{loading && <div className='skeleton h-16 w-full' />}
			{!!cells?.length && (
				<div className='flex justify-between gap-2 overflow-x-auto pb-1'>
					{cells.map((cell) => {
						const Icon = weatherIcon(cell.code, cell.day)
						return (
							<div key={cell.key} className='flex flex-col items-center gap-0.5 text-xs opacity-80'>
								<span>{cell.label || hourLabel(cell.hour, hour12)}</span>
								<Icon className='text-2xl' />
								<span className='font-mono'>{cell.primary}</span>
								<span className='font-mono opacity-60'>{cell.precip >= 10 ? `${cell.precip}%` : ' '}</span>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

// ── Cards ─────────────────────────────────────────────────────────────────────
type Actions = {
	rename: (id: string, label: string) => void
	remove: (id: string) => void
	scrubToWall: ScrubToWall
}

const TrackCard = ({
	track,
	actions,
	expanded,
	onToggle,
	onEditLocation,
}: {
	track: Track
	actions: Actions
	expanded: boolean
	onToggle: () => void
	onEditLocation: () => void
}) => {
	const { instant, home } = useSettings()
	const { city, id, label } = track
	const gap = zoneOffset(city.timeZone, instant) - zoneOffset(home.timeZone, instant)
	const delta = dayDelta(city.timeZone, home.timeZone, instant)
	const expandable = !isUtc(city)
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-reorder + expand surface — the chevron <button> is the accessible path, and the div can't be a button (nested-interactive)
		// biome-ignore lint/a11y/useKeyWithClickEvents: same — keyboard users expand via the chevron button
		<div
			ref={setNodeRef}
			// Translate, not Transform — Transform includes a scale that stretches cards when
			// an expanded card and a collapsed one trade differently-sized slots mid-drag
			style={{ transform: CSS.Translate.toString(transform), transition }}
			{...attributes}
			{...listeners}
			className={`card group cursor-grab bg-base-200 active:cursor-grabbing ${isDragging ? 'z-10 opacity-60' : ''}`}
			onClick={(event) => {
				// Element, not HTMLElement — clicks on the react-icons <svg> inside buttons must be caught too.
				// [popover] keeps clicks inside the time-picker popover from toggling the card.
				if (event.target instanceof Element && event.target.closest('button, input, [popover]')) return
				if (expandable) onToggle()
			}}
		>
			<div className='card-body px-5 py-4'>
				<div className='flex items-center justify-between gap-3'>
					<div className='min-w-0'>
						<div className='flex items-baseline gap-2'>
							<Editable
								display={label}
								edit={label}
								commit={(draft) => draft.trim() && actions.rename(id, draft.trim())}
								title='rename'
								className='text-xl font-medium'
							/>
							<button
								type='button'
								title={`move ${label} to a different city`}
								className='min-w-0 truncate text-xs uppercase tracking-wider opacity-40 hover:opacity-80'
								onClick={onEditLocation}
							>
								{city.name.toLowerCase() === label.toLowerCase() ? <LuMapPin /> : city.name}
							</button>
						</div>
						<div className='mt-1 text-sm opacity-60'>
							<WeatherChip city={city} />
						</div>
					</div>
					<div className='flex items-center gap-1'>
						<div className='flex flex-col items-end'>
							<EditableTime timeZone={city.timeZone} className='text-5xl font-extralight tracking-tight' />
							<div className='flex items-center gap-2 font-mono text-sm opacity-60'>
								<span>{formatSignedGap(gap)}</span>
								{delta !== 0 && <span className='badge badge-sm'>{dayDeltaLabel(delta)}</span>}
							</div>
						</div>
						<div className='flex flex-col items-center gap-1'>
							<button
								type='button'
								aria-label={`remove ${label}`}
								className={`${ICON_BUTTON} opacity-0 transition group-hover:opacity-60 hover:opacity-100!`}
								onClick={() => actions.remove(id)}
							>
								✕
							</button>
							{expandable && <ExpandButton expanded={expanded} onClick={onToggle} />}
						</div>
					</div>
				</div>
				{expanded && expandable && <ForecastPanel city={city} />}
			</div>
		</div>
	)
}

// ── App ───────────────────────────────────────────────────────────────────────
type SearchMode = { kind: 'add' | 'home' } | { kind: 'track'; id: string }

const App = () => {
	const stored = useRef(loadStored()).current
	const [now, setNow] = useState(() => Date.now())
	const [scrubbed, setScrubbed] = useState<number | null>(null)
	const [roster, setRoster] = useState<Track[]>(() => initialRoster(stored))
	const [hour12, setHour12] = useState(stored?.hour12 ?? localeHour12())
	const [fahrenheit, setFahrenheit] = useState(stored?.fahrenheit ?? localeFahrenheit())
	const [showSeconds, setShowSeconds] = useState(stored?.showSeconds ?? true)
	const [forecastMode, setForecastMode] = useState<ForecastMode>(stored?.forecastMode ?? 'hourly')
	const [homeOverride, setHomeOverride] = useState<City | null>(stored?.homeOverride ?? null)
	const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
	const [query, setQuery] = useState('')
	const [expandedIds, setExpandedIds] = useState<string[]>([])
	// find, not includes/cast — a stale stored value from a removed view falls back to list
	const [view, setView] = useState<View>(VIEWS.find((entry) => entry === stored?.view) ?? 'list')

	const { detected, pending: homePending } = useDetectedHome()
	const home = homeOverride ?? detected
	const instant = scrubbed ?? now
	const homeExpanded = expandedIds.includes('home')
	const { matches, searching } = useCitySearch(query)
	const { weather, ready: weatherReady } = useWeather([home, ...roster.map((track) => track.city)], fahrenheit)

	const stateRef = useRef({ now, instant, searchOpen: false })
	useEffect(() => {
		stateRef.current = { now, instant, searchOpen: searchMode !== null }
	})

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	// persist (skip the initial render so an untouched demo roster stays ephemeral)
	const persistReady = useRef(false)
	useEffect(() => {
		if (!persistReady.current) {
			persistReady.current = true
			return
		}
		const payload: Stored = {
			tracks: roster.map(({ label, city }) => ({ label, city })),
			hour12,
			fahrenheit,
			showSeconds,
			forecastMode,
			homeOverride,
			view,
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
	}, [roster, hour12, fahrenheit, showSeconds, forecastMode, homeOverride, view])

	// ── scrub ──
	const animationRef = useRef(0)

	const animateTo = (target: number | null) => {
		cancelAnimationFrame(animationRef.current)
		const from = stateRef.current.instant
		const start = performance.now()
		const step = (frameTime: number) => {
			const t = Math.min(1, (frameTime - start) / 300)
			const goal = target ?? stateRef.current.now
			setScrubbed(t < 1 ? from + (goal - from) * (1 - (1 - t) ** 3) : target)
			if (t < 1) animationRef.current = requestAnimationFrame(step)
		}
		animationRef.current = requestAnimationFrame(step)
	}

	const closeSearch = () => {
		setSearchMode(null)
		setQuery('')
	}

	// arrows scrub an hour (shift = a day), n = back to now, esc closes search — or clears the scrub.
	// Registered once: everything it touches is a stable setter or a ref.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') return stateRef.current.searchOpen ? closeSearch() : animateTo(null)
			if (event.target instanceof HTMLElement && event.target.closest('input')) return
			const step = event.shiftKey ? DAY : HOUR
			if (event.key === 'ArrowRight') animateTo(stateRef.current.instant + step)
			else if (event.key === 'ArrowLeft') animateTo(stateRef.current.instant - step)
			else if (event.key === 'n') animateTo(null)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	// ── roster actions ──
	// pre-fill retarget searches with the current city so a typo or misclick is a two-keystroke fix
	const openSearch = (mode: SearchMode, prefill = '') => {
		setSearchMode(mode)
		setQuery(prefill)
	}

	const pickCity = (city: City) => {
		if (searchMode?.kind === 'home') setHomeOverride(city)
		else if (searchMode?.kind === 'track')
			setRoster(
				roster.map((track) =>
					track.id === searchMode.id
						? {
								...track,
								city,
								// a label that was just echoing the old city follows the move; a person's name stays
								label: track.label.toLowerCase() === track.city.name.toLowerCase() ? city.name : track.label,
							}
						: track,
				),
			)
		else setRoster([...roster, { id: crypto.randomUUID(), label: city.name, city }])
		closeSearch()
	}

	const toggleExpanded = (id: string) =>
		setExpandedIds(expandedIds.includes(id) ? expandedIds.filter((entry) => entry !== id) : [...expandedIds, id])

	const expandableIds = ['home', ...roster.filter((track) => !isUtc(track.city)).map((track) => track.id)]
	const allExpanded = expandableIds.every((id) => expandedIds.includes(id))

	// dnd-kit: distance threshold keeps plain clicks (expand, buttons) from starting a drag
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
	)

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return
		const from = roster.findIndex((track) => track.id === active.id)
		const to = roster.findIndex((track) => track.id === over.id)
		if (from !== -1 && to !== -1) setRoster(arrayMove(roster, from, to))
	}

	const actions: Actions = {
		rename: (id, label) => setRoster(roster.map((track) => (track.id === id ? { ...track, label } : track))),
		remove: (id) => setRoster(roster.filter((track) => track.id !== id)),
		scrubToWall: (timeZone, candidates) => {
			const current = (localMs(timeZone, stateRef.current.instant) % DAY) / 60_000
			// wrap each candidate into the nearest ±12h so "9am" never scrubs the long way round
			const nearest = candidates
				.map((minutes) => ((minutes - current + 2160) % 1440) - 720)
				.reduce((best, delta) => (Math.abs(delta) < Math.abs(best) ? delta : best))
			animateTo(stateRef.current.instant + nearest * 60_000)
		},
	}

	const settings: Settings = {
		instant,
		home,
		hour12,
		showSeconds,
		fahrenheit,
		forecastMode,
		weather,
		weatherReady,
		scrubToWall: actions.scrubToWall,
	}

	// weather/forecast toggles only matter where weather shows — the list's cards
	const toggles = [
		...(view === 'list'
			? [
					{
						key: 'expand',
						content: allExpanded ? <LuChevronsDownUp /> : <LuChevronsUpDown />,
						label: `${allExpanded ? 'collapse' : 'expand'} all cards`,
						onClick: () => setExpandedIds(allExpanded ? [] : expandableIds),
					},
					{
						key: 'mode',
						content: forecastMode,
						onClick: () => setForecastMode(forecastMode === 'hourly' ? 'daily' : 'hourly'),
					},
					{ key: 'unit', content: `°${fahrenheit ? 'F' : 'C'}`, onClick: () => setFahrenheit(!fahrenheit) },
				]
			: []),
		{ key: 'seconds', content: showSeconds ? ':ss' : ':—', onClick: () => setShowSeconds(!showSeconds) },
		{ key: 'cycle', content: hour12 ? '12h' : '24h', onClick: () => setHour12(!hour12) },
	]

	return (
		<ThemeProvider>
			<SettingsContext value={settings}>
				<div className='flex min-h-dvh flex-col'>
					<header className='flex items-center gap-2 px-4 py-3'>
						<div role='tablist' className='tabs tabs-border tabs-sm mr-auto'>
							{VIEWS.map((entry) => (
								<button
									key={entry}
									type='button'
									role='tab'
									aria-selected={entry === view}
									className={`tab ${entry === view ? 'tab-active' : ''}`}
									onClick={() => setView(entry)}
								>
									{entry}
								</button>
							))}
						</div>
						<ThemePicker variant='modal' />
						{toggles.map(({ key, content, label, onClick }) => (
							<button key={key} type='button' aria-label={label} className={GHOST_BUTTON} onClick={onClick}>
								{content}
							</button>
						))}
					</header>

					{view === 'list' && (
						<main className='mx-auto flex w-full max-w-xl flex-col gap-3 p-4 pb-28'>
							<div className='flex flex-col items-center gap-1 py-8'>
								<EditableTime timeZone={home.timeZone} className='text-7xl font-extralight tracking-tight' />
								<div className='flex items-center gap-3 text-base opacity-70'>
									<span>{formatDateLong(instant, home.timeZone)}</span>
									<WeatherChip city={home} />
									{!homeOverride && homePending ? (
										<span className='skeleton text-transparent'>{fallbackHome.name}</span>
									) : (
										<button
											type='button'
											title='not where you are? set your location'
											className='hover:opacity-75'
											onClick={() => openSearch({ kind: 'home' }, home.name)}
										>
											{home.name}
										</button>
									)}
									{scrubbed !== null && (
										<button type='button' className='btn btn-xs' onClick={() => animateTo(null)}>
											↺ now
										</button>
									)}
									<ExpandButton expanded={homeExpanded} onClick={() => toggleExpanded('home')} />
								</div>
								{homeExpanded && <ForecastPanel city={home} />}
							</div>
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
								<SortableContext items={roster.map((track) => track.id)} strategy={verticalListSortingStrategy}>
									{roster.map((track) => (
										<TrackCard
											key={track.id}
											track={track}
											actions={actions}
											expanded={expandedIds.includes(track.id)}
											onToggle={() => toggleExpanded(track.id)}
											onEditLocation={() => openSearch({ kind: 'track', id: track.id }, track.city.name)}
										/>
									))}
								</SortableContext>
							</DndContext>
						</main>
					)}

					{view === 'list' && (
						<div className='fab'>
							<button
								type='button'
								aria-label='add a place'
								className='btn btn-circle btn-xl shadow-lg'
								onClick={() => openSearch({ kind: 'add' })}
							>
								＋
							</button>
						</div>
					)}

					{searchMode !== null && (
						<div className='modal modal-open modal-bottom sm:modal-middle'>
							<div className='modal-box flex flex-col gap-2'>
								<label className='input w-full'>
									<input
										className='grow'
										placeholder={searchMode.kind === 'home' ? 'where are you actually?' : 'search any city…'}
										value={query}
										// biome-ignore lint/a11y/noAutofocus: modal exists only after an explicit press; focus belongs in its search box
										autoFocus
										onFocus={(event) => event.target.select()}
										onChange={(event) => setQuery(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === 'Enter' && matches[0]) pickCity(matches[0])
										}}
									/>
									{searching && <span className='loading loading-spinner loading-sm' />}
								</label>
								<ul className='menu w-full'>
									{searchMode.kind === 'home' && homeOverride && (
										<li>
											<button
												type='button'
												onClick={() => {
													setHomeOverride(null)
													closeSearch()
												}}
											>
												use auto-detected ({detected.name})
											</button>
										</li>
									)}
									{matches.map((city) => (
										<li key={`${city.name}-${city.latitude}-${city.longitude}`}>
											<button
												type='button'
												className='flex items-baseline justify-between'
												onClick={() => pickCity(city)}
											>
												<span>
													{city.name} <span className='text-xs opacity-50'>{city.country}</span>
												</span>
												<span className='font-mono text-xs opacity-60'>
													{formatTime(now, city.timeZone, hour12, false)}
												</span>
											</button>
										</li>
									))}
								</ul>
							</div>
							<button type='button' className='modal-backdrop' aria-label='close' onClick={closeSearch} />
						</div>
					)}
				</div>
			</SettingsContext>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
