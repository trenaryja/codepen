import { createContext, use, useEffect, useRef } from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'
import { fallbackCity, localTimeZone, prettifyZone } from './location'
import { type City, DEMO_CITIES, LOCALE_FAHRENHEIT, LOCALE_HOUR12, STORAGE_KEY, UTC_CITY } from './time'
import { FORECAST_MODES, type Weather } from './weather'

export const VIEWS = ['list', 'bands'] as const
export type View = (typeof VIEWS)[number]

// A place is a city plus the name you gave it — the label is yours, the city is the geocoder's
export type Place = { id: string; label: string; city: City }

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

export type Preferences = Pick<Stored, 'fahrenheit' | 'forecastMode' | 'hour12' | 'showSeconds'>

// Everything below the App reads the same view state, so it rides context instead of props
export type Settings = Preferences & {
	instant: number
	// the top place: every gap, day badge and date on screen is measured from its zone
	reference: City
	weather: Record<string, Weather>
	weatherReady: boolean
	scrubToWall: (timeZone: string, candidates: number[]) => void
	rename: (id: string, label: string) => void
	remove: (id: string) => void
}

export const SettingsContext = createContext<Settings | null>(null)
export const useSettings = () => {
	const settings = use(SettingsContext)
	if (!settings) throw new Error('useSettings needs a <SettingsContext> provider above it')
	return settings
}

const loadStored = () => {
	try {
		const parsed = storedSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

export const toPlaces = (entries: { label: string; city: City }[]) =>
	entries.map((entry) => ({ id: R.randomString(21), label: entry.label, city: entry.city }))

// Entry 0 starts as the zone-derived guess and is re-run with the IP-detected city once that lands (see App)
const seedEntries = (first: City) =>
	[first, ...DEMO_CITIES.filter((city) => city.timeZone !== localTimeZone)].map((city) => ({
		label: city.name,
		city,
	}))

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
export const DEFAULTS = {
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
export const readOrigin = (cities: string | null, viewParam: View | null) => {
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
export const startEntries = ({ stored, urlEntries }: Origin, first: City) =>
	urlEntries ?? stored?.places ?? seedEntries(first)

// The seed's first entry holds fallbackCity itself, so identity alone says "still the zone-derived guess":
// retargeting that card replaces the object, and detection then leaves it alone.
export const applyDetection = (places: Place[], detected: City) =>
	places.map((place) =>
		place.city === fallbackCity
			? { ...place, label: place.label === place.city.name ? detected.name : place.label, city: detected }
			: place,
	)

// Both mirrors stay quiet until the state differs from what the session started with — so a first visit stays
// ephemeral (including the render where IP detection fills in the real city, which is the pen acting, not
// you), and a link you opened and left alone neither dirties the address bar nor overwrites your saved board
export const usePersistence = ({
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
	setCities: (cities: string | null) => Promise<unknown>
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
		if (encoded !== initialEncoded || cities) void setCities(encoded || null)
	}, [encoded, initialEncoded, cities, setCities])
}
