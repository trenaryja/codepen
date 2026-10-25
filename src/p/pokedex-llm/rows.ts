import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'
import type { Level, Mon, RangeValue } from './fields'
import { COLORS, COLOR_CODES, FIELDS, GENERATION_ENDS, LEGENDARY, MYTHICAL } from './fields'

export const rawMonSchema = z.object({
	id: z.number(),
	name: z.object({ english: z.string() }),
	type: z.array(z.string()),
	base: z.record(z.string(), z.number()),
	species: z.string(),
	description: z.string(),
	evolution: z.object({ next: z.array(z.unknown()).optional() }).optional(),
	profile: z.object({
		height: z.string(),
		weight: z.string(),
		egg: z.array(z.string()).optional(),
		ability: z.array(z.tuple([z.string(), z.string()])).optional(), // [name, hidden] pairs
	}),
	image: z.object({ thumbnail: z.string() }),
})

export type RawMon = z.infer<typeof rawMonSchema>

/** Our camelCase stat ids -> the keys the dump uses. Doubles as the "is this a stat column?" test. */
export const STAT_KEYS = {
	hp: 'HP',
	attack: 'Attack',
	defense: 'Defense',
	spAttack: 'Sp. Attack',
	spDefense: 'Sp. Defense',
	speed: 'Speed',
}

/** Split out from `deriveMon` because every one of these fields is optional twice over. */
export const deriveProfile = (profile: RawMon['profile'] | undefined) => ({
	height: Number.parseFloat(profile?.height ?? '0') || 0,
	weight: Number.parseFloat(profile?.weight ?? '0') || 0,
	eggGroups: profile?.egg ?? [],
	abilities: (profile?.ability ?? []).map(([name]) => name),
})

export const deriveMon = (raw: RawMon): Mon => {
	const stats = R.mapValues(STAT_KEYS, (key) => raw.base[key] ?? 0)
	return {
		id: raw.id,
		name: raw.name.english,
		thumbnail: raw.image.thumbnail,
		types: raw.type,
		color: COLORS[Number(COLOR_CODES.charAt(raw.id - 1))] ?? COLORS[0],
		generation: GENERATION_ENDS.findIndex((end) => raw.id <= end) + 1,
		...stats,
		total: R.sum(R.values(stats)),
		...deriveProfile(raw.profile),
		legendary: LEGENDARY.has(raw.id),
		mythical: MYTHICAL.has(raw.id),
		finalForm: !raw.evolution?.next,
		species: raw.species,
		description: raw.description,
	}
}

/**
 * Data-derived cutoffs so "tanky" means something defensible. Filled once after load and read
 * by the executor, the prompt, and the range inputs — a module-level cache keeps the column
 * definitions referentially stable.
 */
export type RangeStat = { min: number; max: number; levels: Record<Level, [number | null, number | null]> }

export const RANGE_STATS: Record<string, RangeStat> = {}

export const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))] ?? null

export const computeRangeStats = (rows: Mon[]) => {
	for (const field of FIELDS) {
		if (field.kind !== 'range') continue
		const sorted = R.sortBy(rows.map(field.get), R.identity())
		RANGE_STATS[field.id] = {
			min: sorted[0] ?? 0,
			max: sorted.at(-1) ?? 0,
			levels: {
				very_low: [null, percentile(sorted, 10)],
				low: [null, percentile(sorted, 25)],
				average: [percentile(sorted, 35), percentile(sorted, 65)],
				high: [percentile(sorted, 75), null],
				very_high: [percentile(sorted, 90), null],
			},
		}
	}
}

export const resolveRange = (fieldId: string, value: RangeValue): [number | null, number | null] => {
	if ('level' in value) return RANGE_STATS[fieldId]?.levels[value.level] ?? [null, null]
	return [value.min ?? null, value.max ?? null]
}
