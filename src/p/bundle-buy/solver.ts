import * as R from 'https://esm.sh/remeda'
import type { Bundle, ImpliedValue, Item, Need, Scenario, ScenarioImport, Solution } from './types'

export function hydrate(input: ScenarioImport): Scenario {
	const items: Item[] = input.items.map((i) => ({ id: R.randomString(21), displayName: i.name, variable: i.symbol }))
	const bundles: Bundle[] = input.bundles.map((b) => ({
		id: R.randomString(21),
		name: b.name,
		price: b.price,
		quantities: Object.fromEntries(items.map((item, i) => [item.id, b.quantities[i] ?? 0])),
	}))
	return { id: R.randomString(21), name: input.name, items, bundles }
}

export function dehydrate(scenario: Scenario): ScenarioImport {
	return {
		name: scenario.name,
		items: scenario.items.map((i) => ({ name: i.displayName, symbol: i.variable })),
		bundles: scenario.bundles.map((b) => ({
			name: b.name,
			price: b.price,
			quantities: scenario.items.map((i) => b.quantities[i.id] ?? 0),
		})),
	}
}

// What buying `counts[i]` of `bundles[i]` costs and yields.
export function tallyPurchase(bundles: Bundle[], itemIds: string[], counts: number[]) {
	const totals: Record<string, number> = {}
	let cost = 0

	for (const [i, bundle] of bundles.entries()) {
		const count = counts[i] ?? 0
		cost += bundle.price * count
		for (const id of itemIds) totals[id] = (totals[id] ?? 0) + (bundle.quantities[id] ?? 0) * count
	}

	return { totals, cost }
}

export const coversNeeds = (itemIds: string[], totals: Record<string, number>, needs: Need) =>
	itemIds.every((id) => (totals[id] ?? 0) >= (needs[id] ?? 0))

export const surplusOver = (itemIds: string[], totals: Record<string, number>, needs: Need) =>
	Object.fromEntries(itemIds.map((id) => [id, (totals[id] ?? 0) - (needs[id] ?? 0)]))

// Brute-force ILP — viable only because bundle counts stay small.
export function solve(bundles: Bundle[], items: Item[], needs: Need): Solution | null {
	if (bundles.length === 0 || items.length === 0) return null

	const itemIds = items.map((i) => i.id)
	const maxPerBundle = bundles.map((b) => {
		const maxNeeded = Math.max(
			...itemIds.map((id) => {
				const q = b.quantities[id] ?? 0
				return q > 0 ? Math.ceil((needs[id] ?? 0) / q) : 0
			}),
		)
		return Math.min(maxNeeded + 2, 20)
	})

	let best: Solution | null = null
	const counts = bundles.map(() => 0)

	function search(depth: number, partialCost: number) {
		const bundle = bundles[depth]
		const limit = maxPerBundle[depth]
		if (bundle === undefined || limit === undefined) {
			const { totals, cost } = tallyPurchase(bundles, itemIds, counts)
			if (!coversNeeds(itemIds, totals, needs)) return
			if (best !== null && cost >= best.totalCost) return

			best = {
				bundleCounts: Object.fromEntries(
					R.zip(
						bundles.map((x) => x.id),
						counts,
					),
				),
				totalCost: cost,
				totalItems: { ...totals },
				surplus: surplusOver(itemIds, totals, needs),
			}

			return
		}

		for (let count = 0; count <= limit; count++) {
			counts[depth] = count
			const cost = partialCost + bundle.price * count

			if (best !== null && cost >= best.totalCost) {
				counts[depth] = 0
				return
			}

			search(depth + 1, cost)
		}

		counts[depth] = 0
	}

	search(0, 0)
	return best
}

// Least-squares decomposition of bundle prices into per-item implied values.
export function deriveImpliedValues(bundles: Bundle[], items: Item[]): ImpliedValue[] {
	if (bundles.length === 0 || items.length === 0) return []

	const n = items.length
	const columns = items.map((item) => bundles.map((bundle) => bundle.quantities[item.id] ?? 0))
	const prices = bundles.map((bundle) => bundle.price)
	const dot = (left: number[], right: number[]) =>
		R.zip(left, right).reduce((sum, [leftValue, rightValue]) => sum + leftValue * rightValue, 0)

	// Normal equations, augmented: row i is [(AᵀA)ᵢ…, (Aᵀb)ᵢ].
	let rows = columns.map((column) => [...columns.map((other) => dot(column, other)), dot(column, prices)])

	for (let col = 0; col < n; col++) {
		const magnitude = (row: number[]) => Math.abs(row[col] ?? 0)
		const pivotRow = rows.slice(col).reduce((best, row) => (magnitude(row) > magnitude(best) ? row : best))
		rows = R.swapIndices(rows, col, rows.indexOf(pivotRow))
		const pivot = pivotRow[col] ?? 0
		if (Math.abs(pivot) < 1e-10) continue

		rows = rows.map((row, index) => {
			if (index <= col) return row
			const factor = (row[col] ?? 0) / pivot
			return R.zip(row, pivotRow).map(([value, pivotValue], j) => (j < col ? value : value - factor * pivotValue))
		})
	}

	const solution = rows.map(() => 0)

	for (const [i, row] of rows.entries().toArray().toReversed()) {
		const diagonal = row[i] ?? 0
		if (Math.abs(diagonal) < 1e-10) continue
		const rest = R.zip(row, solution).slice(i + 1)
		solution[i] = rest.reduce((total, [coefficient, solved]) => total - coefficient * solved, row[n] ?? 0) / diagonal
	}

	return R.zip(items, solution).map(([item, value]) => ({ itemId: item.id, value }))
}
