import type { DragEndEvent } from 'https://esm.sh/@dnd-kit/core'
import {
	closestCenter,
	DndContext,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import { ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { parseAsString, parseAsStringLiteral, useQueryState } from 'https://esm.sh/nuqs'
import { NuqsAdapter } from 'https://esm.sh/nuqs/adapters/react'
import type { ReactNode } from 'https://esm.sh/react'
import { createContext, use, useEffect, useReducer, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuChevronsDownUp, LuChevronsUpDown, LuClock, LuLocateFixed, LuMapPin } from 'https://esm.sh/react-icons/lu'
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
import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'

const HOUR = 3_600_000
const DAY = 86_400_000
const QUARTER_HOUR = 900_000
const RADIAN = Math.PI / 180
const STORAGE_KEY = 'clox'

type City = { name: string; country: string; latitude: number; longitude: number; timeZone: string }

const UTC_CITY: City = { name: 'UTC', country: '', latitude: 0, longitude: 0, timeZone: 'UTC' }
const isUtc = (city: City) => city.timeZone === 'UTC'

// Seed board, after the detected city: one westward gap, one whole-hour gap, and one half-hour gap
// that also crosses the date line of the day — between them they exercise every badge a card can show
const DEMO_CITIES: City[] = [
	{ name: 'New York', country: 'US', latitude: 40.71, longitude: -74.01, timeZone: 'America/New_York' },
	{ name: 'Los Angeles', country: 'US', latitude: 34.05, longitude: -118.24, timeZone: 'America/Los_Angeles' },
	{ name: 'London', country: 'GB', latitude: 51.51, longitude: -0.13, timeZone: 'Europe/London' },
	{ name: 'Hyderabad', country: 'IN', latitude: 17.38, longitude: 78.46, timeZone: 'Asia/Kolkata' },
]

const round = (value: unknown) => Math.round(Number(value ?? 0))

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

type TimeFormat = { instant: number; timeZone: string; hour12: boolean; seconds: boolean }

const formatTime = ({ instant, timeZone, hour12, seconds }: TimeFormat) =>
	getFormatter({
		timeZone,
		hour: 'numeric',
		minute: '2-digit',
		second: seconds ? '2-digit' : undefined,
		hour12,
	}).format(instant)

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

// a Map, not an object: the key is whatever you typed, and "constructor" is not a time of day
const NAMED_TIMES = new Map([
	['noon', [720]],
	['midnight', [0]],
])

// A meridiem folds the written hour into 24h and settles the answer to one candidate
const MERIDIEM_HOUR: Record<string, (hour: number) => number> = {
	a: (hour) => (hour === 12 ? 0 : hour),
	p: (hour) => (hour < 12 ? hour + 12 : hour),
}

// Accepts "9", "9:30", "930", "0930", "9.30", "9 30", "9p", "9:30 pm", "noon", "midnight".
// Without a meridiem, 1–12 returns both wall-clock candidates; the scrubber jumps to whichever is nearest.
// A leading zero ("09", "0930") or an hour ≥ 13 reads as explicit 24h and stays single.
const parseWallTime = (raw: string): number[] | null => {
	const text = raw.trim().toLowerCase()
	const named = NAMED_TIMES.get(text)
	if (named) return named
	const match = /^(\d{1,2})(?:[ .:]?(\d{2}))?\s*(?:(a|p)\.?m?\.?)?$/.exec(text)
	if (!match) return null
	const hourField = match[1]!
	const hour = Number(hourField)
	const minute = Number(match[2] ?? 0)
	if (hour > 23 || minute > 59) return null
	const fold = MERIDIEM_HOUR[match[3] ?? '']
	if (fold) return [fold(hour) * 60 + minute]
	// a leading zero ("09", "0930") or an hour outside 1–12 reads as explicit 24h and stays single
	if (hourField.startsWith('0') || hour === 0 || hour > 12) return [hour * 60 + minute]
	return [(hour % 12) * 60 + minute, ((hour % 12) + 12) * 60 + minute]
}

// NOAA-style solar altitude, used only to pick day vs night icons.
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

// Live weather from open-meteo; no API key required.
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

// Forecast is fetched per city per mode, on first expand.
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

const FORECAST_MODES = ['daily', 'hourly'] as const
type ForecastMode = (typeof FORECAST_MODES)[number]

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

// Zones the platform still reports under a superseded name.
const TIME_ZONE_ALIASES: Record<string, string> = {
	'Asia/Calcutta': 'Asia/Kolkata',
	'Asia/Saigon': 'Asia/Ho_Chi_Minh',
	'Asia/Rangoon': 'Asia/Yangon',
	'Europe/Kiev': 'Europe/Kyiv',
	'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
}
const unalias = (timeZone: string | undefined) => (timeZone ? (TIME_ZONE_ALIASES[timeZone] ?? timeZone) : undefined)
const localTimeZone = unalias(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC'

// 'America/Argentina/Buenos_Aires' → 'Buenos Aires': the city a zone is named after, close enough that a
// board seeded from the zone alone still reads like a place
const prettifyZone = (timeZone: string) => timeZone.split('/').at(-1)!.replaceAll('_', ' ')

const fallbackCity: City = {
	name: prettifyZone(localTimeZone),
	country: '',
	latitude: 20,
	longitude: (zoneOffset(localTimeZone, Date.now()) / HOUR) * 15,
	timeZone: localTimeZone,
}

// The IANA zone resolves immediately; IP geolocation refines it to a real city.
const useDetectedCity = () => {
	const [detected, setDetected] = useState(fallbackCity)
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
						longitude: data.longitude ?? fallbackCity.longitude,
						// ipwho.is nests the zone under timezone.id; ipapi.co returns it flat
						timeZone: unalias(data.timezone?.id ?? data.timezone) ?? localTimeZone,
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

// open-meteo geocoding, no API key required.
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

const VIEWS = ['list', 'bands'] as const
type View = (typeof VIEWS)[number]

// A place is a city plus the name you gave it — the label is yours, the city is the geocoder's
type Place = { id: string; label: string; city: City }

const citySchema = z.object({
	name: z.string(),
	country: z.string(),
	latitude: z.number(),
	longitude: z.number(),
	timeZone: z.string(),
})

// Bumping the version invalidates every stored board — there is no migration path by design
const storedSchema = z.object({
	version: z.literal(1),
	places: z.array(z.object({ label: z.string(), city: citySchema })),
	hour12: z.boolean(),
	fahrenheit: z.boolean(),
	showSeconds: z.boolean(),
	forecastMode: z.enum(FORECAST_MODES),
	view: z.enum(VIEWS),
})
type Stored = z.infer<typeof storedSchema>

type Preferences = Pick<Stored, 'fahrenheit' | 'forecastMode' | 'hour12' | 'showSeconds'>

// Everything below the App reads the same view state, so it rides context instead of props
type Settings = Preferences & {
	instant: number
	// the top place: every gap, day badge and date on screen is measured from its zone
	reference: City
	weather: Record<string, Weather>
	weatherReady: boolean
	scrubToWall: (timeZone: string, candidates: number[]) => void
	rename: (id: string, label: string) => void
	remove: (id: string) => void
}

const SettingsContext = createContext<Settings>(null!)
const useSettings = () => use(SettingsContext)

const loadStored = () => {
	try {
		const parsed = storedSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

const toPlaces = (entries: { label: string; city: City }[]) =>
	entries.map((entry) => ({ id: R.randomString(21), label: entry.label, city: entry.city }))

// Entry 0 starts as the zone-derived guess and is re-run with the IP-detected city once that lands (see App)
const seedEntries = (first: City) =>
	[first, ...DEMO_CITIES.filter((city) => city.timeZone !== localTimeZone)].map((city) => ({
		label: city.name,
		city,
	}))

// ── the board as a URL ──
// A shared board has to survive being pasted into a chat window, so every field earns its place: the zone's
// region is a digit, coordinates round to the ~11 km the weather grid works at anyway, and the name and
// label are written only when they aren't already implied by the field before them. Entries are joined by
// `;`, their fields by `,`, and a label follows `!` — nuqs leaves all three unescaped.
//
//   ?cities=4Kolkata,17.4,78.5,Hyderabad;1New_York,40.7,-74;7London,51.5,-0.1!Priya
//
// The digit indexes this list, so it is frozen: appending is safe, reordering breaks every link ever shared.
const ZONE_REGIONS = [
	'Africa',
	'America',
	'Antarctica',
	'Arctic',
	'Asia',
	'Atlantic',
	'Australia',
	'Europe',
	'Indian',
	'Pacific',
]
// supportedValuesOf lists the 418 region/city zones and nothing else, so plain UTC has to be added back
const ZONES = new Set([...Intl.supportedValuesOf('timeZone'), UTC_CITY.timeZone])

type Entry = { label: string; city: City }

const encodeEntry = ({ label, city }: Entry) => {
	const [region = '', ...rest] = city.timeZone.split('/')
	const index = ZONE_REGIONS.indexOf(region)
	// a zone with no region, or one from a region this list has never heard of, is written whole
	const zone = rest.length && index !== -1 ? `${index}${rest.join('/')}` : city.timeZone
	const coordinates = [city.latitude, city.longitude].map((value) => Number(value.toFixed(1)))
	const name = city.name === prettifyZone(city.timeZone) ? '' : `,${city.name}`
	return `${zone},${coordinates.join(',')}${name}${label === city.name ? '' : `!${label}`}`
}

const decodeEntry = (entry: string): Entry | null => {
	// the label is whatever follows the first `!`, so it may hold commas and exclamation marks of its own
	const bang = entry.indexOf('!')
	const label = bang === -1 ? '' : entry.slice(bang + 1)
	const [zoneField = '', ...fields] = (bang === -1 ? entry : entry.slice(0, bang)).split(',')
	const [, index, tail] = /^(\d)(.+)/.exec(zoneField) ?? []
	const timeZone = index === undefined ? zoneField : `${ZONE_REGIONS[Number(index)] ?? ''}/${tail}`
	const latitude = Number(fields[0])
	const longitude = Number(fields[1])
	if (!ZONES.has(timeZone) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
	const written = fields[2] ?? ''
	const name = written === '' ? prettifyZone(timeZone) : written
	return { label: label === '' ? name : label, city: { name, country: '', latitude, longitude, timeZone } }
}

// One bad entry drops rather than taking the board down with it; a board with nothing left is no board
const decodeBoard = (cities: string | null) => {
	const entries = (cities ?? '')
		.split(';')
		.filter(Boolean)
		.map(decodeEntry)
		.filter((entry) => entry !== null)
	return entries.length ? entries : null
}

// quietest defaults win: no seconds ticking, and the 7-cell daily strip over the 12-cell hourly one
const DEFAULTS = {
	hour12: LOCALE_HOUR12,
	fahrenheit: LOCALE_FAHRENHEIT,
	showSeconds: false,
	forecastMode: 'daily',
	view: 'list',
} satisfies Omit<Stored, 'places' | 'version'>

// One shape, one key order, so two payloads can be compared as strings
const toStored = (
	places: Entry[],
	{ hour12, fahrenheit, showSeconds, forecastMode, view }: Omit<Stored, 'places' | 'version'>,
): Stored => ({ version: 1, places, hour12, fahrenheit, showSeconds, forecastMode, view })

const initialPreferences = (stored: Stored | null): Preferences => ({
	hour12: stored?.hour12 ?? DEFAULTS.hour12,
	fahrenheit: stored?.fahrenheit ?? DEFAULTS.fahrenheit,
	showSeconds: stored?.showSeconds ?? DEFAULTS.showSeconds,
	forecastMode: stored?.forecastMode ?? DEFAULTS.forecastMode,
})

// What the session starts from — read once, at mount. `seeded` means neither a link nor a saved board
// supplied it, which is the only case IP detection is allowed to rewrite.
const readOrigin = (cities: string | null, viewParam: View | null) => {
	const stored = loadStored()
	const urlEntries = decodeBoard(cities)
	return {
		stored,
		urlEntries,
		seeded: !stored && !urlEntries,
		preferences: initialPreferences(stored),
		view: viewParam ?? stored?.view ?? DEFAULTS.view,
	}
}

type Origin = ReturnType<typeof readOrigin>

// A link's board, then your saved one, then the seed
const startEntries = ({ stored, urlEntries }: Origin, first: City) => urlEntries ?? stored?.places ?? seedEntries(first)

// The seed's first entry holds fallbackCity itself, so identity alone says "still the zone-derived guess":
// retargeting that card replaces the object, and detection then leaves it alone.
const applyDetection = (places: Place[], detected: City) =>
	places.map((place) =>
		place.city === fallbackCity
			? { ...place, label: place.label === place.city.name ? detected.name : place.label, city: detected }
			: place,
	)

// Both mirrors stay quiet until the state differs from what the session started with — so a first visit stays
// ephemeral (including the render where IP detection fills in the real city, which is the pen acting, not
// you), and a link you opened and left alone neither dirties the address bar nor overwrites your saved board
const usePersistence = ({
	origin,
	places,
	detected,
	preferences,
	view,
	cities,
	setCities,
}: {
	origin: Origin
	places: Place[]
	detected: City
	preferences: Preferences
	view: View
	cities: string | null
	setCities: (cities: string | null) => void
}) => {
	const entries = places.map(({ label, city }) => ({ label, city }))
	const initialEntries = startEntries(origin, detected)

	const payload = JSON.stringify(toStored(entries, { ...preferences, view }))
	const initialPayload = JSON.stringify(toStored(initialEntries, origin.stored ?? DEFAULTS))
	const hasWrittenRef = useRef(false)
	useEffect(() => {
		// once this session has written, it keeps writing, so putting a setting back re-syncs the saved board
		if (payload === initialPayload && !hasWrittenRef.current) return
		hasWrittenRef.current = true
		localStorage.setItem(STORAGE_KEY, payload)
	}, [payload, initialPayload])

	const encoded = entries.map(encodeEntry).join(';')
	const initialEncoded = initialEntries.map(encodeEntry).join(';')
	useEffect(() => {
		// once the URL carries a board it keeps carrying one, right down to the empty board that clears it
		if (encoded !== initialEncoded || cities) setCities(encoded || null)
	}, [encoded, initialEncoded, cities, setCities])
}

type ScrubberInput = {
	now: number
	instant: number
	referenceTimeZone: string
	searchOpen: boolean
	onScrub: (instant: number | null) => void
	onCloseSearch: () => void
}

// How the instant moves: a 300ms ease to wherever you asked for. Arrows walk 15-min boundaries of the
// reference zone's wall time (shift = hours), n = back to now, esc closes search — or clears the scrub.
// The keydown listener registers once and an animation outlives the render that started it, so both read
// live props out of a ref rather than out of a closure.
const useScrubber = ({ now, instant, referenceTimeZone, searchOpen, onScrub, onCloseSearch }: ScrubberInput) => {
	const stateRef = useRef({ now, instant, searchOpen, referenceTimeZone, onScrub, onCloseSearch })
	useEffect(() => {
		stateRef.current = { now, instant, searchOpen, referenceTimeZone, onScrub, onCloseSearch }
	})

	const animationRef = useRef(0)
	// where the last scrub is headed — arrow walks step from here, not the mid-animation instant
	const scrubTargetRef = useRef<number | null>(null)

	// everything the animation needs already lives in a ref, so one instance serves every render —
	// which is what lets the keydown listener below register once
	const animateRef = useRef((target: number | null) => {
		scrubTargetRef.current = target
		cancelAnimationFrame(animationRef.current)
		const from = stateRef.current.instant
		const start = performance.now()

		const step = (frameTime: number) => {
			const t = Math.min(1, (frameTime - start) / 300)
			const goal = target ?? stateRef.current.now
			stateRef.current.onScrub(t < 1 ? from + (goal - from) * (1 - (1 - t) ** 3) : target)
			if (t < 1) animationRef.current = requestAnimationFrame(step)
		}

		animationRef.current = requestAnimationFrame(step)
	})

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const animateTo = animateRef.current
			if (event.key === 'Escape')
				return stateRef.current.searchOpen ? stateRef.current.onCloseSearch() : animateTo(null)
			if (event.target instanceof HTMLElement && event.target.closest('input')) return
			if (event.key === 'n') return animateTo(null)
			if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
			if (event.metaKey || event.ctrlKey || event.altKey) return // leave history-back and desktop-switch alone
			event.preventDefault() // bare arrows would scroll the page
			const step = event.shiftKey ? HOUR : QUARTER_HOUR
			const forward = event.key === 'ArrowRight'
			const base = scrubTargetRef.current ?? stateRef.current.instant
			const local = localMs(stateRef.current.referenceTimeZone, base)
			// off a boundary walks to the nearest one in that direction; on one, a full step
			const target = forward ? Math.floor(local / step + 1) * step : Math.ceil(local / step - 1) * step
			animateTo(base + target - local)
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const animateTo = (target: number | null) => animateRef.current(target)

	const scrubToWall = (timeZone: string, candidates: number[]) => {
		const current = (localMs(timeZone, stateRef.current.instant) % DAY) / 60_000
		// wrap each candidate into the nearest ±12h so "9am" never scrubs the long way round
		const nearest = candidates
			.map((minutes) => ((minutes - current + 2160) % 1440) - 720)
			.reduce((best, delta) => (Math.abs(delta) < Math.abs(best) ? delta : best))
		animateTo(stateRef.current.instant + nearest * 60_000)
	}

	return { animateTo, scrubToWall }
}

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
				display={formatTime({ instant, timeZone, hour12, seconds: showSeconds })}
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

const PlaceCard = ({
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
			{...attributes}
			{...listeners}
			className={`card group cursor-grab touch-manipulation select-none bg-base-200 active:cursor-grabbing ${isDragging ? 'z-10 opacity-60' : ''}`}
			onClick={expandOnClick(() => expandable && onToggle())}
			// useSortable's attributes already make the card focusable and announce it as a button; this is
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
	const { instant, reference, hour12, showSeconds } = useSettings()
	const gap = zoneOffset(city.timeZone, instant) - zoneOffset(reference.timeZone, instant)
	const delta = dayDelta(city.timeZone, reference.timeZone, instant)
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
const InstantStrip = ({
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

const BandsView = ({
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
	const surfaceRef = useRef<HTMLDivElement>(null)
	// ±12h around now, floored to the scrub grain so bars and labels don't creep a hair every tick
	const start = Math.floor(now / QUARTER_HOUR) * QUARTER_HOUR - DAY / 2

	const instantAt = (clientX: number) => {
		const { left, width } = surfaceRef.current!.getBoundingClientRect()
		return start + Math.min(1, Math.max(0, (clientX - left) / width)) * DAY
	}

	return (
		<main className='mx-auto flex w-full max-w-6xl grow flex-col p-3 sm:p-4'>
			<InstantStrip now={now} scrubbed={scrubbed} onSettle={onSettle} />
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
				{places.map((place) => (
					<BandRow key={place.id} label={place.label} city={place.city} start={start} />
				))}
				<div
					className='pointer-events-none absolute inset-y-0 border-l border-base-content/40'
					style={{ left: `${((Math.min(start + DAY, Math.max(start, instant)) - start) / DAY) * 100}%` }}
				/>
			</div>
		</main>
	)
}

type SearchMode = { kind: 'add' } | { kind: 'place'; id: string }

type Toggle = { key: string; content: ReactNode; label?: string; onClick: () => void }

const BoardHeader = ({
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

const ListView = ({
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
const KeyboardHints = () => {
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
const AddPlaceButton = ({ shown, onClick }: { shown: boolean; onClick: () => void }) => {
	if (!shown) return null
	return (
		<div className='fab'>
			<button type='button' aria-label='add a place' className='btn btn-circle btn-xl shadow-lg' onClick={onClick}>
				＋
			</button>
		</div>
	)
}

const SearchDialog = ({
	query,
	onQuery,
	now,
	hour12,
	detected,
	detectPending,
	onPick,
	onClose,
}: {
	query: string
	onQuery: (query: string) => void
	now: number
	hour12: boolean
	detected: City
	detectPending: boolean
	onPick: (city: City) => void
	onClose: () => void
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
						autoFocus
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

const App = () => {
	// The board and the view are shareable, so they ride in the URL; the rest are your preferences and stay
	// on this device. Replace, not push — thirty scrubs shouldn't cost thirty presses of the back button
	const [cities, setCities] = useQueryState('cities', parseAsString.withOptions({ history: 'replace' }))
	const [viewParam, setViewParam] = useQueryState(
		'view',
		parseAsStringLiteral(VIEWS).withOptions({ history: 'replace' }),
	)
	// A link's board is read once, at mount: from here on the URL mirrors state rather than driving it
	const origin = useRef(readOrigin(cities, viewParam)).current

	const [now, setNow] = useState(() => Date.now())
	const [scrubbed, setScrubbed] = useState<number | null>(null)
	const [places, setPlaces] = useState(() => toPlaces(startEntries(origin, fallbackCity)))
	const [preferences, setPreferences] = useState(origin.preferences)
	const [view, setView] = useState(origin.view)
	const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
	const [query, setQuery] = useState('')
	const [expandedIds, setExpandedIds] = useState<string[]>([])

	const { detected, pending: detectPending } = useDetectedCity()
	// Adjusting state during render (not in an effect) is the React-sanctioned shape for this,
	// same as useCitySearch above
	const [appliedDetection, setAppliedDetection] = useState(detected)

	if (origin.seeded && appliedDetection !== detected) {
		setAppliedDetection(detected)
		setPlaces(applyDetection(places, detected))
	}

	const reference = places[0]?.city ?? fallbackCity
	const instant = scrubbed ?? now
	const { weather, ready: weatherReady } = useWeather(
		places.map((place) => place.city),
		preferences.fahrenheit,
	)

	const closeSearch = () => {
		setSearchMode(null)
		setQuery('')
	}

	const { animateTo, scrubToWall } = useScrubber({
		now,
		instant,
		referenceTimeZone: reference.timeZone,
		searchOpen: searchMode !== null,
		onScrub: setScrubbed,
		onCloseSearch: closeSearch,
	})

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [])

	usePersistence({ origin, places, detected, preferences, view, cities, setCities })

	useEffect(() => {
		setViewParam(view === DEFAULTS.view ? null : view)
	}, [view, setViewParam])

	// pre-fill retarget searches with the current city so a typo or misclick is a two-keystroke fix
	const openSearch = (mode: SearchMode, prefill = '') => {
		setSearchMode(mode)
		setQuery(prefill)
	}

	const pickCity = (city: City) => {
		if (searchMode?.kind === 'place')
			setPlaces(
				places.map((place) =>
					place.id === searchMode.id
						? {
								...place,
								city,
								// a label that was just echoing the old city follows the move; a person's name stays
								label: place.label.toLowerCase() === place.city.name.toLowerCase() ? city.name : place.label,
							}
						: place,
				),
			)
		else setPlaces([...places, { id: R.randomString(21), label: city.name, city }])
		closeSearch()
	}

	const settings: Settings = {
		...preferences,
		instant,
		reference,
		weather,
		weatherReady,
		scrubToWall,
		rename: (id, label) => setPlaces(places.map((place) => (place.id === id ? { ...place, label } : place))),
		remove: (id) => setPlaces(places.filter((place) => place.id !== id)),
	}

	return (
		<ThemeProvider>
			<SettingsContext value={settings}>
				<div className='flex min-h-dvh flex-col'>
					<BoardHeader
						view={view}
						onView={setView}
						places={places}
						preferences={preferences}
						onPreferences={(patch) => setPreferences({ ...preferences, ...patch })}
						expandedIds={expandedIds}
						onExpandedIds={setExpandedIds}
					/>

					{view === 'bands' ? (
						<BandsView places={places} now={now} scrubbed={scrubbed} onScrub={setScrubbed} onSettle={animateTo} />
					) : (
						<ListView
							places={places}
							now={now}
							scrubbed={scrubbed}
							expandedIds={expandedIds}
							onSettle={animateTo}
							onExpandedIds={setExpandedIds}
							onReorder={setPlaces}
							onEditLocation={(place) => openSearch({ kind: 'place', id: place.id }, place.city.name)}
						/>
					)}

					<KeyboardHints />

					<AddPlaceButton shown={view === 'list' || !places.length} onClick={() => openSearch({ kind: 'add' })} />

					{searchMode !== null && (
						<SearchDialog
							query={query}
							onQuery={setQuery}
							now={now}
							hour12={preferences.hour12}
							detected={detected}
							detectPending={detectPending}
							onPick={pickCity}
							onClose={closeSearch}
						/>
					)}
				</div>
			</SettingsContext>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(
	<NuqsAdapter>
		<App />
	</NuqsAdapter>,
)
