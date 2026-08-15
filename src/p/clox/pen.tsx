import {
	closestCenter,
	DndContext,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import type { DragEndEvent } from 'https://esm.sh/@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import { ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { createContext, use, useEffect, useReducer, useRef, useState } from 'https://esm.sh/react'
import type { ReactNode } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuChevronsDownUp, LuChevronsUpDown, LuClock, LuMapPin } from 'https://esm.sh/react-icons/lu'
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
	const match = /GMT([+-])(\d{2}):(\d{2})/.exec(parts.find((part) => part.type === 'timeZoneName')?.value ?? '')
	const offset = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * HOUR + Number(match[3]) * 60_000) : 0
	offsetCache.set(key, offset)
	return offset
}

// Shifting the instant by the zone's offset makes UTC rendering read as that zone's wall clock
const localMs = (timeZone: string, instant: number) => instant + zoneOffset(timeZone, instant)

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

const LOCALE_HOUR12 = !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12
const LOCALE_FAHRENHEIT = navigator.language.toUpperCase().includes('US')

// keyboard hints only make sense where a keyboard is likely (the CDN tailwind build lacks pointer-* variants)
const FINE_POINTER = matchMedia('(pointer: fine)').matches

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
	const match = /^(\d{1,2})(?:[ .:]?(\d{2}))?\s*(?:(a|p)\.?m?\.?)?$/.exec(text)
	if (!match) return null
	let hour = Number(match[1])
	const minute = Number(match[2] ?? 0)
	if (hour > 23 || minute > 59) return null
	const meridiem = match[3]
	if (meridiem === 'p' && hour < 12) hour += 12
	if (meridiem === 'a' && hour === 12) hour = 0
	const explicit24 = match[1]!.length === 2 && match[1]!.startsWith('0')
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

// ── Weather (open-meteo, no key) ──────────────────────────────────────────────
type Weather = { temperature: number; code: number; feelsLike: number }

const weatherKey = (city: City) => `${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`

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

