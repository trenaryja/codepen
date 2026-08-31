/**
 * Pinned to @tanstack/react-table v8 — decided 2026-08-11, revisit 2026-09-22.
 * v9's headline open bug is React Compiler + table state going stale (TanStack/table#6524), and this
 * pen's build is exactly that setup. v9 also costs lines for a single table (`tableFeatures()`,
 * `TFeatures` threaded through every generic) and its wins are million-row wins; this table is 898.
 * Revisit when #6524 closes, or sooner if a second table lands here.
 */

import type {
	ColumnDef,
	ColumnFiltersState,
	SortingState,
	Table,
	VisibilityState,
} from 'https://esm.sh/@tanstack/react-table@8'
import {
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from 'https://esm.sh/@tanstack/react-table@8'
import { useVirtualizer } from 'https://esm.sh/@tanstack/react-virtual'
import { Button, Input, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import {
	LuBrain,
	LuChevronDown,
	LuChevronUp,
	LuCircleAlert,
	LuColumns3,
	LuCornerDownLeft,
	LuFilter,
	LuRotateCcw,
	LuSparkles,
	LuX,
} from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'

// PokéAPI has `color` and the legendary/mythical flags; the Purukitto dump doesn't.
// Rather than ship a data file (pens are 3 files, copy-pasteable to CodePen) these are
// baked in: one char per Pokédex id indexing COLORS, plus two sparse id lists. ~1.2KB.
const COLORS = ['black', 'blue', 'brown', 'gray', 'green', 'pink', 'purple', 'red', 'white', 'yellow'] as const

const COLOR_CODES =
	'444777111448299222622266999911166655295566117776622999122221112223334441122299553322288666666639977775922225663351211772' +
	'654797227116219751122601991126544499911122227747611955884485941124541699711600530193696356379102277225377630011372862597' +
	'559214348744447771113328789644442221189888112428239251192135660333174999364467111972062244441180973177206433253400004181' +
	'331111153518111121371174974442221112222277111441133449998225666666226033966442550611101122661141118803531978441627830879' +
	'518628091104894447771112223366447711553330011111335332111719497374444422777477970091199443333666444188885281388885993333' +
	'381112800449881772967447728722731118813441802398644477711122777008228882288831222558811222211992711549366632222116617456' +
	'222277711100022341687992211122445566005566648833220332173958433395761186878048003366389334448381112211619722448844990004' +
	'4444122667721665555563288638896883169944141844417633494804'

const LEGENDARY = new Set(
	'144,145,146,150,243,244,245,249,250,377,378,379,380,381,382,383,384,480,481,482,483,484,485,486,487,488,638,639,640,641,642,643,644,645,646,716,717,718,772,773,785,786,787,788,789,790,791,792,800,888,889,890,891,892,894,895,896,897,898'
		.split(',')
		.map(Number),
)

const MYTHICAL = new Set(
	'151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,801,802,807,808,809,893'.split(',').map(Number),
)

/** Last Pokédex id of each generation, 1-indexed by position. */
const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 898]

const DATA_URL = 'https://cdn.jsdelivr.net/gh/Purukitto/pokemon-data.json@master/pokedex.json'

type Mon = {
	id: number
	name: string
	thumbnail: string
	types: string[]
	color: string
	generation: number
	hp: number
	attack: number
	defense: number
	spAttack: number
	spDefense: number
	speed: number
	total: number
	height: number
	weight: number
	eggGroups: string[]
	abilities: string[]
	legendary: boolean
	mythical: boolean
	finalForm: boolean
	species: string
	description: string
}

const LEVELS = ['very_low', 'low', 'average', 'high', 'very_high'] as const
type Level = (typeof LEVELS)[number]

type RangeValue = { level: Level } | { min?: number; max?: number }

type FilterValue = boolean | string | RangeValue | string[]

type Filters = Record<string, FilterValue>

type FieldBase = { id: string; label: string; width: number; hint: string }

type Field = FieldBase &
	(
		| { kind: 'bool'; get: (mon: Mon) => boolean }
		| { kind: 'enum'; values: readonly string[]; get: (mon: Mon) => string[] }
		| { kind: 'range'; get: (mon: Mon) => number; decimals?: number }
		| { kind: 'text'; get: (mon: Mon) => string }
	)

const TYPES = `Bug Dark Dragon Electric Fairy Fighting Fire Flying Ghost
	Grass Ground Ice Normal Poison Psychic Rock Steel Water`.split(/\s+/)

const EGG_GROUPS = `Amorphous,Bug,Ditto,Dragon,Fairy,Field,Flying,Grass,
	Human-Like,Mineral,Monster,Undiscovered,Water 1,Water 2,Water 3`.split(/,\s*/)

/**
 * The pack. Everything downstream — the JSON schema handed to the model, the filter panel,
 * the table columns, the executor, and the prompt's field documentation — is derived from
 * this one list. Swapping in flights or products means replacing this and the row loader.
 */
const FIELDS: Field[] = [
	{ id: 'name', label: 'Pokémon', kind: 'text', width: 210, get: (m) => m.name, hint: 'name contains' },
	{ id: 'type', label: 'Type', kind: 'enum', values: TYPES, width: 170, get: (m) => m.types, hint: 'elemental type' },
	{ id: 'color', label: 'Color', kind: 'enum', values: COLORS, width: 100, get: (m) => [m.color], hint: 'body color' },
	{ id: 'generation', label: 'Gen', kind: 'range', width: 70, get: (m) => m.generation, hint: 'generation 1-8' },
	{ id: 'total', label: 'Total', kind: 'range', width: 80, get: (m) => m.total, hint: 'base stat total' },
	{ id: 'hp', label: 'HP', kind: 'range', width: 70, get: (m) => m.hp, hint: 'hit points, bulk' },
	{ id: 'attack', label: 'Atk', kind: 'range', width: 70, get: (m) => m.attack, hint: 'physical attack' },
	{ id: 'defense', label: 'Def', kind: 'range', width: 70, get: (m) => m.defense, hint: 'physical defense, tankiness' },
	{ id: 'spAttack', label: 'SpA', kind: 'range', width: 70, get: (m) => m.spAttack, hint: 'special attack' },
	{ id: 'spDefense', label: 'SpD', kind: 'range', width: 70, get: (m) => m.spDefense, hint: 'special defense' },
	{ id: 'speed', label: 'Spe', kind: 'range', width: 70, get: (m) => m.speed, hint: 'speed, how fast it is' },
	{
		id: 'height',
		label: 'Height',
		kind: 'range',
		width: 90,
		get: (m) => m.height,
		decimals: 1,
		hint: 'metres, tallness',
	},
	{ id: 'weight', label: 'Weight', kind: 'range', width: 90, get: (m) => m.weight, decimals: 1, hint: 'kilograms' },
	{
		id: 'eggGroup',
		label: 'Egg Groups',
		kind: 'enum',
		values: EGG_GROUPS,
		width: 170,
		get: (m) => m.eggGroups,
		hint: 'breeding egg group',
	},
	{
		id: 'ability',
		label: 'Abilities',
		kind: 'text',
		width: 180,
		get: (m) => m.abilities.join(', '),
		hint: 'ability name contains',
	},
	{ id: 'legendary', label: 'Legendary', kind: 'bool', width: 110, get: (m) => m.legendary, hint: 'is a legendary' },
	{ id: 'mythical', label: 'Mythical', kind: 'bool', width: 105, get: (m) => m.mythical, hint: 'is a mythical' },
	{
		id: 'finalForm',
		label: 'Final Form',
		kind: 'bool',
		width: 115,
		get: (m) => m.finalForm,
		hint: 'does not evolve further',
	},
	{
		id: 'species',
		label: 'Species',
		kind: 'text',
		width: 160,
		get: (m) => m.species,
		hint: 'species title, e.g. "Flame Pokémon"',
	},
	{
		id: 'description',
		label: 'Pokédex Entry',
		kind: 'text',
		width: 320,
		get: (m) => m.description,
		hint: 'full text of the Pokédex entry',
	},
]

const FIELD_BY_ID = R.indexBy(FIELDS, (field) => field.id)

const DEFAULT_COLUMNS = new Set(
	'name type color generation total hp attack defense spAttack spDefense speed legendary'.split(' '),
)

type RawMon = {
	id: number
	name: { english: string }
	type: string[]
	base: Record<string, number>
	species: string
	description: string
	evolution?: { next?: unknown[] }
	profile: { height: string; weight: string; egg?: string[]; ability?: string[][] }
	image: { thumbnail: string }
}

/** Our camelCase stat ids -> the keys the dump uses. Doubles as the "is this a stat column?" test. */
const STAT_KEYS = {
	hp: 'HP',
	attack: 'Attack',
	defense: 'Defense',
	spAttack: 'Sp. Attack',
	spDefense: 'Sp. Defense',
	speed: 'Speed',
}

/** Split out from `deriveMon` because every one of these fields is optional twice over. */
const deriveProfile = (profile: RawMon['profile'] | undefined) => ({
	height: Number.parseFloat(profile?.height ?? '0') || 0,
	weight: Number.parseFloat(profile?.weight ?? '0') || 0,
	eggGroups: profile?.egg ?? [],
	abilities: (profile?.ability ?? []).map(([name]) => name!), // dataset ability entries are [name, hidden] pairs
})

const deriveMon = (raw: RawMon): Mon => {
	const stats = R.mapValues(STAT_KEYS, (key) => raw.base?.[key] ?? 0)
	return {
		id: raw.id,
		name: raw.name.english,
		thumbnail: raw.image.thumbnail,
		types: raw.type,
		color: COLORS[Number(COLOR_CODES[raw.id - 1] ?? 0)]!, // COLOR_CODES digits are all < COLORS.length
		generation: GENERATION_ENDS.findIndex((end) => raw.id <= end) + 1,
		...stats,
		total: R.sum(R.values(stats)),
		...deriveProfile(raw.profile),
		legendary: LEGENDARY.has(raw.id),
		mythical: MYTHICAL.has(raw.id),
		finalForm: !raw.evolution?.next,
		species: raw.species ?? '',
		description: raw.description ?? '',
	}
}

/**
 * Data-derived cutoffs so "tanky" means something defensible. Filled once after load and read
 * by the executor, the prompt, and the range inputs — a module-level cache keeps the column
 * definitions referentially stable.
 */
type RangeStat = { min: number; max: number; levels: Record<Level, [number | null, number | null]> }

const RANGE_STATS: Record<string, RangeStat> = {}

const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))]! // index clamped to length - 1

