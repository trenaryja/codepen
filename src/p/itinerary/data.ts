import { createParser, parseAsNativeArrayOf, parseAsString } from 'https://esm.sh/nuqs'
import * as R from 'https://esm.sh/remeda'
import { feature, mesh } from 'https://esm.sh/topojson-client'
import { z } from 'https://esm.sh/zod'
import type { GeometryCollection, Topology } from 'topojson-specification'

const [airportRows, atlas] = await Promise.all(
	[
		// mwgg/Airports gives every IATA airport an IANA zone, where OpenFlights leaves HYD, DOH and IST blank; 1.17 MB brotli
		// @master: jsDelivr serves a bare gh URL from a 2025 snapshot
		'https://cdn.jsdelivr.net/gh/mwgg/Airports@master/airports.json',
		'https://cdn.jsdelivr.net/npm/world-atlas/countries-110m.json',
	].map(async (url): Promise<unknown> => (await fetch(url)).json()),
)

const airports = new Map(
	R.values(
		z
			.record(
				z.string(),
				z.object({ iata: z.string(), city: z.string(), tz: z.string(), lat: z.number(), lon: z.number() }),
			)
			.parse(airportRows),
	)
		.filter((row) => row.iata)
		.map((row) => [
			row.iata,
			{ code: row.iata, city: row.city, timeZone: row.tz, coordinates: [row.lon, row.lat] satisfies [number, number] },
		]),
)

const world = z
	.custom<Topology<{ land: GeometryCollection; countries: GeometryCollection }>>(
		(value) =>
			z.object({ objects: z.object({ land: z.object({}), countries: z.object({}) }) }).safeParse(value).success,
	)
	.parse(atlas)
export const LAND = feature(world, world.objects.land)
export const BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b)

export const DAY = 86_400_000

/** `sv-SE` prints an ISO-shaped `2026-09-27 02:40:00`, read back as if that wall clock were UTC */
const wallClock = (time: number, timeZone: string) =>
	Date.parse(`${new Date(time).toLocaleString('sv-SE', { timeZone }).replace(' ', 'T')}Z`)

/** A wall-clock time in `timeZone` to epoch ms; the second pass lands a time near a DST switch on the right side of it */
const zonedTime = (local: string, timeZone: string) => {
	const wall = Date.parse(`${local}Z`)
	const offsetAt = (time: number) => wallClock(time, timeZone) - time
	return wall - offsetAt(wall - offsetAt(wall))
}

export const dateKey = (time: number, timeZone?: string) => new Date(time).toLocaleDateString('sv-SE', { timeZone })

const airportCode = z
	.string()
	.min(1, 'Missing')
	.describe('3-letter IATA airport code')
	.transform((code, ctx) => {
		const airport = airports.get(code)
		if (!airport) ctx.addIssue(`No airport "${code}": use its 3-letter IATA code`)
		return airport ?? z.NEVER
	})
export type Airport = z.output<typeof airportCode>

const localTime = z
	.string()
	.regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/, "Use the airport's local time, like 2026-09-27T02:40")
	.describe("The airport's local wall-clock time, as the boarding pass prints it: YYYY-MM-DDTHH:mm")

/** Parses a flight into a leg: its airports and its departure and arrival as epoch ms; shared links carry each field's name, so add fields freely but never rename or reuse one */
export const Flight = z
	.object({
		number: z.string().describe('Flight number, e.g. SQ322'),
		from: airportCode,
		to: airportCode,
		departs: localTime,
		arrives: localTime,
		place: z
			.string()
			.default('')
			.describe("What to call where it lands when that isn't the airport's city, e.g. Kyoto for KIX"),
		note: z.string().default('').describe("Shown on the stop after it lands, e.g. who you're seeing"),
		address: z
			.string()
			.default('')
			.describe('Where you stay after it lands, as you would search it on Google Maps, e.g. Raffles Singapore'),
	})
	.transform(({ from: origin, to: destination, ...flight }, ctx) => {
		const start = zonedTime(flight.departs, origin.timeZone)
		const end = zonedTime(flight.arrives, destination.timeZone)
		if (end <= start)
			ctx.addIssue({
				code: 'custom',
				message: 'Lands before it takes off: arrival is local time there',
				path: ['arrives'],
			})
		const stop = { title: flight.place || destination.city, note: flight.note, address: flight.address }
		return { ...flight, from: origin.code, to: destination.code, origin, destination, start, end, stop }
	})
export type Leg = z.output<typeof Flight> & { id: string }
export type Place = Leg['stop']
const FLIGHT_KEYS = R.keys(Flight.in.shape)

export const Trip = z
	.object({
		title: z.string().default('').describe('Trip name, e.g. Summer in Asia'),
		flights: z.array(Flight).describe('Every flight, in any order; a day or more on the ground after one is a stay'),
	})
	// Building each leg checks the flight; the link keeps only its fields
	.transform((trip) => ({
		...trip,
		flights: trip.flights.map((leg) => R.mapToObj(FLIGHT_KEYS, (key) => [key, leg[key]])),
	}))

