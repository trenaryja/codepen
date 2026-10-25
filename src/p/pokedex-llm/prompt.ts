import * as R from 'https://esm.sh/remeda'
import type { Field } from './fields'
import { FIELDS, FIELD_BY_ID, LEVELS } from './fields'
import { RANGE_STATS } from './rows'

// The JSON schema handed to the model.
export const fieldValueSchema = (field: Field) => {
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

export const SORTABLE = FIELDS.filter((field) => field.kind === 'range').map((field) => field.id)

export const thinkingSchema = { type: 'string', maxLength: 160 }

/**
 * `thinking` opens both branches identically, so the grammar keeps both alive while the model
 * reasons — constrained decoding can't backtrack, and without this it would have to commit to
 * ok/reject on the very first property token. `fields` is declared before `query` so the model
 * picks its axes before its values, and so the output stays short at 20 fields. Its `maxItems` is
 * load-bearing, not tidiness: the grammar happily lets a small model emit the same field forever,
 * and a 360M one does — it burns the whole budget repeating "speed" and never reaches `query`.
 */
export const acceptSchema = {
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

export const rejectSchema = {
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

export const describeField = (field: Field) => {
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

export const buildSystemPrompt = () =>
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
export const EXAMPLES: [string, object][] = [
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

export const buildMessages = (prompt: string) => [
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
export const closeOpen = (text: string) => {
	const stack: string[] = []
	let inString = false
	let escaped = false

	for (const char of text)
		if (escaped) escaped = false
		else if (char === '\\') escaped = true
		else if (char === '"') inString = !inString
		else if (!inString && (char === '{' || char === '[')) stack.push(char === '{' ? '}' : ']')
		else if (!inString && (char === '}' || char === ']')) stack.pop()

	const closed = (inString ? `${text}"` : text).replace(/[,:]\s*$/, '')
	return closed + stack.toReversed().join('')
}

export const repairJson = (text: string): unknown => {
	let work = text.trim()

	for (let attempt = 0; attempt < 8 && work.length > 1; attempt++)
		try {
			return JSON.parse(closeOpen(work))
		} catch {
			const comma = work.lastIndexOf(',')
			const open = Math.max(work.lastIndexOf('{'), work.lastIndexOf('['))
			if (comma > open) work = work.slice(0, comma)
			else if (open > 0) work = work.slice(0, open + 1)
			else return null
		}

	return null
}
