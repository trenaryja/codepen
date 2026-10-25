import { z } from 'https://esm.sh/zod'

export const HOUR = 3_600_000
export const DAY = 86_400_000
export const QUARTER_HOUR = 900_000
const RADIAN = Math.PI / 180
export const STORAGE_KEY = 'clox'

export type City = { name: string; country: string; latitude: number; longitude: number; timeZone: string }

export const UTC_CITY: City = { name: 'UTC', country: '', latitude: 0, longitude: 0, timeZone: 'UTC' }
export const isUtc = (city: City) => city.timeZone === 'UTC'

// Seed board, after the detected city: one westward gap, one whole-hour gap, and one half-hour gap
// that also crosses the date line of the day — between them they exercise every badge a card can show
export const DEMO_CITIES: City[] = [
	{ name: 'New York', country: 'US', latitude: 40.71, longitude: -74.01, timeZone: 'America/New_York' },
	{ name: 'Los Angeles', country: 'US', latitude: 34.05, longitude: -118.24, timeZone: 'America/Los_Angeles' },
	{ name: 'London', country: 'GB', latitude: 51.51, longitude: -0.13, timeZone: 'Europe/London' },
	{ name: 'Hyderabad', country: 'IN', latitude: 17.38, longitude: 78.46, timeZone: 'Asia/Kolkata' },
]

/** Fetches `url` and validates the JSON body; a mismatch throws naming the host. */
export const fetchJson = async <Schema extends z.ZodType>(url: string, schema: Schema, init?: RequestInit) => {
	const parsed = schema.safeParse(await (await fetch(url, init)).json())
	if (!parsed.success)
		throw new Error(`${new URL(url).host} sent an unexpected shape: ${z.prettifyError(parsed.error)}`)
	return parsed.data
}

export const round = (value: unknown) => Math.round(Number(value ?? 0))

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

export const zoneOffset = (timeZone: string, instant: number) => {
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
export const localMs = (timeZone: string, instant: number) => instant + zoneOffset(timeZone, instant)

type TimeFormat = { instant: number; timeZone: string; hour12: boolean; seconds: boolean }

export const formatTime = ({ instant, timeZone, hour12, seconds }: TimeFormat) =>
	getFormatter({
		timeZone,
		hour: 'numeric',
		minute: '2-digit',
		second: seconds ? '2-digit' : undefined,
		hour12,
	}).format(instant)

export const hourLabel = (localHour: number, hour12: boolean) =>
	hour12 ? `${((localHour + 11) % 12) + 1}${localHour < 12 ? 'a' : 'p'}` : String(localHour).padStart(2, '0')

export const weekdayOf = (date: string) => getFormatter({ weekday: 'short' }).format(new Date(`${date}T12:00`))

// Calendar-day difference between a zone and the base zone at one instant: -1 = yesterday there
export const dayDelta = (timeZone: string, baseTimeZone: string, instant: number) =>
	Math.floor(localMs(timeZone, instant) / DAY) - Math.floor(localMs(baseTimeZone, instant) / DAY)
export const dayDeltaLabel = (delta: number) =>
	delta === 1 ? 'tomorrow' : delta === -1 ? 'yesterday' : `${delta > 0 ? '+' : ''}${delta} days`

export const LOCALE_HOUR12 = !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12
export const LOCALE_FAHRENHEIT = navigator.language.toUpperCase().includes('US')

// keyboard hints only make sense where a keyboard is likely (the CDN tailwind build lacks pointer-* variants)
export const FINE_POINTER = matchMedia('(pointer: fine)').matches

// Signed like Android's world clock: "-9h 30m", "+2h 30m", "0h"
export const formatSignedGap = (milliseconds: number) => {
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
export const parseWallTime = (raw: string): number[] | null => {
	const text = raw.trim().toLowerCase()
	const named = NAMED_TIMES.get(text)
	if (named) return named
	const match = /^(\d{1,2})(?:[ .:]?(\d{2}))?\s*(?:(a|p)\.?m?\.?)?$/.exec(text)
	const hourField = match?.[1]
	if (!match || hourField === undefined) return null
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
export const solarAltitude = (instant: number, latitude: number, longitude: number) => {
	const days = instant / DAY - 10_957.5
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