export const JsonText = z.string().transform((text, ctx): unknown => {
	try {
		return JSON.parse(text)
	} catch (error) {
		ctx.addIssue(String(error))
		return z.NEVER
	}
})

export const TripJson = JsonText.pipe(Trip)

/** One URL value per record, `name:value` pairs joined by `~`, which URLs leave bare; blanks drop and unknown names are ignored */
const records = <Key extends string>(keys: readonly Key[]) =>
	parseAsNativeArrayOf(
		createParser({
			parse: (value) => {
				const fields = R.fromEntries(
					value.split('~').map((field) => {
						const [name = '', ...rest] = field.split(':')
						return [name, rest.join(':')]
					}),
				)
				return R.mapToObj(keys, (key) => [key, fields[key] ?? ''])
			},
			serialize: (record: Record<Key, string>) =>
				keys
					.filter((key) => record[key])
					.map((key) => `${key}:${record[key].replaceAll('~', '-')}`)
					.join('~'),
		}),
	)

export const TRIP_PARAMS = {
	title: parseAsString.withDefault(''),
	flights: records(FLIGHT_KEYS),
} satisfies Record<keyof z.input<typeof Trip>, unknown>

const fromToday = (days: number, clock: string) => `${dateKey(Date.now() + days * DAY)}T${clock}`
const sampleFlight = (number: string, route: string, departs: [number, string], arrives: [number, string]) => {
	const [from = '', to = ''] = route.split('-', 2)
	return { number, from, to, departs: fromToday(...departs), arrives: fromToday(...arrives) }
}

/** Phileas Fogg's route by air, leaving ten days out so the countdown and map have something ahead; it lands back at 8:45 pm on day 80, as in the book */
export const sampleTrip = () =>
	({
		title: 'Around the world in 80 days',
		flights: [
			sampleFlight('BA199', 'LHR-BOM', [10, '20:45'], [11, '11:20']),
			sampleFlight('CX662', 'BOM-HKG', [28, '23:50'], [29, '08:00']),
			{
				...sampleFlight('CX548', 'HKG-HND', [29, '14:15'], [29, '19:25']),
				place: 'Yokohama',
				note: 'Find Passepartout',
			},
			sampleFlight('JL2', 'HND-SFO', [53, '18:40'], [53, '11:10']),
			sampleFlight('AA16', 'SFO-JFK', [72, '07:00'], [72, '15:35']),
			{
				...sampleFlight('BA178', 'JFK-LHR', [90, '08:30'], [90, '20:45']),
				note: 'Back by 8:45 pm to win the wager',
				address: 'Reform Club, London',
			},
		],
	}) satisfies z.input<typeof Trip>

export const PROMPT = `Help me put a trip on my itinerary page. Interview me before writing anything: ask a few questions at a time until you know every flight (number, airports, and each airport's local departure and arrival times; I may paste confirmation emails or boarding passes), what to call each place I stay, and any notes or hotel addresses I want shown. If you can look up flight schedules, use them to fill gaps, and check with me rather than assume.

Once you have everything, reply with only JSON matching this JSON Schema:
${JSON.stringify(z.toJSONSchema(Trip, { io: 'input' }))}

For example:
${JSON.stringify(sampleTrip())}

Start by asking about my trip.`

export type TripEvent = {
	kind: 'leave' | 'flight' | 'layover' | 'stay' | 'return'
	id: string
	airport: Airport
	/** Where the event happens; a flight's is the place it leaves */
	place: Place
	start: number
	end: number
	leg?: Leg
}

/** The trip as a timeline: leaving, then each flight and the layover (under a day), stay or return after it */
export const tripEvents = (legs: readonly Leg[]): TripEvent[] => {
	const [first] = legs
	if (!first) return []
	// A round trip's last flight lands home, so its label also names where the trip leaves from
	const home = R.findLast(legs, (leg) => leg.destination.code === first.origin.code)?.stop ?? {
		title: first.origin.city,
		note: '',
		address: '',
	}
	return [
		{ kind: 'leave', id: 'leave', airport: first.origin, place: home, start: -Infinity, end: first.start },
		...legs.flatMap((leg, i): TripEvent[] => {
			const end = legs[i + 1]?.start ?? Infinity
			const kind = end === Infinity ? 'return' : end - leg.end < DAY ? 'layover' : 'stay'
			const place = legs[i - 1]?.stop ?? home
			return [
				{ kind: 'flight', id: leg.id, leg, airport: leg.origin, place, start: leg.start, end: leg.end },
				{ kind, id: `${kind}-${i}`, airport: leg.destination, place: leg.stop, start: leg.end, end },
			]
		}),
	]
}

export const statusOf = (event: { start: number; end: number }, now: number) =>
	now < event.start ? 'upcoming' : now < event.end ? 'now' : 'done'