const computeRangeStats = (rows: Mon[]) => {
	for (const field of FIELDS) {
		if (field.kind !== 'range') continue
		const sorted = R.sortBy(rows.map(field.get), R.identity())
		RANGE_STATS[field.id] = {
			min: sorted[0]!,
			max: sorted.at(-1)!,
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

const resolveRange = (fieldId: string, value: RangeValue): [number | null, number | null] => {
	if ('level' in value) return RANGE_STATS[fieldId]?.levels[value.level] ?? [null, null]
	return [value.min ?? null, value.max ?? null]
}

const matchField = (field: Field, mon: Mon, value: FilterValue) => {
	if (field.kind === 'enum') {
		const wanted = value as string[]
		if (!wanted.length) return true
		return field.get(mon).some((own) => wanted.includes(own))
	}
	if (field.kind === 'range') {
		const [min, max] = resolveRange(field.id, value as RangeValue)
		const own = field.get(mon)
		return (min == null || own >= min) && (max == null || own <= max)
	}
	if (field.kind === 'bool') return field.get(mon) === value
	const needle = String(value).trim().toLowerCase()
	if (!needle) return true
	return field.get(mon).toLowerCase().includes(needle)
}

const sanitizeEnum = (values: readonly string[], value: unknown) => {
	if (!Array.isArray(value)) return undefined
	// Partial streams produce half-typed values like "Wa" — only keep real ones.
	const valid = value.filter((entry): entry is string => typeof entry === 'string' && values.includes(entry))
	return valid.length ? valid : undefined
}

const sanitizeRange = (value: unknown): RangeValue | undefined => {
	if (!R.isPlainObject(value)) return undefined
	if ('level' in value && LEVELS.includes(value.level as Level)) return { level: value.level as Level }
	const min = typeof value.min === 'number' ? value.min : undefined
	const max = typeof value.max === 'number' ? value.max : undefined
	if (min == null && max == null) return undefined
	return { min, max }
}

/** `undefined` means "the model gave us nothing usable for this field", so the caller drops it. */
const sanitizeValue = (field: Field, value: unknown): FilterValue | undefined => {
	if (field.kind === 'enum') return sanitizeEnum(field.values, value)
	if (field.kind === 'range') return sanitizeRange(value)
	if (field.kind === 'bool') return typeof value === 'boolean' ? value : undefined
	return typeof value === 'string' && value.trim() ? value : undefined
}

/** Drop anything the model invented that the pack doesn't recognise, and drop no-op filters. */
const sanitizeFilters = (raw: unknown): Filters => {
	if (!R.isPlainObject(raw)) return {}
	const out: Filters = {}

	for (const [id, value] of R.entries(raw)) {
		const field = FIELD_BY_ID[id]
		if (!field || value == null) continue
		const clean = sanitizeValue(field, value)
		if (clean !== undefined) out[id] = clean
	}

	return out
}

/** `null` is the schema's own "no ordering implied", and a truncated stream drops `sort` entirely. */
const sanitizeSorting = (raw: unknown) =>
	R.isPlainObject(raw) && typeof raw.field === 'string' && FIELD_BY_ID[raw.field]
		? [{ id: raw.field, desc: Boolean(raw.desc) }]
		: []

// The JSON schema handed to the model.
const fieldValueSchema = (field: Field) => {
	if (field.kind === 'enum') return { type: 'array', items: { enum: field.values }, minItems: 1 }
	if (field.kind === 'bool') return { type: 'boolean' }
	if (field.kind === 'text') return { type: 'string' }
	return {
		anyOf: [
			{ type: 'object', properties: { level: { enum: LEVELS } }, required: ['level'], additionalProperties: false },
			{ type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } }, additionalProperties: false },
		],
	}
}

const SORTABLE = FIELDS.filter((field) => field.kind === 'range').map((field) => field.id)

const thinkingSchema = { type: 'string', maxLength: 160 }

/**
 * `thinking` opens both branches identically, so the grammar keeps both alive while the model
 * reasons — constrained decoding can't backtrack, and without this it would have to commit to
 * ok/reject on the very first property token. `fields` is declared before `query` so the model
 * picks its axes before its values, and so the output stays short at 20 fields. Its `maxItems` is
 * load-bearing, not tidiness: the grammar happily lets a small model emit the same field forever,
 * and a 360M one does — it burns the whole budget repeating "speed" and never reaches `query`.
 */
const acceptSchema = {
	type: 'object',
	properties: {
		thinking: thinkingSchema,
		ok: { type: 'boolean', enum: [true] },
		fields: { type: 'array', items: { enum: FIELDS.map((field) => field.id) }, minItems: 1, maxItems: 6 },
		query: { type: 'object', properties: R.mapValues(FIELD_BY_ID, fieldValueSchema), additionalProperties: false },
		sort: {
			anyOf: [
				{ type: 'null' },
				{
					type: 'object',
					properties: { field: { enum: SORTABLE }, desc: { type: 'boolean' } },
					required: ['field', 'desc'],
					additionalProperties: false,
				},
			],
		},
	},
	required: ['thinking', 'ok', 'fields', 'query', 'sort'],
	additionalProperties: false,
}

const rejectSchema = {
	type: 'object',
	properties: {
		thinking: thinkingSchema,
		ok: { type: 'boolean', enum: [false] },
		reason: { enum: ['off_domain', 'unsupported_field'] },
		message: { type: 'string', maxLength: 200 },
	},
	required: ['thinking', 'ok', 'reason', 'message'],
	additionalProperties: false,
}

const describeField = (field: Field) => {
	if (field.kind === 'enum') return `- ${field.id} (${field.hint}) → array of: ${field.values.join(', ')}`
	if (field.kind === 'range') {
		const stat = RANGE_STATS[field.id]
		const anchors = stat
			? ` [min ${stat.min}, median ${stat.levels.average[0]}, high ${stat.levels.high[0]}, max ${stat.max}]`
			: ''
		return `- ${field.id} (${field.hint})${anchors} → {"level": …} or {"min": n, "max": n}`
	}
	if (field.kind === 'bool') return `- ${field.id} (${field.hint}) → true or false`
	return `- ${field.id} (${field.hint}) → substring to search for`
}

const buildSystemPrompt = () =>
	[
		'You turn a search request into a filter for a Pokédex table. Reply with JSON only.',
		'',
		'FIELDS:',
		...FIELDS.map(describeField),
		'',
		`LEVELS: ${LEVELS.join(', ')}. Use a level for vague words ("tanky", "fast", "tiny", "heavy").`,
		'Use min/max only when the user states an actual number.',
		'List every field you use in "fields", and put only those fields in "query".',
		`Set "sort" when the request implies an ordering ("fastest", "strongest"), otherwise null. Sortable: ${SORTABLE.join(', ')}.`,
		'',
		'Set ok=false with reason "off_domain" if the request has nothing to do with Pokémon.',
		'Set ok=false with reason "unsupported_field" if it is about Pokémon but needs data this table lacks',
		'(moves, type matchups, anime appearances, competitive tiers, evolution methods, locations).',
	].join('\n')

/**
 * Calibration lives here, not in the system prompt. All-success examples and the model never
 * rejects anything; too many rejects and it refuses ordinary requests. Two of ten is the
 * current guess and the first thing worth tuning.
 */
const EXAMPLES: [string, object][] = [
	[
		'tanky water types',
		{
			thinking: 'tanky = high defense; water is a type',
			ok: true,
			fields: ['type', 'defense'],
			query: { type: ['Water'], defense: { level: 'high' } },
			sort: null,
		},
	],
	[
		'fastest fire pokemon from gen 1',
		{
			thinking: 'fire type, generation 1, order by speed descending',
			ok: true,
			fields: ['type', 'generation'],
			query: { type: ['Fire'], generation: { min: 1, max: 1 } },
			sort: { field: 'speed', desc: true },
		},
	],
	[
		'anything with defense over 100',
		{
			thinking: 'explicit number given, so use min',
			ok: true,
			fields: ['defense'],
			query: { defense: { min: 100 } },
			sort: null,
		},
	],
	[
		'purple ones that are not legendary',
		{
			thinking: 'colour purple, legendary false',
			ok: true,
			fields: ['color', 'legendary'],
			query: { color: ['purple'], legendary: false },
			sort: null,
		},
	],
	[
		'legendary dragons',
		{
			thinking: 'dragon type and the legendary flag',
			ok: true,
			fields: ['type', 'legendary'],
			query: { type: ['Dragon'], legendary: true },
			sort: null,
		},
	],
	[
		'pokemon whose pokedex entry mentions sleeping',
		{
			thinking: 'text search on the description field',
			ok: true,
			fields: ['description'],
			query: { description: 'sleep' },
			sort: null,
		},
	],
	[
		'big heavy rock or ground types',
		{
			thinking: 'two types is an OR within the type field; heavy = high weight',
			ok: true,
			fields: ['type', 'weight'],
			query: { type: ['Rock', 'Ground'], weight: { level: 'high' } },
			sort: null,
		},
	],
	[
		'tiny cute pink ones',
		{
			thinking: 'pink colour, low height; "cute" has no field so ignore it',
			ok: true,
			fields: ['color', 'height'],
			query: { color: ['pink'], height: { level: 'low' } },
			sort: null,
		},
	],
	[
		'show me all flights from italy to france',
		{
			thinking: 'flights have nothing to do with a Pokédex',
			ok: false,
			reason: 'off_domain',
			message: 'This table only contains Pokémon — there is no flight data here.',
		},
	],
	[
		'which pokemon did ash use in the anime',
		{
			thinking: 'about Pokémon, but no anime data in this table',
			ok: false,
			reason: 'unsupported_field',
			message: 'I can filter stats, types, colours and Pokédex entries — but not anime appearances.',
		},
	],
]

const buildMessages = (prompt: string) => [
	{ role: 'system', content: buildSystemPrompt() },
	...EXAMPLES.flatMap(([user, answer]) => [
		{ role: 'user', content: user },
		{ role: 'assistant', content: JSON.stringify(answer) },
	]),
	{ role: 'user', content: prompt },
]

/**
 * Grammar-constrained output is only ever truncated, never malformed, so "repair" just means
 * closing what's open. When a value is mid-token the close still fails to parse, so we walk
 * back to the previous comma and try again.
 */
const closeOpen = (text: string) => {
	const stack: string[] = []
	let inString = false
	let escaped = false

	for (const char of text) {
		if (escaped) escaped = false
		else if (char === '\\') escaped = true
		else if (char === '"') inString = !inString
		else if (!inString && (char === '{' || char === '[')) stack.push(char === '{' ? '}' : ']')
		else if (!inString && (char === '}' || char === ']')) stack.pop()
	}

	const closed = (inString ? `${text}"` : text).replace(/[,:]\s*$/, '')
	return closed + stack.reverse().join('')
}

const repairJson = (text: string): unknown => {
	let work = text.trim()

	for (let attempt = 0; attempt < 8 && work.length > 1; attempt++) {
		try {
			return JSON.parse(closeOpen(work))
		} catch {
			const comma = work.lastIndexOf(',')
			const open = Math.max(work.lastIndexOf('{'), work.lastIndexOf('['))
			if (comma > open) work = work.slice(0, comma)
			else if (open > 0) work = work.slice(0, open + 1)
			else return null
		}
	}

	return null
}

/**
 * Every model here was checked against the real grammar — "small instruct model" is no guarantee it
 * can finish a constrained object. Gemma 3 1B is deliberately absent: JSON allows unlimited whitespace
 * between tokens, and after each string value Gemma rides that loop to max_tokens, never reaching the
 * next key. Penalties only change which whitespace it emits, and WebLLM 0.2.84 can't disable it.
 */
const MODELS = [
	{ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', size: '376 MB' },
	{ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', size: '879 MB' },
	{ id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B', size: '1.6 GB' },
]

/**
 * jsDelivr, not esm.sh: esm.sh's build of web-llm shims node's `path` badly and dies with
 * "dirname is not a function" the moment the worker engine spins up. esm.run is what web-llm's
 * own docs point at. The `.` is split out so Vite's esm.sh plugin ignores the worker source.
 */
const CDN = `https://esm${'.'}run/`

/**
 * Resolves once the browser has actually painted — one frame to commit, one to be sure it landed.
 * A hidden tab never fires rAF, so frames alone would wedge the load at "Starting…" forever; and
 * `visible` is not the inverse guarantee — an occluded window composites nothing while still
 * reporting visible (measured: 0 frames in 500ms). Hence a 2s ceiling rather than a short race: too
 * short and work starts before the overlay lands, leaving the user on the last good frame, a page
 * that looks idle and answers nothing. Waiting too long is the safe direction; too short isn't.
 */
const nextPaint = () =>
	new Promise((resolve) => {
		const done = () => resolve(undefined)

		if (document.visibilityState === 'hidden') {
			setTimeout(done, 0)
			return
		}

		setTimeout(done, 2000)
		requestAnimationFrame(() => requestAnimationFrame(done))
	})

/**
 * Load progress lives outside React deliberately. WebLLM fires ~25 init callbacks per load; routing
 * them through root state re-rendered the whole pen each time. Measured against a no-React control on
 * the same warm cache: 62 long tasks / 7228ms blocked main thread versus 6 / 407ms, a 9.0s load versus
 * 1.9s. That gap is what Chrome's hang detector reacted to — an overlay alone could never have fixed
 * it. Only `LoadOverlay` subscribes, which keeps a progress tick down to a label and a bar.
 */
const createProgressStore = () => {
	let snapshot = { text: '', value: 0 }
	const listeners = new Set<() => void>()
	return {
		// `useSyncExternalStore` compares snapshots by identity: this must be a fresh object per update
		// and the *same* one between updates — building it inside `getSnapshot` would loop forever.
		set: (text: string, value: number) => {
			snapshot = { text, value }
			for (const listener of listeners) listener()
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => void listeners.delete(listener)
		},
		getSnapshot: () => snapshot,
	}
}

const loadProgress = createProgressStore()

const createEngineWorker = () => {
	const source = `
import { WebWorkerMLCEngineHandler } from "${CDN}@mlc-ai/web-llm";
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
`
	const blob = new Blob([source], { type: 'text/javascript' })
	return new Worker(URL.createObjectURL(blob), { type: 'module' })
}

type Engine = {
	chat: { completions: { create: (request: unknown) => Promise<AsyncIterable<StreamChunk>> } }
	unload: () => Promise<void>
}

type StreamChunk = {
	choices: { delta?: { content?: string } }[]
	usage?: { completion_tokens?: number; extra?: { decode_tokens_per_s?: number } }
}

const TypeChip = ({ type }: { type: string }) => (
	<span
		className='badge badge-xs border-none font-semibold text-white/95'
		style={{ backgroundColor: `var(--type-${type.toLowerCase()})` }}
	>
		{type}
	</span>
)

const StatBar = ({ value, fieldId }: { value: number; fieldId: string }) => {
	const max = RANGE_STATS[fieldId]?.max ?? 255
	return (
		<div className='flex items-center gap-1.5'>
			<span className='tabular-nums w-8 text-right'>{value}</span>
			<div className='h-1 flex-1 rounded-full bg-base-content/10 overflow-hidden'>
				<div className='h-full rounded-full bg-primary/70' style={{ width: `${(value / max) * 100}%` }} />
			</div>
		</div>
	)
}

const BoolCell = ({ value }: { value: boolean }) =>
	value ? <span className='badge badge-xs badge-warning'>yes</span> : <span className='opacity-25'>—</span>

type ControlProps = {
	field: Field
	value: FilterValue | undefined
	onChange: (value: FilterValue | undefined) => void
	compact?: boolean
}

const EnumControl = ({ field, value, onChange }: ControlProps) => {
	const selected = (value as string[] | undefined) ?? []
	const values = field.kind === 'enum' ? field.values : []

	const toggle = (entry: string) => {
		const next = selected.includes(entry) ? selected.filter((own) => own !== entry) : [...selected, entry]
		onChange(next.length ? next : undefined)
	}

	return (
		<div className='flex flex-wrap gap-1'>
			{values.map((entry) => {
				const on = selected.includes(entry)
				return (
					<button
						type='button'
						key={entry}
						onClick={() => toggle(entry)}
						className={`badge badge-sm cursor-pointer transition-all ${on ? 'border-none text-white/95' : 'badge-ghost opacity-60 hover:opacity-100'}`}
						style={on && field.id === 'type' ? { backgroundColor: `var(--type-${entry.toLowerCase()})` } : undefined}
					>
						{entry}
					</button>
				)
			})}
		</div>
	)
}

const RangeControl = ({ field, value, onChange }: ControlProps) => {
	const stat = RANGE_STATS[field.id]
	const level = value && 'level' in (value as object) ? (value as { level: Level }).level : null
	const bounds: { min?: number; max?: number } = value && !level ? (value as { min?: number; max?: number }) : {}
	const bound = (which: 'max' | 'min') => (
		<Input
			type='number'
			className='input input-xs w-full'
			placeholder={`${stat?.[which] ?? ''}`}
			value={bounds[which] ?? ''}
			onChange={(event) => {
				const next = { ...bounds, [which]: event.target.value === '' ? undefined : Number(event.target.value) }
				onChange(next.min == null && next.max == null ? undefined : next)
			}}
		/>
	)
	return (
		<div className='flex flex-col gap-1.5'>
			<div className='flex flex-wrap gap-1'>
				{LEVELS.map((entry) => (
					<button
						type='button'
						key={entry}
						onClick={() => onChange(level === entry ? undefined : { level: entry })}
						className={`badge badge-sm cursor-pointer ${level === entry ? 'badge-primary' : 'badge-ghost opacity-60 hover:opacity-100'}`}
					>
						{entry.replace('_', ' ')}
					</button>
				))}
			</div>
			<div className='flex items-center gap-1'>
				{bound('min')}
				<span className='opacity-40 text-xs'>to</span>
				{bound('max')}
			</div>
		</div>
	)
}

const BoolControl = ({ value, onChange }: ControlProps) => (
	<div className='join'>
		{R.entries({ Any: undefined, Yes: true, No: false }).map(([label, entry]) => (
			<button
				type='button'
				key={label}
				onClick={() => onChange(entry)}
				className={`btn btn-xs join-item ${value === entry ? 'btn-primary' : 'btn-ghost'}`}
			>
				{label}
			</button>
		))}
	</div>
)

const TextControl = ({ field, value, onChange }: ControlProps) => (
	<Input
		className='input input-xs w-full'
		placeholder={`Search ${field.label.toLowerCase()}…`}
		value={(value as string | undefined) ?? ''}
		onChange={(event) => onChange(event.target.value || undefined)}
	/>
)

const FilterControl = (props: ControlProps) => {
	if (props.field.kind === 'enum') return <EnumControl {...props} />
	if (props.field.kind === 'range') return <RangeControl {...props} />
	if (props.field.kind === 'bool') return <BoolControl {...props} />
	return <TextControl {...props} />
}

/** One-line summary of an active filter, for header badges and the panel. */
const summarize = (field: Field, value: FilterValue): string => {
	if (field.kind === 'enum') return (value as string[]).join(', ')
	if (field.kind === 'range') {
		if ('level' in (value as object)) return (value as { level: Level }).level.replace('_', ' ')
		const { min, max } = value as { min?: number; max?: number }
		if (min != null && max != null) return `${min}–${max}`
		return min != null ? `≥ ${min}` : `≤ ${max}`
	}
	if (field.kind === 'bool') return value ? 'yes' : 'no'
	return `“${value}”`
}

const FilterPanel = ({
	filters,
	setFilter,
	touched,
	onReset,
}: {
	filters: Filters
	setFilter: (id: string, value: FilterValue | undefined) => void
	touched: Set<string>
	onReset: () => void
}) => (
	<aside className='w-72 shrink-0 flex flex-col border-r border-base-content/10 bg-base-200/40'>
		<div className='flex items-center justify-between px-3 py-2 border-b border-base-content/10'>
			<span className='flex items-center gap-1.5 text-sm font-semibold'>
				<LuFilter size={13} /> Filters
			</span>
			<Button className='btn-xs btn-ghost' onClick={onReset} disabled={R.isEmpty(filters)}>
				<LuRotateCcw size={12} /> Reset
			</Button>
		</div>
		<div className='flex-1 overflow-y-auto p-3 flex flex-col gap-3'>
			{FIELDS.map((field) => {
				const active = filters[field.id] !== undefined
				return (
					<div
						key={field.id}
						className={`flex flex-col gap-1.5 p-1.5 -m-0.5 ${touched.has(field.id) ? 'llm-touched' : ''}`}
					>
						<div className='flex items-center justify-between gap-2'>
							<span className={`text-xs font-medium ${active ? '' : 'opacity-55'}`}>{field.label}</span>
							{active && (
								<button
									type='button'
									className='btn btn-ghost btn-xs px-1 h-4 min-h-0 opacity-50 hover:opacity-100'
									onClick={() => setFilter(field.id, undefined)}
								>
									<LuX size={11} />
								</button>
							)}
						</div>
						<FilterControl field={field} value={filters[field.id]} onChange={(value) => setFilter(field.id, value)} />
					</div>
				)
			})}
		</div>
	</aside>
)

/** TanStack hands cells a whole context object; every cell here only ever wants the row's `Mon`. */
const cell =
	(render: (mon: Mon) => React.ReactNode) =>
	({ row }: { row: { original: Mon } }) =>
		render(row.original)

const cellFor = (field: Field) => {
	if (field.id === 'name')
		return cell((mon) => (
			<div className='flex items-center gap-2 min-w-0'>
				<img src={mon.thumbnail} alt='' loading='lazy' className='size-8 shrink-0 object-contain' />
				<span className='truncate font-medium'>{mon.name}</span>
				<span className='opacity-30 tabular-nums text-[10px] shrink-0'>#{mon.id}</span>
			</div>
		))
	if (field.id === 'type')
		return cell((mon) => (
			<div className='flex gap-1'>
				{mon.types.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>
		))
	if (field.id === 'color')
		return cell((mon) => (
			<span className='flex items-center gap-1.5'>
				<span className='size-2.5 rounded-full border border-base-content/20' style={{ backgroundColor: mon.color }} />
				<span className='opacity-70'>{mon.color}</span>
			</span>
		))
	if (field.kind === 'bool') return cell((mon) => <BoolCell value={field.get(mon)} />)
	if (field.kind === 'range' && field.id in STAT_KEYS)
		return cell((mon) => <StatBar value={field.get(mon)} fieldId={field.id} />)
	if (field.kind === 'range')
		return cell((mon) => <span className='tabular-nums opacity-80'>{field.get(mon).toFixed(field.decimals ?? 0)}</span>)
	return cell((mon) => <span className='truncate opacity-70'>{field.get(mon)}</span>)
}

const COLUMNS: ColumnDef<Mon>[] = FIELDS.map((field) => ({
	id: field.id,
	header: field.label,
	size: field.width,
	accessorFn: (mon: Mon) => (field.kind === 'enum' ? field.get(mon).join(',') : field.get(mon)),
	enableSorting: field.kind !== 'enum',
	cell: cellFor(field),
	filterFn: (row, id, value) => matchField(FIELD_BY_ID[id]!, row.original, value as FilterValue),
}))

const HeaderFilter = ({
	field,
	value,
	setFilter,
}: {
	field: Field
	value: FilterValue | undefined
	setFilter: (id: string, value: FilterValue | undefined) => void
}) => (
	<details className='dropdown dropdown-end'>
		<summary
			className={`btn btn-ghost btn-xs px-1 h-5 min-h-0 ${value === undefined ? 'opacity-35 hover:opacity-100' : 'text-primary opacity-100'}`}
		>
			<LuFilter size={11} />
		</summary>
		<div className='dropdown-content z-30 mt-1 w-60 rounded-box bg-base-100 p-3 shadow-xl border border-base-content/10'>
			<div className='flex items-center justify-between mb-2'>
				<span className='text-xs font-semibold'>{field.label}</span>
				<button
					type='button'
					className='btn btn-ghost btn-xs px-1 h-4 min-h-0 opacity-60'
					onClick={() => setFilter(field.id, undefined)}
				>
					clear
				</button>
			</div>
			<FilterControl field={field} value={value} onChange={(next) => setFilter(field.id, next)} />
		</div>
	</details>
)

/**
 * A blocking overlay, not an inline bar. Covering the table stops stray clicks and scrolls queueing
 * up against a thread that is already behind, which is what escalates a stutter into Chrome's "Page
 * Unresponsive" dialog. No backdrop blur on purpose: it would compete for the very GPU we're waiting
 * on. Split out from `Root` so that `loadProgress` updates repaint this subtree alone — see the note
 * on `createProgressStore` for what routing them through root state actually cost.
 */
const LoadOverlay = ({ label, size }: { label: string; size: string }) => {
	const { text, value } = useSyncExternalStore(loadProgress.subscribe, loadProgress.getSnapshot)
	return (
		<div className='fixed inset-0 z-50 grid place-items-center bg-base-300/90 cursor-wait'>
			<div className='card bg-base-100 shadow-xl w-[min(30rem,90vw)]'>
				<div className='card-body gap-3 p-5'>
					<h2 className='card-title text-base gap-2'>
						<LuBrain size={18} /> Loading {label}
					</h2>
					<progress className='progress progress-primary w-full' value={value} max={1} />
					<p className='text-xs opacity-70 min-h-[2rem]'>{text}</p>
					<p className='text-[11px] opacity-45'>{size}, cached after the first visit. Runs entirely in this tab.</p>
				</div>
			</div>
		</div>
	)
}

type ModelState = 'error' | 'idle' | 'loading' | 'ready'

type Rejection = { reason: string; message: string }

// `loadEngine` and `streamFilters` live out here rather than inside `Root` so that React Compiler can
// compile the component. It does not yet support dynamic `import()`, `for await`, or `try/finally`, and
// a single unsupported construct disqualifies the whole component — including unrelated derived values,
// which then lose their memoization. Keeping the async work at module scope keeps `Root` compilable.
const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

type LoadEngineHandlers = {
	id: string
	previous: Engine | null
	onLoaded: (engine: Engine, loadMs: number) => void
	onError: (message: string) => void
}

const loadEngine = async ({ id, previous, onLoaded, onError }: LoadEngineHandlers) => {
	loadProgress.set('Starting…', 0)
	const started = performance.now()

	try {
		// A React state change does not guarantee a paint, and the frames immediately after this are
		// the contended ones. Without waiting, the overlay never reaches the screen: the page freezes
		// still looking fully interactive, which is precisely what reads as a crash.
		await nextPaint()
		await previous?.unload()
		const webllm = await import(/* @vite-ignore */ `${CDN}@mlc-ai/web-llm`)
		const engine: Engine = await webllm.CreateWebWorkerMLCEngine(createEngineWorker(), id, {
			// WebLLM narrates every shard at INFO, and worker console output is proxied to the page's
			// main thread. WARN rather than SILENT so genuine failures still surface in the console.
			logLevel: 'WARN',
			initProgressCallback: (report: { text: string; progress: number }) =>
				loadProgress.set(report.text, report.progress),
		})
		onLoaded(engine, performance.now() - started)
	} catch (error) {
		onError(toErrorMessage(error))
	}
}

type StreamResult =
	{ ok: false; message: string } | { ok: true; decodeMs: number; tokensPerSecond?: number; rejection: Rejection | null }

const toRejection = (final: unknown): Rejection | null => {
	if (!R.isPlainObject(final) || final.ok !== false) return null
	return { reason: String(final.reason ?? 'off_domain'), message: String(final.message ?? '') }
}

const streamFilters = async (
	engine: Engine,
	prompt: string,
	onProgress: (text: string, parsed: Record<string, unknown> | null) => void,
): Promise<StreamResult> => {
	const started = performance.now()

	try {
		const stream = await engine.chat.completions.create({
			stream: true,
			stream_options: { include_usage: true },
			messages: buildMessages(prompt),
			temperature: 0,
			max_tokens: 400,
			response_format: { type: 'json_object', schema: JSON.stringify({ anyOf: [acceptSchema, rejectSchema] }) },
		})

		let text = ''
		let tokensPerSecond: number | undefined

		for await (const chunk of stream) {
			text += chunk.choices[0]?.delta?.content ?? ''
			const parsed = repairJson(text)
			onProgress(text, R.isPlainObject(parsed) ? parsed : null)
			if (chunk.usage?.extra?.decode_tokens_per_s) tokensPerSecond = chunk.usage.extra.decode_tokens_per_s
		}

		return {
			ok: true,
			decodeMs: performance.now() - started,
			tokensPerSecond,
			rejection: toRejection(repairJson(text)),
		}
	} catch (error) {
		return { ok: false, message: toErrorMessage(error) }
	}
}

type Timing = { load?: number; decode?: number; tokensPerSecond?: number }

/** One fetch, one derive, one pass to fill `RANGE_STATS` — everything else reads the result. */
const usePokedexRows = () => {
	const [rows, setRows] = useState<Mon[]>([])
	const [loadError, setLoadError] = useState<string | null>(null)

	useEffect(() => {
		const controller = new AbortController()
		fetch(DATA_URL, { signal: controller.signal })
			.then((response) => response.json())
			.then((raw: RawMon[]) => {
				const derived = raw.map(deriveMon)
				computeRangeStats(derived)
				setRows(derived)
			})
			.catch((error) => {
				if (!controller.signal.aborted) setLoadError(toErrorMessage(error))
			})
		return () => controller.abort()
	}, [])

	return { rows, loadError }
}

/** The WebLLM engine's whole lifecycle: which model, how far along, and how long it took. */
const useEngine = () => {
	const engineRef = useRef<Engine | null>(null)
	// Bumped the moment a load starts, so anything still streaming off the outgoing engine is stale.
	const runIdRef = useRef(0)
	const [modelId, setModelId] = useState<string>(MODELS[1]!.id)
	const [modelState, setModelState] = useState<ModelState>('idle')
	const [modelError, setModelError] = useState('')
	const [timing, setTiming] = useState<Timing>({})

	const loadModel = (id: string) => {
		runIdRef.current += 1
		setModelState('loading')
		void loadEngine({
			id,
			previous: engineRef.current,
			onLoaded: (engine, loadMs) => {
				engineRef.current = engine
				setTiming({ load: loadMs })
				setModelState('ready')
			},
			onError: (message) => {
				setModelError(message)
				setModelState('error')
			},
		})
	}

	const selectModel = (id: string) => {
		setModelId(id)
		// Already running one? Swap immediately. Otherwise the Enable button starts it.
		if (modelState === 'ready') loadModel(id)
	}

	return { engineRef, runIdRef, modelId, modelState, modelError, timing, setTiming, loadModel, selectModel }
}

type ModelNoticeProps = {
	modelState: ModelState
	modelError: string
	size: string
}

/** The one-line status under the prompt: what loading the model buys you, or why it didn't load. */
const ModelNotice = ({ modelState, modelError, size }: ModelNoticeProps) => {
	if (modelState === 'idle')
		return (
			<p className='px-3 pb-2 text-[11px] opacity-50'>
				The table below works right now — filter and sort it however you like. Loading the model ({size}, cached after
				the first visit) adds natural-language search on top, running entirely in this tab.
			</p>
		)
	if (modelState !== 'error') return null
	return (
		<p className='px-3 pb-2 text-[11px] text-error'>
			Couldn't load the model: {modelError}.{' '}
			{/* ~700 MB of weights: a dropped connection is likelier than absent WebGPU. Only blame WebGPU when it is. */}
			{navigator.gpu
				? 'Try again — the weights download can drop partway.'
				: 'This pen needs WebGPU, which this browser does not support.'}
		</p>
	)
}

type PromptHeaderProps = {
	prompt: string
	setPrompt: (value: string) => void
	onRun: () => void
	running: boolean
	modelId: string
	onSelectModel: (id: string) => void
	modelState: ModelState
	modelError: string
	onEnable: () => void
	rejection: Rejection | null
	onDismissRejection: () => void
}

const PromptHeader = ({
	prompt,
	setPrompt,
	onRun,
	running,
	modelId,
	onSelectModel,
	modelState,
	modelError,
	onEnable,
	rejection,
	onDismissRejection,
}: PromptHeaderProps) => {
	const selectedModel = MODELS.find((model) => model.id === modelId)!

	return (
		<header className='shrink-0 border-b border-base-content/10 bg-base-200/60'>
			<div className='flex items-center gap-2 px-3 py-2'>
				<span className='flex items-center gap-1.5 font-semibold text-sm shrink-0'>
					<LuSparkles size={15} className='text-primary' /> Pokédex
				</span>

				<div className='relative flex-1 min-w-0'>
					<Input
						className='input input-sm w-full pr-20'
						placeholder={
							modelState === 'ready'
								? 'Describe what you want — "tanky water types from the first two gens"'
								: 'Enable natural-language search to type a request…'
						}
						value={prompt}
						disabled={modelState !== 'ready' || running}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') onRun()
						}}
					/>
					<span className='absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] opacity-40'>
						{running ? <span className='loading loading-spinner loading-xs' /> : <LuCornerDownLeft size={11} />}
					</span>
				</div>

				<div className='flex items-center gap-2 shrink-0'>
					<select
						className='select select-sm select-bordered w-40'
						value={modelId}
						disabled={modelState === 'loading' || running}
						onChange={(event) => onSelectModel(event.target.value)}
					>
						{MODELS.map((model) => (
							<option key={model.id} value={model.id}>
								{modelState === 'ready' ? model.label : `${model.label} · ${model.size}`}
							</option>
						))}
					</select>
					{modelState !== 'ready' && (
						<Button className='btn-sm btn-primary' disabled={modelState === 'loading'} onClick={onEnable}>
							<LuBrain size={14} />
							{modelState === 'loading' ? 'Loading…' : 'Enable AI search'}
						</Button>
					)}
				</div>

				<ThemePicker variant='modal' />
			</div>

			{modelState === 'loading' && <LoadOverlay label={selectedModel.label} size={selectedModel.size} />}

			<ModelNotice modelState={modelState} modelError={modelError} size={selectedModel.size} />

			{rejection && (
				<div className='mx-3 mb-2 alert alert-warning py-1.5 px-3 text-xs'>
					<LuCircleAlert size={14} />
					<span>{rejection.message}</span>
					<button type='button' className='btn btn-ghost btn-xs' onClick={onDismissRejection}>
						<LuX size={12} />
					</button>
				</div>
			)}
		</header>
	)
}

/**
 * `sorting` and `columnVisibility` come in as props even though `table` already holds both. The table
 * object is one instance for the life of the pen, so React Compiler sees an unchanging dependency and
 * would happily hand this component its first, empty render forever — the same staleness the note at
 * the top of the file describes for v9. Reading the state directly is what makes the cache key move.
 *
 * For the same reason the three reads off `table` sit above `useVirtualizer`: the compiler cannot
 * cache across a hook call, so anything derived before one is recomputed every render.
 */
type TableGridProps = {
	table: Table<Mon>
	sorting: SortingState
	columnVisibility: VisibilityState
	filters: Filters
	setFilter: (id: string, value: FilterValue | undefined) => void
}

const TableGrid = ({ table, sorting, columnVisibility, filters, setFilter }: TableGridProps) => {
	const scrollRef = useRef<HTMLDivElement>(null)
	const headers = table.getHeaderGroups()[0]?.headers ?? []
	const tableRows = table.getRowModel().rows
	const gridTemplate = FIELDS.filter((field) => columnVisibility[field.id] ?? true)
		.map((field) => `${field.width}px`)
		.join(' ')

	const virtualizer = useVirtualizer({
		count: tableRows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 40,
		overscan: 12,
	})

	// `getTotalSize()` reads virtualizer internals the compiler cannot see, and `useVirtualizer`
	// hands back one identity-stable instance — so a memo keyed on `virtualizer` alone caches the
	// first height forever and the scroll area keeps its unfiltered size. Naming `tableRows.length`
	// is what moves the cache key when a filter changes.
	const totalSize = tableRows.length > 0 ? virtualizer.getTotalSize() : 0

	return (
		<div ref={scrollRef} className='flex-1 overflow-auto'>
			<div style={{ width: gridTemplate ? 'max-content' : '100%', minWidth: '100%' }}>
				<div
					className='sticky top-0 z-20 grid bg-base-200 border-b border-base-content/15 text-xs font-semibold'
					style={{ gridTemplateColumns: gridTemplate }}
				>
					{headers.map((header) => {
						const field = FIELD_BY_ID[header.column.id]! // column ids are generated from FIELDS
						const sorted = sorting.find((entry) => entry.id === header.column.id)
						return (
							<div key={header.id} className='flex items-center gap-1 px-2 py-1.5 min-w-0'>
								<button
									type='button'
									className={`truncate text-left ${header.column.getCanSort() ? 'cursor-pointer hover:text-primary' : 'cursor-default'}`}
									onClick={header.column.getToggleSortingHandler()}
								>
									{flexRender(header.column.columnDef.header, header.getContext())}
								</button>
								{sorted?.desc === false && <LuChevronUp size={11} className='text-primary shrink-0' />}
								{sorted?.desc === true && <LuChevronDown size={11} className='text-primary shrink-0' />}
								<span className='flex-1' />
								<HeaderFilter field={field} value={filters[field.id]} setFilter={setFilter} />
							</div>
						)
					})}
				</div>

				<div style={{ height: totalSize, position: 'relative' }}>
					{virtualizer.getVirtualItems().map((virtualRow) => {
						const row = tableRows[virtualRow.index]! // virtualizer only yields in-range indexes
						return (
							<div
								key={row.id}
								className='grid absolute left-0 top-0 w-full items-center border-b border-base-content/5 text-xs hover:bg-base-200/60'
								style={{
									gridTemplateColumns: gridTemplate,
									height: virtualRow.size,
									transform: `translateY(${virtualRow.start}px)`,
								}}
							>
								{row.getVisibleCells().map((visibleCell) => (
									<div key={visibleCell.id} className='px-2 min-w-0 truncate'>
										{flexRender(visibleCell.column.columnDef.cell, visibleCell.getContext())}
									</div>
								))}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}

type PokedexBodyProps = TableGridProps & {
	rows: Mon[]
	loadError: string | null
	touched: Set<string>
	onReset: () => void
}

/** The filter panel and whichever of the three table states applies. */
const PokedexBody = ({ rows, loadError, touched, onReset, ...grid }: PokedexBodyProps) => (
	<div className='flex-1 flex min-h-0'>
		<FilterPanel filters={grid.filters} setFilter={grid.setFilter} touched={touched} onReset={onReset} />

		<main className='flex-1 min-w-0 flex flex-col'>
			{loadError ? (
				<div className='flex-1 grid place-items-center text-sm text-error'>Failed to load Pokédex: {loadError}</div>
			) : rows.length === 0 ? (
				<div className='flex-1 grid place-items-center gap-2'>
					<span className='loading loading-spinner loading-lg' />
				</div>
			) : (
				<TableGrid {...grid} />
			)}
		</main>
	</div>
)

const JsonDrawer = ({ streamText, onClose }: { streamText: string; onClose: () => void }) => (
	<div className='shrink-0 h-56 border-t border-base-content/10 bg-base-300/40 flex flex-col'>
		<div className='flex items-center justify-between px-3 py-1.5 border-b border-base-content/10'>
			<span className='text-xs font-semibold opacity-70'>Model output</span>
			<button type='button' className='btn btn-ghost btn-xs' onClick={onClose}>
				<LuX size={12} />
			</button>
		</div>
		<pre className='flex-1 overflow-auto p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap'>
			{streamText || <span className='opacity-40'>Run a natural-language search to see what the model emits.</span>}
		</pre>
	</div>
)

/**
 * React Compiler caches a derived value against the values it references, and `table` is a single
 * object for the life of the pen — keyed on that alone the count freezes at the empty first render.
 * The trailing arguments are unused on purpose: they are the cache key, and unlike `table` they move.
 * `TableGrid` needs no such thing because its own reads sit above a hook call, which the cache cannot
 * span. Anywhere else, read the table through this.
 */
const countRows = (table: Table<Mon>, ..._cacheKey: unknown[]) => table.getRowModel().rows.length

/** Never touches `table`, for the reason spelled out on `TableGridProps` — plain state only. */
type StatusBarProps = {
	filteredRows: number
	totalRows: number
	columnVisibility: VisibilityState
	onToggleColumn: (id: string) => void
	filters: Filters
	setFilter: (id: string, value: FilterValue | undefined) => void
	timing: Timing
	onToggleJson: () => void
}

const StatusBar = ({
	filteredRows,
	totalRows,
	columnVisibility,
	onToggleColumn,
	filters,
	setFilter,
	timing,
	onToggleJson,
}: StatusBarProps) => (
	<footer className='shrink-0 flex items-center gap-3 px-3 py-1 border-t border-base-content/10 bg-base-200/60 text-[11px]'>
		<span className='tabular-nums'>
			<strong>{filteredRows.toLocaleString()}</strong>
			<span className='opacity-50'> / {totalRows.toLocaleString()} Pokémon</span>
		</span>
		{!R.isEmpty(filters) && (
			<span className='flex items-center gap-1 flex-wrap min-w-0'>
				{R.entries(filters).map(([id, value]) => (
					<span key={id} className='badge badge-xs badge-primary badge-soft gap-1'>
						{FIELD_BY_ID[id]!.label}: {summarize(FIELD_BY_ID[id]!, value)}
						<button type='button' onClick={() => setFilter(id, undefined)}>
							<LuX size={9} />
						</button>
					</span>
				))}
			</span>
		)}
		<span className='flex-1' />
		{timing.load != null && <span className='opacity-45'>model {(timing.load / 1000).toFixed(1)}s</span>}
		{timing.decode != null && <span className='opacity-45'>decode {(timing.decode / 1000).toFixed(2)}s</span>}
		{timing.tokensPerSecond != null && <span className='opacity-45'>{timing.tokensPerSecond.toFixed(0)} tok/s</span>}
		<details className='dropdown dropdown-top dropdown-end'>
			<summary className='btn btn-ghost btn-xs'>
				<LuColumns3 size={12} /> Columns
			</summary>
			<div className='dropdown-content z-30 mb-1 w-52 max-h-80 overflow-y-auto rounded-box bg-base-100 p-2 shadow-xl border border-base-content/10'>
				{FIELDS.map((field) => (
					<label
						key={field.id}
						className='flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-base-200 rounded'
					>
						<input
							type='checkbox'
							className='checkbox checkbox-xs'
							checked={columnVisibility[field.id] ?? true}
							onChange={() => onToggleColumn(field.id)}
						/>
						<span className='text-xs'>{field.label}</span>
					</label>
				))}
			</div>
		</details>
		<button type='button' className='btn btn-ghost btn-xs' onClick={onToggleJson}>
			<LuBrain size={12} /> JSON
		</button>
	</footer>
)

const Root = () => {
	const { rows, loadError } = usePokedexRows()
	const [filters, setFilters] = useState<Filters>({})
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		R.mapValues(FIELD_BY_ID, (field) => DEFAULT_COLUMNS.has(field.id)),
	)

	const [prompt, setPrompt] = useState('')
	const [running, setRunning] = useState(false)
	const [streamText, setStreamText] = useState('')
	const [touched, setTouched] = useState<Set<string>>(() => new Set())
	const [rejection, setRejection] = useState<Rejection | null>(null)
	const [showJson, setShowJson] = useState(false)

	// Referentially stable via React Compiler. TanStack Table keys its filtered-row-model memo on this
	// array's identity, so a fresh one each render invalidates it, firing auto-reset → onStateChange →
	// setState → an endless render loop. Keep `Root` compilable or this needs memoizing by hand.
	const columnFilters: ColumnFiltersState = R.entries(filters).map(([id, value]) => ({ id, value }))

	const table = useReactTable({
		data: rows,
		columns: COLUMNS,
		state: { columnFilters, sorting, columnVisibility },
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
	})

	const filteredRows = countRows(table, rows, filters, sorting)

	const { engineRef, runIdRef, modelId, modelState, modelError, timing, setTiming, loadModel, selectModel } =
		useEngine()

	const setFilter = (id: string, value: FilterValue | undefined) =>
		setFilters((current) => (value === undefined ? R.omit(current, [id]) : { ...current, [id]: value }))

	const toggleColumn = (id: string) => setColumnVisibility((current) => ({ ...current, [id]: !(current[id] ?? true) }))

	const resetAll = () => {
		setFilters({})
		setSorting([])
		setTouched(new Set())
		setRejection(null)
	}

	// Every accepted partial replaces the whole table state, so a response that never reaches `query`
	// or `sort` clears them instead of leaving the previous prompt's. `ok` streams after `thinking`,
	// and until it lands neither branch is chosen — applying then would wipe the table on a rejection.
	const applyPartial = (parsed: Record<string, unknown>) => {
		if (parsed.ok !== true) return
		const fields = Array.isArray(parsed.fields) ? parsed.fields.filter((id) => typeof id === 'string') : []
		setTouched(new Set(fields))
		setFilters(sanitizeFilters(parsed.query))
		setSorting(sanitizeSorting(parsed.sort))
	}

	const run = () => {
		const engine = engineRef.current
		if (!engine || !prompt.trim() || running) return
		const runId = runIdRef.current
		const isStale = () => runId !== runIdRef.current
		setRunning(true)
		setRejection(null)
		setStreamText('')

		const onProgress = (text: string, parsed: Record<string, unknown> | null) => {
			if (isStale()) return
			setStreamText(text)
			if (parsed) applyPartial(parsed)
		}

		void streamFilters(engine, prompt.trim(), onProgress).then((result) => {
			// This run exclusively owns `running`, so clearing it above the staleness check is what stops
			// a stream off a swapped-out engine leaving the prompt disabled forever.
			setRunning(false)
			if (isStale()) return
			if (result.ok) {
				if (result.rejection) setRejection(result.rejection)
				setTiming((current) => ({ ...current, decode: result.decodeMs, tokensPerSecond: result.tokensPerSecond }))
			} else setRejection({ reason: 'error', message: result.message })
		})
	}

	return (
		<ThemeProvider>
			<div className='h-screen w-screen flex flex-col overflow-hidden bg-base-100'>
				<PromptHeader
					prompt={prompt}
					setPrompt={setPrompt}
					onRun={run}
					running={running}
					modelId={modelId}
					onSelectModel={selectModel}
					modelState={modelState}
					modelError={modelError}
					onEnable={() => loadModel(modelId)}
					rejection={rejection}
					onDismissRejection={() => setRejection(null)}
				/>

				<PokedexBody
					rows={rows}
					loadError={loadError}
					table={table}
					sorting={sorting}
					columnVisibility={columnVisibility}
					filters={filters}
					setFilter={setFilter}
					touched={touched}
					onReset={resetAll}
				/>

				{showJson && <JsonDrawer streamText={streamText} onClose={() => setShowJson(false)} />}

				<StatusBar
					filteredRows={filteredRows}
					totalRows={rows.length}
					columnVisibility={columnVisibility}
					onToggleColumn={toggleColumn}
					filters={filters}
					setFilter={setFilter}
					timing={timing}
					onToggleJson={() => setShowJson((current) => !current)}
				/>
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
