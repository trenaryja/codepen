import * as R from 'https://esm.sh/remeda'
import { BASE62, decodeIntegers, encodeIntegers, triIndex, triInverse } from './codec'

export type Bin = { x: number; y: number; w: number; h: number; key: string }

export type Recipe = { key: string; counts: Record<string, number>; unique: number; layout: Bin[]; tags: TagId[] }
export const TAG_IDS = ['max-unique', 'monochrome', 'no-repeat', 'squares-only', 'uniform-count', 'all-multi'] as const
export type TagId = (typeof TAG_IDS)[number]
export type Constraint = { size: string; op: '=' | '>=' | 'exclude'; n: number }
export type Filters = { tags: Set<TagId>; favoriteOnly: boolean; constraints: Constraint[] }

export const { sort: sortWith } = R

export const parseSize = (size: string): [number, number] => {
	const [w, h] = size.split('×', 2)
	return [Number(w), Number(h)]
}

export const encodeRecipe = (counts: Record<string, number>, W: number, H: number) => {
	const pieces = Object.entries(counts)
		.map(([key, count]) => {
			const [w, h] = parseSize(key)
			return { w, h, count }
		})
		.toSorted((a, b) => triIndex(a.w, a.h) - triIndex(b.w, b.h))

	const values = [W, H, pieces.length]
	let prevIndex = -1

	for (const [i, { w, h, count }] of pieces.entries()) {
		const pairIndex = triIndex(w, h)
		values.push(pairIndex - prevIndex)
		if (i < pieces.length - 1) values.push(count)
		prevIndex = pairIndex
	}

	return encodeIntegers(values, BASE62)
}

export const decodeRecipe = (encoded: string) => {
	const values = decodeIntegers(encoded, BASE62)
	let pos = 0

	const read = () => {
		const value = values[pos++]
		if (value === undefined) throw new Error('truncated recipe id')
		return value
	}

	const W = read()
	const H = read()
	const N = read()
	let remaining = W * H
	const counts: Record<string, number> = {}
	let prevIndex = -1

	for (let i = 0; i < N; i++) {
		const raw = read()
		const pairIndex = prevIndex + raw
		const [w, h] = triInverse(pairIndex)
		const area = w * h
		const count = i === N - 1 ? Math.floor(remaining / area) : read()
		counts[`${w}×${h}`] = count
		remaining -= count * area
		prevIndex = pairIndex
	}

	return { W, H, counts }
}

export const computeTags = (recipe: Recipe, maxUnique: number) => {
	const tags: TagId[] = []
	if (recipe.unique === maxUnique) tags.push('max-unique')
	if (recipe.unique === 1) tags.push('monochrome')
	if (R.values(recipe.counts).every((c) => c === 1)) tags.push('no-repeat')
	if (R.keys(recipe.counts).every((s) => s.split('×', 1)[0] === s.split('×', 2)[1])) tags.push('squares-only')
	const counts = R.values(recipe.counts)
	if (counts.every((count) => count === counts[0])) tags.push('uniform-count')
	if (counts.every((count) => count >= 2)) tags.push('all-multi')
	return tags
}

export const matchesFilter = (recipe: Recipe, filters: Filters, favorites: Set<string>) => {
	if (filters.favoriteOnly && !favorites.has(recipe.key)) return false
	for (const tag of filters.tags) if (!recipe.tags.includes(tag)) return false

	for (const c of filters.constraints) {
		const count = recipe.counts[c.size] ?? 0
		if (c.op === '=' && count !== c.n) return false
		if (c.op === '>=' && count < c.n) return false
		if (c.op === 'exclude' && count > 0) return false
	}

	return true
}

export const emptyFilters = (): Filters => ({ tags: new Set(), favoriteOnly: false, constraints: [] })

export const byFamily = (a: string, b: string) => {
	const [widthA, heightA] = parseSize(a)
	const [widthB, heightB] = parseSize(b)
	return Math.min(widthA, heightA) - Math.min(widthB, heightB) || Math.max(widthA, heightA) - Math.max(widthB, heightB)
}

export const availableSizes = (W: number, H: number) => {
	const seen = new Set<string>()
	const sizes: string[] = []

	for (let w = 1; w <= W; w++)
		for (let h = 1; h <= H; h++) {
			const size = w <= h ? `${w}×${h}` : `${h}×${w}`
			if (seen.has(size)) continue
			seen.add(size)
			sizes.push(size)
		}

	return sizes.toSorted(byFamily)
}

export const parseInitialDims = (id: string | null) => {
	try {
		return id ? decodeRecipe(id) : null
	} catch {
		return null
	}
}

export const sortRecipes = (solved: Recipe[]) => {
	const sortedEntries = (recipe: Recipe) => sortWith(R.entries(recipe.counts), ([a], [b]) => byFamily(a, b))
	return sortWith(solved, (a, b) => {
		if (a.unique !== b.unique) return a.unique - b.unique
		const sortedA = sortedEntries(a)
		const sortedB = sortedEntries(b)

		for (const [[sizeA, countA], [sizeB, countB]] of R.zip(sortedA, sortedB)) {
			const diff = byFamily(sizeA, sizeB)
			if (diff) return diff
			if (countA !== countB) return countA - countB
		}

		return sortedA.length - sortedB.length
	})
}

export const restoredKey = (restoreId: string, sorted: Recipe[]) => {
	try {
		const { counts } = decodeRecipe(restoreId)
		const pairs = R.entries(counts).map(([k, v]) => `${k}:${v}`)
		pairs.sort()
		const targetKey = pairs.join('|')
		return sorted.find((r) => r.key === targetKey)?.key ?? null
	} catch {
		// malformed hash — fall through to default selection
		return null
	}
}
