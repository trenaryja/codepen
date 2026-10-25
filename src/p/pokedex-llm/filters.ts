import * as R from 'https://esm.sh/remeda'
import type { Field, FilterValue, Filters, Mon, RangeValue } from './fields'
import { FIELD_BY_ID, isLevel, listOf, rangeOf, textOf } from './fields'
import { resolveRange } from './rows'

export const matchField = (field: Field, mon: Mon, value: FilterValue) => {
	if (field.kind === 'enum') {
		const wanted = listOf(value)
		if (!wanted.length) return true
		return field.get(mon).some((own) => wanted.includes(own))
	}
	if (field.kind === 'range') {
		const [min, max] = resolveRange(field.id, rangeOf(value))
		const own = field.get(mon)
		return (min == null || own >= min) && (max == null || own <= max)
	}
	if (field.kind === 'bool') return field.get(mon) === value
	const needle = textOf(value).trim().toLowerCase()
	if (!needle) return true
	return field.get(mon).toLowerCase().includes(needle)
}

export const sanitizeEnum = (values: readonly string[], value: unknown) => {
	if (!Array.isArray(value)) return
	// Partial streams produce half-typed values like "Wa" — only keep real ones.
	const valid = value.filter((entry): entry is string => typeof entry === 'string' && values.includes(entry))
	return valid.length ? valid : undefined
}

export const sanitizeRange = (value: unknown): RangeValue | undefined => {
	if (!R.isPlainObject(value)) return undefined
	if ('level' in value && isLevel(value.level)) return { level: value.level }
	const min = typeof value.min === 'number' ? value.min : undefined
	const max = typeof value.max === 'number' ? value.max : undefined
	if (min == null && max == null) return undefined
	return { min, max }
}

/** `undefined` means "the model gave us nothing usable for this field", so the caller drops it. */
export const sanitizeValue = (field: Field, value: unknown): FilterValue | undefined => {
	if (field.kind === 'enum') return sanitizeEnum(field.values, value)
	if (field.kind === 'range') return sanitizeRange(value)
	if (field.kind === 'bool') return typeof value === 'boolean' ? value : undefined
	return typeof value === 'string' && value.trim() ? value : undefined
}

/** Drop anything the model invented that the pack doesn't recognise, and drop no-op filters. */
export const sanitizeFilters = (raw: unknown): Filters => {
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
export const sanitizeSorting = (raw: unknown) =>
	R.isPlainObject(raw) && typeof raw.field === 'string' && Object.hasOwn(FIELD_BY_ID, raw.field)
		? [{ id: raw.field, desc: Boolean(raw.desc) }]
		: []
