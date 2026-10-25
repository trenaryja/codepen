import React from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import { fmt } from './scenarios'
import { coversNeeds, tallyPurchase } from './solver'
import type { Bundle, ImpliedValue, Item, Need, Solution } from './types'

export function ValueDecomposition({
	bundles,
	items,
	impliedValues,
}: {
	bundles: Bundle[]
	items: Item[]
	impliedValues: ImpliedValue[]
}) {
	if (impliedValues.length === 0) return null

	const valueMap = Object.fromEntries(impliedValues.map((v) => [v.itemId, v.value]))
	const bundleErrors = bundles.map((bundle) => {
		const predicted = items.reduce((sum, item) => sum + (bundle.quantities[item.id] ?? 0) * (valueMap[item.id] ?? 0), 0)
		const error = bundle.price - predicted
		const discountPct = predicted > 0 ? ((predicted - bundle.price) / predicted) * 100 : 0
		return { bundle, predicted, error, discountPct }
	})
	const bestDeal = R.firstBy(bundleErrors, (x) => x.error)
	if (!bestDeal) return null
	const hasMeaningfulBestDeal = bestDeal.error < -0.01

	return (
		<div className='space-y-4'>
			<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>
				Implied Per-Item Values (Least Squares)
			</h3>
			<p className='text-sm opacity-60'>
				Using least-squares regression on the bundle prices to derive what each item is implicitly worth:
			</p>
			<div className='flex flex-wrap gap-3'>
				{items.map((item) => {
					const value = valueMap[item.id] ?? 0
					return (
						<div key={item.id} className='surface min-w-32 p-4 text-center'>
							<div className='mb-1 text-2xl'>{item.variable}</div>
							<div className='font-mono text-xl font-bold'>{fmt(value)}</div>
							<div className='text-xs opacity-60'>{item.displayName}</div>
						</div>
					)
				})}
			</div>
			{hasMeaningfulBestDeal && (
				<div className='bg-success/10 border-success/30 flex items-center gap-3 rounded-lg border p-4'>
					<span className='text-2xl'>🏷️</span>
					<div>
						<p className='font-bold'>
							Best deal: <span className='text-success'>{bestDeal.bundle.name}</span>
						</p>
						<p className='text-sm opacity-70'>
							Priced {fmt(Math.abs(bestDeal.error))} below implied value ({bestDeal.discountPct.toFixed(1)}% discount) —
							you're paying {fmt(bestDeal.bundle.price)} for {fmt(bestDeal.predicted)} worth of items
						</p>
					</div>
				</div>
			)}
			<div className='overflow-x-auto'>
				<table className='table-sm table w-full'>
					<thead>
						<tr>
							<th>Bundle</th>
							<th className='text-right'>Actual Price</th>
							<th>Decomposition</th>
							<th className='text-right'>Predicted</th>
							<th className='text-right'>Error</th>
						</tr>
					</thead>
					<tbody>
						{bundleErrors.map(({ bundle, predicted, error }) => {
							const isBest = hasMeaningfulBestDeal && bundle === bestDeal.bundle
							const parts = items
								.filter((item) => (bundle.quantities[item.id] ?? 0) > 0)
								.map((item) => `${bundle.quantities[item.id]}${item.variable}`)
								.join(' + ')
							return (
								<tr key={bundle.id} className={isBest ? 'bg-success/10' : ''}>
									<td className='font-medium'>
										{bundle.name}
										{isBest && <span className='text-success ml-2 text-xs font-bold'>BEST DEAL</span>}
									</td>
									<td className='text-right font-mono'>{fmt(bundle.price)}</td>
									<td className='text-sm opacity-70'>{parts}</td>
									<td className='text-right font-mono'>{fmt(predicted)}</td>
									<td
										className={`text-right font-mono ${
											error < -0.01 ? 'text-success font-bold' : error > 0.5 ? 'text-warning' : 'opacity-50'
										}`}
									>
										{error >= 0 ? '+' : ''}
										{fmt(error)}
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}

export function SolutionDisplay({
	solution,
	bundles,
	items,
	needs,
}: {
	solution: Solution | null
	bundles: Bundle[]
	items: Item[]
	needs: Need
}) {
	if (!solution)
		return (
			<div className='surface p-6 text-center'>
				<p className='opacity-50'>Enter your needs above to find the optimal purchase combination.</p>
			</div>
		)

	const bundleMap = Object.fromEntries(bundles.map((b) => [b.id, b]))
	const purchasedBundles = Object.entries(solution.bundleCounts).filter(([, count]) => count > 0)

	return (
		<div className='space-y-4'>
			<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>Optimal Purchase</h3>
			<div className='surface space-y-4 p-6'>
				<div className='text-center'>
					<div className='font-mono text-4xl font-bold'>{fmt(solution.totalCost)}</div>
					<div className='mt-1 text-sm opacity-60'>total cost</div>
				</div>
				<div className='divider' />
				<div className='space-y-2'>
					<p className='text-sm font-medium'>Buy:</p>
					{purchasedBundles.map(([bundleId, count]) => {
						const bundle = bundleMap[bundleId]
						if (!bundle) return null
						return (
							<div key={bundleId} className='flex items-center justify-between'>
								<span>
									{count}× <span className='font-medium'>{bundle.name}</span>
									<span className='ml-2 opacity-50'>@ {fmt(bundle.price)} ea</span>
								</span>
								<span className='font-mono'>{fmt(bundle.price * count)}</span>
							</div>
						)
					})}
				</div>
				<div className='divider' />
				<div className='space-y-1'>
					<p className='text-sm font-medium'>You&apos;ll receive:</p>
					{items.map((item) => {
						const total = solution.totalItems[item.id] ?? 0
						const needed = needs[item.id] ?? 0
						const extra = solution.surplus[item.id] ?? 0
						return (
							<div key={item.id} className='flex justify-between text-sm'>
								<span>
									{item.variable} {item.displayName}
								</span>
								<span>
									<span className='font-mono'>{total}</span>
									{extra > 0 && (
										<span className='ml-1 opacity-50'>
											({needed} needed + {extra} extra)
										</span>
									)}
								</span>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}

export function AllCombinationsTable({
	bundles,
	items,
	needs,
	solution,
}: {
	bundles: Bundle[]
	items: Item[]
	needs: Need
	solution: Solution | null
}) {
	const hasNeeds = Object.values(needs).some((n) => n > 0)
	if (!hasNeeds || bundles.length === 0) return null

	const itemIds = items.map((i) => i.id)
	const maxPerBundle = bundles.map((b) => {
		const maxNeeded = Math.max(
			...itemIds.map((id) => {
				const q = b.quantities[id] ?? 0
				return q > 0 ? Math.ceil((needs[id] ?? 0) / q) : 0
			}),
		)
		return Math.min(maxNeeded + 2, 10)
	})

	type Combo = { counts: number[]; cost: number; totals: Record<string, number> }

	const combos: Combo[] = []
	const counts = bundles.map(() => 0)

	function enumerate(depth: number) {
		if (combos.length > 200) return
		const limit = maxPerBundle[depth]
		if (limit === undefined) {
			const { totals, cost } = tallyPurchase(bundles, itemIds, counts)
			if (coversNeeds(itemIds, totals, needs)) combos.push({ counts: [...counts], cost, totals })
			return
		}

		for (let count = 0; count <= limit; count++) {
			counts[depth] = count
			enumerate(depth + 1)
		}

		counts[depth] = 0
	}

	enumerate(0)
	combos.sort((a, b) => a.cost - b.cost)
	if (combos.length === 0) return null

	return (
		<div className='space-y-3'>
			<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>
				All Feasible Combinations ({combos.length})
			</h3>
			<div className='max-h-80 overflow-x-auto'>
				<table className='table-xs table w-full'>
					<thead className='bg-base-100 sticky top-0'>
						<tr>
							<th className='text-right'>Rank</th>
							{bundles.map((b) => (
								<th key={b.id} className='text-center'>
									{b.name}
								</th>
							))}
							{items.map((item) => (
								<th key={item.id} className='text-center'>
									{item.variable}
								</th>
							))}
							<th className='text-right'>Total</th>
						</tr>
					</thead>
					<tbody>
						{combos.map((combo, index) => {
							const isOptimal =
								solution && bundles.every((b, j) => (solution.bundleCounts[b.id] ?? 0) === combo.counts[j])
							return (
								<tr key={combo.counts.join('-')} className={isOptimal ? 'bg-success/15 font-bold' : ''}>
									<td className='text-right opacity-50'>#{index + 1}</td>
									{bundles.map((b, j) => {
										const count = combo.counts[j] ?? 0
										return (
											<td key={b.id} className='text-center font-mono'>
												{count === 0 ? <span className='opacity-20'>0</span> : count}
											</td>
										)
									})}
									{items.map((item) => (
										<td key={item.id} className='text-center font-mono'>
											{combo.totals[item.id]}
										</td>
									))}
									<td className='text-right font-mono'>{fmt(combo.cost)}</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}

export function PerUnitBreakdown({ bundles, items }: { bundles: Bundle[]; items: Item[] }) {
	if (bundles.length === 0 || items.length === 0) return null

	return (
		<div className='space-y-3'>
			<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>Per-Unit Cost by Bundle</h3>
			<div className='overflow-x-auto'>
				<table className='table-sm table w-full'>
					<thead>
						<tr>
							<th>Bundle</th>
							<th className='text-right'>Price</th>
							{items.map((item) => (
								<th key={item.id} className='text-right'>
									Cost per {item.variable}
								</th>
							))}
							<th className='text-right'>Total Items</th>
							<th className='text-right'>Cost/Item</th>
						</tr>
					</thead>
					<tbody>
						{bundles.map((bundle) => {
							const totalItems = items.reduce((sum, item) => sum + (bundle.quantities[item.id] ?? 0), 0)
							return (
								<tr key={bundle.id}>
									<td className='font-medium'>{bundle.name}</td>
									<td className='text-right font-mono'>{fmt(bundle.price)}</td>
									{items.map((item) => {
										const qty = bundle.quantities[item.id] ?? 0
										return (
											<td key={item.id} className='text-right font-mono'>
												{qty > 0 ? fmt(bundle.price / qty) : '—'}
											</td>
										)
									})}
									<td className='text-right font-mono'>{totalItems}</td>
									<td className='text-right font-mono'>{totalItems > 0 ? fmt(bundle.price / totalItems) : '—'}</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}
