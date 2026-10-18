import { useEffect, useState } from 'https://esm.sh/react'
import { z } from 'https://esm.sh/zod'
import { type City, HOUR, UTC_CITY, fetchJson, zoneOffset } from './time'

// Zones the platform still reports under a superseded name.
const TIME_ZONE_ALIASES: Record<string, string> = {
	'Asia/Calcutta': 'Asia/Kolkata',
	'Asia/Saigon': 'Asia/Ho_Chi_Minh',
	'Asia/Rangoon': 'Asia/Yangon',
	'Europe/Kiev': 'Europe/Kyiv',
	'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
}
const unalias = (timeZone: string | undefined) => (timeZone ? (TIME_ZONE_ALIASES[timeZone] ?? timeZone) : undefined)
export const localTimeZone = unalias(new Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC'

// 'America/Argentina/Buenos_Aires' → 'Buenos Aires': the city a zone is named after, close enough that a
// board seeded from the zone alone still reads like a place
export const prettifyZone = (timeZone: string) => (timeZone.split('/').at(-1) ?? timeZone).replaceAll('_', ' ')

export const fallbackCity: City = {
	name: prettifyZone(localTimeZone),
	country: '',
	latitude: 20,
	longitude: (zoneOffset(localTimeZone, Date.now()) / HOUR) * 15,
	timeZone: localTimeZone,
}

const ipLocationSchema = z.object({
	city: z.string().min(1),
	latitude: z.number(),
	longitude: z.number().nullish(),
	country_code: z.string().nullish(),
	// ipwho.is nests the zone under timezone.id; ipapi.co returns it flat
	timezone: z.union([z.string(), z.object({ id: z.string() })]).nullish(),
})

// The IANA zone resolves immediately; IP geolocation refines it to a real city.
export const useDetectedCity = () => {
	const [detected, setDetected] = useState(fallbackCity)
	const [pending, setPending] = useState(true)
	useEffect(() => {
		let cancelled = false

		const lookup = async () => {
			// ipwho.is first (keyless, CORS, generous), ipapi.co as backup — both throttle bursts with 429s
			for (const url of ['https://ipwho.is/', 'https://ipapi.co/json/'])
				try {
					const data = await fetchJson(url, ipLocationSchema)
					if (cancelled) continue
					setDetected({
						name: data.city,
						country: data.country_code ?? '',
						latitude: data.latitude,
						longitude: data.longitude ?? fallbackCity.longitude,
						timeZone: unalias(typeof data.timezone === 'object' ? data.timezone?.id : data.timezone) ?? localTimeZone,
					})
					break
				} catch {
					// provider unreachable or answered without a location — try the next one
				}

			if (!cancelled) setPending(false)
		}

		void lookup()

		return () => {
			cancelled = true
		}
	}, [])
	return { detected, pending }
}

const geocodingSchema = z.object({
	results: z
		.array(
			z.object({
				name: z.string(),
				admin1: z.string().optional(),
				country_code: z.string().optional(),
				latitude: z.number(),
				longitude: z.number(),
				timezone: z.string().optional(),
			}),
		)
		.optional(),
})

// open-meteo geocoding, no API key required.
export const useCitySearch = (query: string) => {
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
		const search = async () => {
			try {
				const parsed = await fetchJson(
					`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lower)}&count=8`,
					geocodingSchema,
					{ signal: controller.signal },
				)
				const cities = (parsed.results ?? [])
					.filter((result) => result.timezone)
					.map(({ name, admin1, country_code: countryCode, latitude, longitude, timezone = 'UTC' }) => ({
						name,
						country: [admin1, countryCode].filter(Boolean).join(', '),
						latitude,
						longitude,
						timeZone: timezone,
					}))
				setMatches([...utcMatch, ...cities])
				setSearching(false)
			} catch {
				// aborted or offline — keep previous matches
			}
		}
		const id = setTimeout(() => void search(), 250)

		return () => {
			clearTimeout(id)
			controller.abort()
		}
	}, [query])
	return { matches, searching }
}