// Render helper: picking one of the static react-icons components is a lookup, not a component creation
const weatherGlyph = (code: number, day: boolean, className: string) => {
	const Icon = weatherIcon(code, day)

	return <Icon className={className} />
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
						`https://api.open-meteo.com/v1/forecast?latitude=${coords(0)}&longitude=${coords(1)}&current=temperature_2m,weather_code,apparent_temperature${fahrenheit ? '&temperature_unit=fahrenheit' : ''}`,
					)
				).json()
				type Current = { temperature_2m: number; weather_code: number; apparent_temperature: number }

				const list: { current?: Current }[] = Array.isArray(parsed) ? parsed : [parsed]
				if (cancelled) return
				const next: Record<string, Weather> = {}
				list.forEach(({ current }, index) => {
					if (current)
						next[keys[index]!] = {
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
// One cell shape serves both modes: hourly = temp + rain %, daily = high (primary) / low (secondary) + rain %
type ForecastCell = {
	time: string
	label: string
	code: number
	day: boolean
	primary: string
	secondary?: string
	precip: number
}

type ForecastMode = 'daily' | 'hourly'

const FORECAST_FIELDS: Record<ForecastMode, string> = {
	hourly: 'hourly=temperature_2m,weather_code,precipitation_probability,is_day&forecast_hours=12',
	daily: 'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7',
}
const forecastCache = new Map<string, ForecastCell[]>()

const useForecast = (city: City, fahrenheit: boolean, mode: ForecastMode) => {
	const [, bump] = useReducer((count: number) => count + 1, 0)
	const key = `${weatherKey(city)}:${fahrenheit}:${mode}`

	useEffect(() => {
		if (forecastCache.has(key)) return
		let cancelled = false

		const load = async () => {
			try {
				const parsed: Partial<Record<ForecastMode, Record<string, unknown[]>>> = await (
					await fetch(
						`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&${FORECAST_FIELDS[mode]}&timezone=auto${fahrenheit ? '&temperature_unit=fahrenheit' : ''}`,
					)
				).json()
				const block = parsed[mode] ?? {}
				const at = (field: string, index: number) => round(block[field]?.[index])
				const hourly = mode === 'hourly'
				forecastCache.set(
					key,
					(block.time ?? []).map(String).map((time, index) => ({
						time,
						// hourly labels depend on the 12/24h setting, so ForecastPanel derives them from `time` at render
						label: index === 0 ? (hourly ? 'now' : 'today') : hourly ? '' : weekdayOf(time),
						code: at('weather_code', index),
						day: !hourly || at('is_day', index) === 1,
						primary: `${at(hourly ? 'temperature_2m' : 'temperature_2m_max', index)}°`,
						secondary: hourly ? undefined : `${at('temperature_2m_min', index)}°`,
						precip: at(hourly ? 'precipitation_probability' : 'precipitation_probability_max', index),
					})),
				)
			} catch {
				forecastCache.set(key, []) // failed — panel just shows nothing
			}

			if (!cancelled) bump()
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

const useDetectedHome = () => {
	const [detected, setDetected] = useState(fallbackHome)
	const [pending, setPending] = useState(true)
	useEffect(() => {
		let cancelled = false

		const lookup = async () => {
			// ipwho.is first (keyless, CORS, generous), ipapi.co as backup — both throttle bursts with 429s
			for (const url of ['https://ipwho.is/', 'https://ipapi.co/json/']) {
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
				} catch {
					// provider unreachable — try the next one
				}
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
	const [matches, setMatches] = useState<City[]>(() => {
		const lower = query.trim().toLowerCase()
		return lower && lower.length < 2 && 'utc'.startsWith(lower) ? [UTC_CITY] : []
	})
	const [searching, setSearching] = useState(query.trim().length >= 2)

	// Short queries resolve synchronously — adjust state during render, not in the effect
	const [prevQuery, setPrevQuery] = useState(query)

	if (prevQuery !== query) {
		setPrevQuery(query)
		const lower = query.trim().toLowerCase()

		if (lower.length < 2) {
			setSearching(false)
			setMatches(lower && 'utc'.startsWith(lower) ? [UTC_CITY] : [])
		} else setSearching(true)
	}

	useEffect(() => {
		const lower = query.trim().toLowerCase()
		if (lower.length < 2) return
		const utcMatch = 'utc'.startsWith(lower) ? [UTC_CITY] : []
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
					.map(({ name, admin1, country_code: countryCode, latitude, longitude, timezone }) => ({
						name,
						country: [admin1, countryCode].filter(Boolean).join(', '),
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
const VIEWS = ['list', 'bands'] as const
type View = (typeof VIEWS)[number]

type Track = { id: string; label: string; city: City }

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
	scrubToWall: (timeZone: string, candidates: number[]) => void
	rename: (id: string, label: string) => void
	remove: (id: string) => void
}

const SettingsContext = createContext<Settings>(null!)
const useSettings = () => use(SettingsContext)

const loadStored = (): Stored | null => {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
	} catch {
		return null
	}
}

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
	// display and input share one box so swapping shifts nothing — 1lh is exactly one line of the caller's own text size
	const shared = `h-[1lh] leading-tight field-sizing-content ${className ?? ''}`
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
					const [hours, minutes] = event.target.value.split(':')
					if (hours && minutes) scrubToWall(timeZone, [Number(hours) * 60 + Number(minutes)])
				}}
			/>
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
		</span>
	)
}

// Pressing the block itself expands its forecast; clicks that land on a control belong to that control
const expandOnClick = (onToggle: () => void) => (event: { target: EventTarget | null }) => {
	// Element, not HTMLElement — clicks on the react-icons <svg> inside buttons must be caught too
	if (event.target instanceof Element && event.target.closest('button, input')) return
	onToggle()
}

// ── Weather widgets ───────────────────────────────────────────────────────────
const WeatherChip = ({ city }: { city: City }) => {
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
						return (
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
						)
					})}
				</div>
			)}
		</div>
	)
}

// ── Cards ─────────────────────────────────────────────────────────────────────
const TrackCard = ({
	track,
	expanded,
	onToggle,
	onEditLocation,
}: {
	track: Track
	expanded: boolean
	onToggle: () => void
	onEditLocation: () => void
}) => {
	const { instant, home, rename, remove } = useSettings()
	const { city, id, label } = track
	const gap = zoneOffset(city.timeZone, instant) - zoneOffset(home.timeZone, instant)
	const delta = dayDelta(city.timeZone, home.timeZone, instant)
	const expandable = !isUtc(city)
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events -- drag-reorder + expand surface; the div can't be a button (nested-interactive), and the header's expand-all button is the keyboard path
		<div
			ref={setNodeRef}
			// Translate, not Transform — Transform includes a scale that stretches cards when
			// an expanded card and a collapsed one trade differently-sized slots mid-drag
			style={{ transform: CSS.Translate.toString(transform), transition }}
			{...attributes}
			{...listeners}
			className={`card group cursor-grab bg-base-200 active:cursor-grabbing ${isDragging ? 'z-10 opacity-60' : ''}`}
			onClick={expandOnClick(() => expandable && onToggle())}
		>
			<div className='card-body gap-2 px-4 py-3 sm:px-5 sm:py-4'>
				<div className='flex items-center gap-2 sm:gap-3'>
					<div className='min-w-0 grow'>
						<div className='flex items-baseline gap-2'>
							<Editable
								display={label}
								edit={label}
								commit={(draft) => draft.trim() && rename(id, draft.trim())}
								title='rename'
								className='text-lg font-medium sm:text-xl'
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
						className='btn btn-circle btn-xs transition sm:opacity-0 sm:group-hover:opacity-60 hover:opacity-100! absolute -top-2 -right-2'
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

// ── Bands view ────────────────────────────────────────────────────────────────
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
	}).join()})`

// The whole row is the band: meta rides on top of the gradient, so bars get the full width
// and the row auto-sizes to its content before growing into the leftover screen
const BandRow = ({ label, city, start }: { label: string; city: City; start: number }) => {
	const { instant, home, hour12, showSeconds } = useSettings()
	const gap = zoneOffset(city.timeZone, instant) - zoneOffset(home.timeZone, instant)
	const delta = dayDelta(city.timeZone, home.timeZone, instant)
	const firstTick = Math.ceil(localMs(city.timeZone, start) / LABEL_STEP) * LABEL_STEP
	return (
		<div
			className='relative grow overflow-hidden rounded-field bg-base-200'
			style={isUtc(city) ? undefined : { background: bandGradient(city, start) }}
		>
			<div className='flex items-baseline justify-between gap-2 p-2 pb-5 sm:gap-3 sm:p-3 sm:pb-3'>
				<div className='flex min-w-0 items-baseline gap-2'>
					<span className='truncate font-medium'>{label}</span>
					{city.name.toLowerCase() !== label.toLowerCase() && (
						<span className='truncate text-xs uppercase tracking-wider opacity-40'>{city.name}</span>
					)}
					{delta !== 0 && <span className='badge badge-sm'>{dayDeltaLabel(delta)}</span>}
				</div>
				{/* time anchors right so an extra digit grows into the slack instead of shifting the row */}
				<div className='flex items-baseline gap-2 whitespace-nowrap font-mono'>
					<span className='text-xs opacity-60 sm:text-sm'>{formatSignedGap(gap)}</span>
					<span className='text-xl font-extralight tracking-tight sm:text-2xl'>
						{formatTime(instant, city.timeZone, hour12, showSeconds)}
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

const BandsView = ({
	roster,
	now,
	scrubbed,
	onScrub,
	onSettle,
}: {
	roster: Track[]
	now: number
	scrubbed: number | null
	onScrub: (instant: number) => void
	onSettle: (target: number | null) => void
}) => {
	const { instant, home } = useSettings()
	const surfaceRef = useRef<HTMLDivElement>(null)
	// ±12h around now, floored to the scrub grain so bars and labels don't creep a hair every tick
	const start = Math.floor(now / QUARTER_HOUR) * QUARTER_HOUR - DAY / 2
	const rows = [{ id: 'home', label: home.name, city: home }, ...roster]

	const instantAt = (clientX: number) => {
		const { left, width } = surfaceRef.current!.getBoundingClientRect()
		return start + Math.min(1, Math.max(0, (clientX - left) / width)) * DAY
	}

	return (
		<main className='mx-auto flex w-full max-w-6xl grow flex-col p-3 sm:p-4'>
			<div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-4 text-sm opacity-70 sm:text-base'>
				<span>{formatDateLong(instant, home.timeZone)}</span>
				{scrubbed !== null && (
					<>
						<span className='font-mono'>{formatSignedGap(instant - now)}</span>
						<button type='button' className='btn btn-xs' onClick={() => onSettle(null)}>
							↺ now
						</button>
					</>
				)}
			</div>
			{/* Rows share the leftover height; the container is the drag surface so one line
			    crosses every bar, gaps included. Keyboard scrubbing stays on the global arrow keys */}
			<div
				ref={surfaceRef}
				className='relative flex grow cursor-ew-resize touch-none select-none flex-col gap-2'
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId)
					onScrub(instantAt(event.clientX))
				}}
				onPointerMove={(event) => {
					if (event.buttons) onScrub(instantAt(event.clientX))
				}}
				onPointerUp={(event) => onSettle(Math.round(instantAt(event.clientX) / QUARTER_HOUR) * QUARTER_HOUR)}
			>
				{rows.map((row) => (
					<BandRow key={row.id} label={row.label} city={row.city} start={start} />
				))}
				<div
					className='pointer-events-none absolute inset-y-0 border-l border-base-content/40'
					style={{ left: `${((Math.min(start + DAY, Math.max(start, instant)) - start) / DAY) * 100}%` }}
				/>
			</div>
		</main>
	)
}

// ── App ───────────────────────────────────────────────────────────────────────
type SearchMode = { kind: 'add' | 'home' } | { kind: 'track'; id: string }

const App = () => {
	const stored = useRef(loadStored()).current
	const [now, setNow] = useState(() => Date.now())
	const [scrubbed, setScrubbed] = useState<number | null>(null)
	const [roster, setRoster] = useState<Track[]>(() =>
		(stored?.tracks ?? DEMO_TRACKS.filter((entry) => entry.city.timeZone !== homeTimeZone))
			.filter((entry) => entry.city?.timeZone)
			.map((entry, index) => ({ id: `track-${index}`, label: entry.label, city: entry.city })),
	)
	const [hour12, setHour12] = useState(stored?.hour12 ?? LOCALE_HOUR12)
	const [fahrenheit, setFahrenheit] = useState(stored?.fahrenheit ?? LOCALE_FAHRENHEIT)
	// quietest defaults win: no seconds ticking, and the 7-cell daily strip over the 12-cell hourly one
	const [showSeconds, setShowSeconds] = useState(stored?.showSeconds ?? false)
	const [forecastMode, setForecastMode] = useState<ForecastMode>(stored?.forecastMode ?? 'daily')
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

	const stateRef = useRef({ now, instant, searchOpen: false, homeTimeZone: home.timeZone })
	useEffect(() => {
		stateRef.current = { now, instant, searchOpen: searchMode !== null, homeTimeZone: home.timeZone }
	})

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	// persist (skip the initial render so an untouched demo roster stays ephemeral)
	const persistReadyRef = useRef(false)
	useEffect(() => {
		if (!persistReadyRef.current) {
			persistReadyRef.current = true
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
	// where the last scrub is headed — arrow walks step from here, not the mid-animation instant
	const scrubTargetRef = useRef<number | null>(null)

	const animateTo = (target: number | null) => {
		scrubTargetRef.current = target
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

	// arrows walk 15-min boundaries of home wall time (⌘/ctrl = hours), n = back to now,
	// esc closes search — or clears the scrub. Registered once: it only touches setters and refs.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') return stateRef.current.searchOpen ? closeSearch() : animateTo(null)
			if (event.target instanceof HTMLElement && event.target.closest('input')) return
			if (event.key === 'n') return animateTo(null)
			if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
			event.preventDefault() // ⌘← is history-back in macOS browsers
			const step = event.metaKey || event.ctrlKey ? HOUR : QUARTER_HOUR
			const forward = event.key === 'ArrowRight'
			const base = scrubTargetRef.current ?? stateRef.current.instant
			const local = localMs(stateRef.current.homeTimeZone, base)
			// off a boundary walks to the nearest one in that direction; on one, a full step
			const target = forward ? Math.floor(local / step + 1) * step : Math.ceil(local / step - 1) * step
			animateTo(base + target - local)
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

	// eslint-disable-next-line @eslint-react/no-unstable-context-value -- React Compiler memoizes this value; manual useMemo is banned here
	const settings: Settings = {
		instant,
		home,
		hour12,
		showSeconds,
		fahrenheit,
		forecastMode,
		weather,
		weatherReady,
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
					{/* shrink-0 keeps the tablist from being squeezed into a two-line stack; the toggle
					    group wraps whole, and its ml-auto keeps it right-aligned on the line it lands on */}
					<header className='flex flex-wrap items-center gap-2 px-4 py-3'>
						<div role='tablist' className='tabs tabs-border tabs-sm mr-auto shrink-0'>
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
						<div className='ml-auto flex items-center gap-1 sm:gap-2'>
							<ThemePicker variant='modal' />
							{toggles.map(({ key, content, label, onClick }) => (
								<button key={key} type='button' aria-label={label} className='btn btn-ghost btn-xs' onClick={onClick}>
									{content}
								</button>
							))}
						</div>
					</header>

					{view === 'bands' && (
						<BandsView roster={roster} now={now} scrubbed={scrubbed} onScrub={setScrubbed} onSettle={animateTo} />
					)}

					{view === 'list' && (
						<main className='mx-auto flex w-full max-w-xl flex-col gap-3 p-3 pb-28 sm:p-4 sm:pb-28'>
							{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- expand surface, like the cards below it; keyboard users expand via the header's expand-all button */}
							<div
								className='flex cursor-pointer flex-col items-center gap-1 py-6 sm:py-8'
								onClick={expandOnClick(() => toggleExpanded('home'))}
							>
								<EditableTime
									timeZone={home.timeZone}
									className='text-5xl font-extralight tracking-tight sm:text-7xl'
								/>
								<div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm opacity-70 sm:text-base'>
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
								</div>
								{homeExpanded && <ForecastPanel city={home} />}
							</div>
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
								<SortableContext items={roster.map((track) => track.id)} strategy={verticalListSortingStrategy}>
									{roster.map((track) => (
										<TrackCard
											key={track.id}
											track={track}
											expanded={expandedIds.includes(track.id)}
											onToggle={() => toggleExpanded(track.id)}
											onEditLocation={() => openSearch({ kind: 'track', id: track.id }, track.city.name)}
										/>
									))}
								</SortableContext>
							</DndContext>
						</main>
					)}

					{FINE_POINTER && (
						<footer className='mt-auto flex items-center justify-center gap-4 p-4 text-xs opacity-40'>
							{[
								['15m', '←', '→'],
								['1h', '⌘/ctrl', '←', '→'],
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
