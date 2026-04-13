import { useClipboard, useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import { Button, Field, Input, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import {
	LuChevronDown,
	LuChevronUp,
	LuCopy,
	LuPlus,
	LuRotateCcw,
	LuSparkles,
	LuTrash2,
	LuX,
} from 'https://esm.sh/react-icons/lu'
import { z } from 'https://esm.sh/zod'

// ─── Schema (import/export wire format) ─────────────────────────────────────

const ScenarioItemSchema = z.object({ name: z.string().min(1), symbol: z.string().min(1) })

const ScenarioBundleSchema = z.object({
	name: z.string().min(1),
	price: z.number().positive(),
	quantities: z.array(z.number().int().nonnegative()),
})

type ScenarioImport = {
	name: string
	items: { name: string; symbol: string }[]
	bundles: { name: string; price: number; quantities: number[] }[]
}

const ScenarioSchema = z
	.object({
		name: z.string().min(1),
		items: z.array(ScenarioItemSchema).min(1),
		bundles: z.array(ScenarioBundleSchema).min(1),
	})
	.refine((s: ScenarioImport) => s.bundles.every((b) => b.quantities.length === s.items.length), {
		message: 'Every bundle quantities array must have the same length as items',
	})

// ─── Types (runtime) ────────────────────────────────────────────────────────

type Item = { id: string; displayName: string; variable: string }
type Bundle = { id: string; name: string; price: number; quantities: Record<string, number> }
type Scenario = { id: string; name: string; items: Item[]; bundles: Bundle[] }
type Need = Record<string, number>

type Solution = {
	bundleCounts: Record<string, number>
	totalCost: number
	totalItems: Record<string, number>
	surplus: Record<string, number>
}

type ImpliedValue = { itemId: string; value: number }

const uid = () => crypto.randomUUID().slice(0, 8)

// ─── Hydrate / Dehydrate ────────────────────────────────────────────────────

// biome-ignore lint/correctness/noUnusedVariables: public API for scenario import
function parseScenario(json: string): ScenarioImport {
	return ScenarioSchema.parse(JSON.parse(json)) as ScenarioImport
}

function hydrate(input: ScenarioImport): Scenario {
	const items: Item[] = input.items.map((i) => ({ id: uid(), displayName: i.name, variable: i.symbol }))
	const bundles: Bundle[] = input.bundles.map((b) => ({
		id: uid(),
		name: b.name,
		price: b.price,
		quantities: Object.fromEntries(items.map((item, i) => [item.id, b.quantities[i]])),
	}))
	return { id: uid(), name: input.name, items, bundles }
}

function dehydrate(scenario: Scenario): ScenarioImport {
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

// ─── Solver: Brute-force ILP for small bundle problems ───────────────────────

function solve(bundles: Bundle[], items: Item[], needs: Need): Solution | null {
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
	const counts = new Array(bundles.length).fill(0)

	function search(depth: number) {
		if (depth === bundles.length) {
			const totals: Record<string, number> = {}
			let cost = 0
			for (let i = 0; i < bundles.length; i++) {
				cost += bundles[i].price * counts[i]
				for (const id of itemIds) totals[id] = (totals[id] ?? 0) + (bundles[i].quantities[id] ?? 0) * counts[i]
			}
			for (const id of itemIds) if ((totals[id] ?? 0) < (needs[id] ?? 0)) return
			if (best === null || cost < best.totalCost) {
				const surplus: Record<string, number> = {}
				for (const id of itemIds) surplus[id] = (totals[id] ?? 0) - (needs[id] ?? 0)
				best = {
					bundleCounts: Object.fromEntries(bundles.map((b, i) => [b.id, counts[i]])),
					totalCost: cost,
					totalItems: { ...totals },
					surplus,
				}
			}
			return
		}
		for (let c = 0; c <= maxPerBundle[depth]; c++) {
			counts[depth] = c
			if (best !== null) {
				let partialCost = 0
				for (let i = 0; i <= depth; i++) partialCost += bundles[i].price * counts[i]
				if (partialCost >= best.totalCost) {
					counts[depth] = 0
					return
				}
			}
			search(depth + 1)
		}
		counts[depth] = 0
	}

	search(0)
	return best
}

// ─── Least-squares implied value decomposition ───────────────────────────────

function deriveImpliedValues(bundles: Bundle[], items: Item[]): ImpliedValue[] {
	if (bundles.length === 0 || items.length === 0) return []

	const n = items.length
	const m = bundles.length
	const A: number[][] = bundles.map((bundle) => items.map((item) => bundle.quantities[item.id] ?? 0))
	const b = bundles.map((bundle) => bundle.price)

	const AtA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
	const Atb: number[] = new Array(n).fill(0)

	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) for (let k = 0; k < m; k++) AtA[i][j] += A[k][i] * A[k][j]
		for (let k = 0; k < m; k++) Atb[i] += A[k][i] * b[k]
	}

	const aug: number[][] = AtA.map((row, i) => [...row, Atb[i]])

	for (let col = 0; col < n; col++) {
		let maxRow = col
		for (let row = col + 1; row < n; row++) if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row
		;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
		if (Math.abs(aug[col][col]) < 1e-10) continue
		for (let row = col + 1; row < n; row++) {
			const factor = aug[row][col] / aug[col][col]
			for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j]
		}
	}

	const x = new Array(n).fill(0)
	for (let i = n - 1; i >= 0; i--) {
		if (Math.abs(aug[i][i]) < 1e-10) continue
		x[i] = aug[i][n]
		for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j]
		x[i] /= aug[i][i]
	}

	return items.map((item, i) => ({ itemId: item.id, value: x[i] }))
}

// ─── Default scenario ────────────────────────────────────────────────────────

const USB_C_SCENARIO: Scenario = {
	id: 'usb-c-magnetic',
	name: 'Magnetic USB-C Adapter',
	items: [
		{ id: 'adapter', displayName: 'Adapter', variable: '🔌' },
		{ id: 'port', displayName: 'Port/Tip', variable: '🔗' },
	],
	bundles: [
		{ id: 'b1', name: '1Pc', price: 8.99, quantities: { adapter: 1, port: 1 } },
		{ id: 'b2', name: '1Pack+2Ports', price: 9.99, quantities: { adapter: 1, port: 2 } },
		{ id: 'b3', name: '2Pack+2Ports', price: 13.99, quantities: { adapter: 2, port: 2 } },
		{ id: 'b4', name: '2Pack+4Ports', price: 19.99, quantities: { adapter: 2, port: 4 } },
	],
}

const PRESET_SCENARIOS: ScenarioImport[] = [
	{
		name: 'Philips Hue A19 Color Ambiance',
		items: [{ name: 'Bulb', symbol: '💡' }],
		bundles: [
			{ name: '1 Pack', price: 49.97, quantities: [1] },
			{ name: '2 Pack', price: 89.98, quantities: [2] },
			{ name: '3 Pack', price: 79.97, quantities: [3] },
			{ name: '4 Pack', price: 134.99, quantities: [4] },
			{ name: '6 Pack', price: 158.42, quantities: [6] },
		],
	},
	{
		name: 'CAP Barbell Neoprene Dumbbells',
		items: [
			{ name: '2lb Pair', symbol: '2️⃣' },
			{ name: '3lb Pair', symbol: '3️⃣' },
			{ name: '4lb Pair', symbol: '4️⃣' },
			{ name: '5lb Pair', symbol: '5️⃣' },
			{ name: '6lb Pair', symbol: '6️⃣' },
			{ name: '7lb Pair', symbol: '7️⃣' },
			{ name: '8lb Pair', symbol: '8️⃣' },
			{ name: '9lb Pair', symbol: '9️⃣' },
			{ name: '10lb Pair', symbol: '🔟' },
			{ name: '12lb Pair', symbol: '🅱️' },
			{ name: '15lb Pair', symbol: '🅰️' },
			{ name: '20lb Pair', symbol: '🔴' },
			{ name: 'Rack', symbol: '🗄️' },
		],
		bundles: [
			{ name: '2lb Pair', price: 6.99, quantities: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '3lb Pair', price: 8.99, quantities: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '4lb Pair', price: 8.99, quantities: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '5lb Pair', price: 10.99, quantities: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '6lb Pair', price: 11.99, quantities: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '7lb Pair', price: 10.99, quantities: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '8lb Pair', price: 15.99, quantities: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
			{ name: '9lb Pair', price: 15.99, quantities: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
			{ name: '10lb Pair', price: 17.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
			{ name: '12lb Pair', price: 21.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
			{ name: '15lb Pair', price: 27.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0] },
			{ name: '20lb Pair', price: 41.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] },
			{ name: '20lb Set', price: 35.88, quantities: [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
			{ name: '32lb Set', price: 39.99, quantities: [0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1] },
			{ name: '56lb Set', price: 83.99, quantities: [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1] },
			{ name: '60lb Set', price: 84.99, quantities: [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1] },
			{ name: '100lb Set', price: 109.99, quantities: [0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1] },
		],
	},
	{
		name: 'Lovesac Sactionals',
		items: [
			{ name: 'Seats', symbol: '🛋️' },
			{ name: 'Sides', symbol: '📐' },
		],
		bundles: [
			{ name: '2 Seats + 4 Sides', price: 2064.0, quantities: [2, 4] },
			{ name: '3 Seats + 5 Sides', price: 2853.0, quantities: [3, 5] },
			{ name: '4 Seats + 4 Sides', price: 3156.0, quantities: [4, 4] },
			{ name: '4 Seats + 5 Sides', price: 3399.0, quantities: [4, 5] },
			{ name: '4 Seats + 6 Sides', price: 3819.0, quantities: [4, 6] },
			{ name: '5 Seats + 5 Sides', price: 3945.0, quantities: [5, 5] },
			{ name: '5 Seats + 8 Sides', price: 4851.0, quantities: [5, 8] },
			{ name: '6 Seats + 5 Sides', price: 4491.0, quantities: [6, 5] },
			{ name: '6 Seats + 6 Sides', price: 4734.0, quantities: [6, 6] },
			{ name: '6 Seats + 7 Sides', price: 4977.0, quantities: [6, 7] },
			{ name: '6 Seats + 8 Sides', price: 5220.0, quantities: [6, 8] },
			{ name: '7 Seats + 8 Sides', price: 5766.0, quantities: [7, 8] },
			{ name: '8 Seats + 9 Sides', price: 6555.0, quantities: [8, 9] },
			{ name: '8 Seats + 10 Sides', price: 6798.0, quantities: [8, 10] },
			{ name: '9 Seats + 10 Sides', price: 7344.0, quantities: [9, 10] },
			{ name: '10 Seats + 12 Sides', price: 8553.0, quantities: [10, 12] },
		],
	},
]

const EMPTY_SCENARIO: Scenario = { id: crypto.randomUUID(), name: 'New Scenario', items: [], bundles: [] }
const fmt = (n: number) => `$${n.toFixed(2)}`

function buildAiPrompt(example: ScenarioImport): string {
	return `Generate a Bundle Buy scenario as JSON. Zod schema:

z.object({
  name: z.string().min(1),
  items: z.array(z.object({ name: z.string().min(1), symbol: z.string().min(1) })).min(1),
  bundles: z.array(z.object({ name: z.string().min(1), price: z.number().positive(), quantities: z.array(z.number().int().nonnegative()) })).min(1),
}).refine(s => s.bundles.every(b => b.quantities.length === s.items.length))

Symbols = single emoji. Prices in USD. Output ONLY valid JSON.

Example:
${JSON.stringify(example, null, 2)}

Generate a scenario for: [DESCRIBE YOUR PRODUCT/SITUATION HERE]`
}

// ─── Components ──────────────────────────────────────────────────────────────

function ItemEditor({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
	const addItem = () => onChange([...items, { id: uid(), displayName: '', variable: '' }])
	const removeItem = (id: string) => onChange(items.filter((i) => i.id !== id))
	const updateItem = (id: string, patch: Partial<Item>) =>
		onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>Item Types</h3>
				<Button className='btn-ghost btn-xs gap-1' onClick={addItem}>
					<LuPlus size={14} /> Add Item
				</Button>
			</div>
			{items.map((item) => (
				<div key={item.id} className='flex gap-2 items-end'>
					<Field label='Name' className='flex-1'>
						<Input
							value={item.displayName}
							onChange={(e) => updateItem(item.id, { displayName: e.target.value })}
							placeholder='e.g. Adapter'
						/>
					</Field>
					<Field label='Variable' className='w-20'>
						<Input
							value={item.variable}
							onChange={(e) => updateItem(item.id, { variable: e.target.value })}
							placeholder='🔌 or x₁'
						/>
					</Field>
					<Button className='btn-ghost btn-sm btn-square' onClick={() => removeItem(item.id)}>
						<LuTrash2 size={14} />
					</Button>
				</div>
			))}
			{items.length === 0 && <p className='text-sm opacity-40 text-center py-2'>No items defined yet</p>}
		</div>
	)
}

function BundleEditor({
	bundles,
	items,
	onChange,
}: {
	bundles: Bundle[]
	items: Item[]
	onChange: (bundles: Bundle[]) => void
}) {
	const addBundle = () =>
		onChange([
			...bundles,
			{ id: uid(), name: '', price: 0, quantities: Object.fromEntries(items.map((i) => [i.id, 0])) },
		])
	const removeBundle = (id: string) => onChange(bundles.filter((b) => b.id !== id))
	const updateBundle = (id: string, patch: Partial<Bundle>) =>
		onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)))

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>Bundle Options</h3>
				<Button className='btn-ghost btn-xs gap-1' onClick={addBundle}>
					<LuPlus size={14} /> Add Bundle
				</Button>
			</div>
			{bundles.length > 0 && items.length > 0 && (
				<div className='overflow-x-auto'>
					<table className='table table-sm w-full'>
						<thead>
							<tr>
								<th>Bundle Name</th>
								<th className='w-24'>Price</th>
								{items.map((item) => (
									<th key={item.id} className='w-16 text-center'>
										{item.variable || item.displayName}
									</th>
								))}
								<th className='w-10' />
							</tr>
						</thead>
						<tbody>
							{bundles.map((bundle) => (
								<tr key={bundle.id}>
									<td>
										<Input
											className='input-sm'
											value={bundle.name}
											onChange={(e) => updateBundle(bundle.id, { name: e.target.value })}
											placeholder='e.g. 2Pack+4Ports'
										/>
									</td>
									<td>
										<Input
											className='input-sm'
											type='number'
											step='0.01'
											min='0'
											value={bundle.price || ''}
											onChange={(e) => updateBundle(bundle.id, { price: Number.parseFloat(e.target.value) || 0 })}
											placeholder='$0.00'
										/>
									</td>
									{items.map((item) => (
										<td key={item.id}>
											<Input
												className='input-sm text-center'
												type='number'
												min='0'
												value={bundle.quantities[item.id] ?? 0}
												onChange={(e) =>
													updateBundle(bundle.id, {
														quantities: {
															...bundle.quantities,
															[item.id]: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
														},
													})
												}
											/>
										</td>
									))}
									<td>
										<Button className='btn-ghost btn-xs btn-square' onClick={() => removeBundle(bundle.id)}>
											<LuTrash2 size={14} />
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{items.length === 0 && <p className='text-sm opacity-40 text-center py-2'>Define items first</p>}
			{bundles.length === 0 && items.length > 0 && (
				<p className='text-sm opacity-40 text-center py-2'>No bundles defined yet</p>
			)}
		</div>
	)
}

function NeedsInput({ items, needs, onChange }: { items: Item[]; needs: Need; onChange: (needs: Need) => void }) {
	return (
		<div className='space-y-3'>
			<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>How many do you need?</h3>
			<div className='flex flex-wrap gap-3'>
				{items.map((item) => (
					<Field key={item.id} label={`${item.variable || ''} ${item.displayName}`} className='w-32'>
						<Input
							type='number'
							min='0'
							value={needs[item.id] ?? 0}
							onChange={(e) => onChange({ ...needs, [item.id]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })}
						/>
					</Field>
				))}
			</div>
		</div>
	)
}

function ValueDecomposition({
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
	const bestDealIdx = bundleErrors.reduce((best, curr, i) => (curr.error < bundleErrors[best].error ? i : best), 0)
	const bestDeal = bundleErrors[bestDealIdx]
	const hasMeaningfulBestDeal = bestDeal.error < -0.01

	return (
		<div className='space-y-4'>
			<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>
				Implied Per-Item Values (Least Squares)
			</h3>
			<p className='text-sm opacity-60'>
				Using least-squares regression on the bundle prices to derive what each item is implicitly worth:
			</p>
			<div className='flex flex-wrap gap-3'>
				{items.map((item) => {
					const val = valueMap[item.id] ?? 0
					return (
						<div key={item.id} className='surface p-4 text-center min-w-32'>
							<div className='text-2xl mb-1'>{item.variable}</div>
							<div className='text-xl font-mono font-bold'>{fmt(val)}</div>
							<div className='text-xs opacity-60'>{item.displayName}</div>
						</div>
					)
				})}
			</div>
			{hasMeaningfulBestDeal && (
				<div className='bg-success/10 border border-success/30 rounded-lg p-4 flex items-center gap-3'>
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
				<table className='table table-sm w-full'>
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
						{bundleErrors.map(({ bundle, predicted, error }, i) => {
							const isBest = hasMeaningfulBestDeal && i === bestDealIdx
							const parts = items
								.filter((item) => (bundle.quantities[item.id] ?? 0) > 0)
								.map((item) => `${bundle.quantities[item.id]}${item.variable}`)
								.join(' + ')
							return (
								<tr key={bundle.id} className={isBest ? 'bg-success/10' : ''}>
									<td className='font-medium'>
										{bundle.name}
										{isBest && <span className='ml-2 text-success text-xs font-bold'>BEST DEAL</span>}
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

function SolutionDisplay({
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
	if (!Object.values(needs).some((n) => n > 0)) return null

	return (
		<div className='space-y-4'>
			<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>Optimal Purchase</h3>
			<div className='surface p-6 space-y-4'>
				<div className='text-center'>
					<div className='text-4xl font-mono font-bold'>{fmt(solution.totalCost)}</div>
					<div className='text-sm opacity-60 mt-1'>total cost</div>
				</div>
				<div className='divider' />
				<div className='space-y-2'>
					<p className='text-sm font-medium'>Buy:</p>
					{purchasedBundles.map(([bundleId, count]) => {
						const bundle = bundleMap[bundleId]
						if (!bundle) return null
						return (
							<div key={bundleId} className='flex justify-between items-center'>
								<span>
									{count}× <span className='font-medium'>{bundle.name}</span>
									<span className='opacity-50 ml-2'>@ {fmt(bundle.price)} ea</span>
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
										<span className='opacity-50 ml-1'>
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

function AllCombinationsTable({
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
	const counts = new Array(bundles.length).fill(0)

	function enumerate(depth: number) {
		if (combos.length > 200) return
		if (depth === bundles.length) {
			const totals: Record<string, number> = {}
			let cost = 0
			for (let i = 0; i < bundles.length; i++) {
				cost += bundles[i].price * counts[i]
				for (const id of itemIds) totals[id] = (totals[id] ?? 0) + (bundles[i].quantities[id] ?? 0) * counts[i]
			}
			for (const id of itemIds) if ((totals[id] ?? 0) < (needs[id] ?? 0)) return
			combos.push({ counts: [...counts], cost, totals })
			return
		}
		for (let c = 0; c <= maxPerBundle[depth]; c++) {
			counts[depth] = c
			enumerate(depth + 1)
		}
		counts[depth] = 0
	}

	enumerate(0)
	combos.sort((a, b) => a.cost - b.cost)
	if (combos.length === 0) return null

	return (
		<div className='space-y-3'>
			<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>
				All Feasible Combinations ({combos.length})
			</h3>
			<div className='overflow-x-auto max-h-80'>
				<table className='table table-xs w-full'>
					<thead className='sticky top-0 bg-base-100'>
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
						{combos.map((combo, idx) => {
							const isOptimal =
								solution && bundles.every((b, j) => (solution.bundleCounts[b.id] ?? 0) === combo.counts[j])
							return (
								<tr key={combo.counts.join('-')} className={isOptimal ? 'bg-success/15 font-bold' : ''}>
									<td className='text-right opacity-50'>#{idx + 1}</td>
									{bundles.map((b, j) => (
										<td key={b.id} className='text-center font-mono'>
											{combo.counts[j] || <span className='opacity-20'>0</span>}
										</td>
									))}
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

function PerUnitBreakdown({ bundles, items }: { bundles: Bundle[]; items: Item[] }) {
	if (bundles.length === 0 || items.length === 0) return null

	return (
		<div className='space-y-3'>
			<h3 className='font-semibold text-sm opacity-70 uppercase tracking-wide'>Per-Unit Cost by Bundle</h3>
			<div className='overflow-x-auto'>
				<table className='table table-sm w-full'>
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

function LearnSection({ items, bundles }: { items: Item[]; bundles: Bundle[] }) {
	const [open, setOpen] = useState(false)

	return (
		<div className='space-y-3'>
			<button
				type='button'
				className='flex items-center gap-2 font-semibold text-sm opacity-70 uppercase tracking-wide cursor-pointer hover:opacity-100 transition-opacity'
				onClick={() => setOpen(!open)}
			>
				{open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
				How It Works
			</button>
			{open && (
				<div className='surface p-6 space-y-6 text-sm leading-relaxed'>
					<div>
						<h4 className='font-bold text-base mb-2'>The Problem</h4>
						<p>
							You want to buy some items that come in bundles. Each bundle has a price and contains different quantities
							of each item type. How do you spend the least money while getting everything you need?
						</p>
					</div>
					<div>
						<h4 className='font-bold text-base mb-2'>Step 1: Model It as Math</h4>
						<p className='mb-2'>
							This is an <strong>Integer Linear Program (ILP)</strong>:
						</p>
						{bundles.length > 0 && items.length > 0 && (
							<div className='bg-base-200 p-4 rounded font-mono text-xs space-y-2'>
								<p className='opacity-60'>
									Decision variables: how many of each bundle to buy
									<br />
									{bundles.map((b) => `${b.name} = ?`).join(', ')}
								</p>
								<p className='font-bold'>Minimize: {bundles.map((b) => `${fmt(b.price)}·${b.name}`).join(' + ')}</p>
								<p className='opacity-60'>Subject to:</p>
								{items.map((item) => (
									<p key={item.id}>
										{bundles
											.map((b) => {
												const q = b.quantities[item.id] ?? 0
												return q > 0 ? `${q}·${b.name}` : null
											})
											.filter(Boolean)
											.join(' + ')}{' '}
										≥ [needed {item.displayName}]
									</p>
								))}
								<p>Each variable ≥ 0 and integer</p>
							</div>
						)}
					</div>
					<div>
						<h4 className='font-bold text-base mb-2'>Step 2: Derive Implied Values</h4>
						<p className='mb-2'>
							We can also ask: what is each item <em>worth</em> based on how bundles are priced? This uses{' '}
							<strong>least-squares regression</strong>.
						</p>
						{items.length > 0 && (
							<div className='bg-base-200 p-4 rounded font-mono text-xs space-y-2'>
								<p className='opacity-60'>
									If {items.map((i) => `${i.variable} = price of one ${i.displayName}`).join(', ')}:
								</p>
								{bundles.map((b) => (
									<p key={b.id}>
										{items
											.filter((i) => (b.quantities[i.id] ?? 0) > 0)
											.map((i) => `${b.quantities[i.id]}${i.variable}`)
											.join(' + ')}{' '}
										≈ {fmt(b.price)}
									</p>
								))}
								<p className='mt-2 opacity-60'>
									Solve for {items.map((i) => i.variable).join(', ')} using least squares (minimize total squared error)
								</p>
							</div>
						)}
					</div>
					<div>
						<h4 className='font-bold text-base mb-2'>Step 3: Compare All Options</h4>
						<p>
							For small problems (typical shopping scenarios), we enumerate every feasible combination and rank by cost.
							For larger problems, specialized ILP solvers use branch-and-bound algorithms. This tool handles both — it
							searches exhaustively up to reasonable limits.
						</p>
					</div>
					<div>
						<h4 className='font-bold text-base mb-2'>When to Use This</h4>
						<ul className='list-disc list-inside space-y-1'>
							<li>Batteries sold in 4-packs, 8-packs, 24-packs at different unit prices</li>
							<li>USB cables in single vs multi-packs</li>
							<li>Drill bit sets with overlapping sizes</li>
							<li>Any product with bundle/variety pack pricing</li>
						</ul>
					</div>
				</div>
			)}
		</div>
	)
}

function AiPromptButton({ scenario }: { scenario: Scenario }) {
	const clipboard = useClipboard({ timeout: 2000 })
	const prompt = buildAiPrompt(dehydrate(scenario))

	return (
		<Button
			className={`btn-sm gap-1 ${clipboard.copied ? 'btn-success' : 'btn-ghost'}`}
			onClick={() => clipboard.copy(prompt)}
			title='Copy AI prompt to clipboard'
		>
			<LuSparkles size={14} /> {clipboard.copied ? 'Copied!' : 'AI Prompt'}
		</Button>
	)
}

function ScenarioManager({
	scenarios,
	activeId,
	activeScenario,
	onSelect,
	onDelete,
	onNew,
	onDuplicate,
	onRestoreDefaults,
}: {
	scenarios: Scenario[]
	activeId: string
	activeScenario: Scenario
	onSelect: (id: string) => void
	onDelete: (id: string) => void
	onNew: () => void
	onDuplicate: () => void
	onRestoreDefaults: () => void
}) {
	return (
		<div className='flex flex-wrap gap-2 items-center'>
			{scenarios.map((s) => (
				<div key={s.id} className='flex items-center gap-1'>
					<Button className={`btn-sm ${s.id === activeId ? 'btn-active' : 'btn-ghost'}`} onClick={() => onSelect(s.id)}>
						{s.name}
					</Button>
					{scenarios.length > 1 && s.id === activeId && (
						<Button className='btn-ghost btn-xs btn-square' onClick={() => onDelete(s.id)} title='Delete scenario'>
							<LuX size={12} />
						</Button>
					)}
				</div>
			))}
			<Button className='btn-ghost btn-sm gap-1' onClick={onNew}>
				<LuPlus size={14} /> New
			</Button>
			<Button className='btn-ghost btn-sm gap-1' onClick={onDuplicate}>
				<LuCopy size={14} /> Duplicate
			</Button>
			<Button className='btn-ghost btn-sm gap-1' onClick={onRestoreDefaults}>
				<LuRotateCcw size={14} /> Restore Defaults
			</Button>
			<AiPromptButton scenario={activeScenario} />
		</div>
	)
}

function Root() {
	const [scenarios, setScenarios] = useLocalStorage<Scenario[]>({
		key: 'bundle-buy-scenarios',
		defaultValue: [USB_C_SCENARIO, ...PRESET_SCENARIOS.map(hydrate)],
	})
	const [activeId, setActiveId] = useLocalStorage<string>({
		key: 'bundle-buy-active',
		defaultValue: USB_C_SCENARIO.id,
	})
	const [needs, setNeeds] = useState<Need>({})
	const [configOpen, setConfigOpen] = useState(false)
	const needsInitialized = useRef(false)

	const scenario = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
	if (!scenario) return null

	if (!needsInitialized.current || !Object.keys(needs).some((k) => scenario.items.some((i) => i.id === k))) {
		const defaultNeeds: Need = {}
		for (const item of scenario.items) defaultNeeds[item.id] = needs[item.id] ?? 0
		if (JSON.stringify(defaultNeeds) !== JSON.stringify(needs)) setTimeout(() => setNeeds(defaultNeeds), 0)
		needsInitialized.current = true
	}

	const updateScenario = (patch: Partial<Scenario>) =>
		setScenarios((prev) => prev.map((s) => (s.id === scenario.id ? { ...s, ...patch } : s)))

	const hasNeeds = Object.values(needs).some((n) => n > 0)
	const solution = hasNeeds ? solve(scenario.bundles, scenario.items, needs) : null
	const impliedValues = deriveImpliedValues(scenario.bundles, scenario.items)

	return (
		<ThemeProvider>
			<main className='min-h-screen full-bleed-container p-4 sm:p-8'>
				<div className='max-w-4xl mx-auto space-y-8'>
					<div className='flex items-start justify-between gap-4 flex-wrap'>
						<div>
							<h1 className='text-3xl font-bold'>Bundle Buy</h1>
							<p className='text-sm opacity-60 mt-1'>Find the cheapest way to buy what you need from bundle options</p>
						</div>
						<ThemePicker variant='modal' />
					</div>

					<ScenarioManager
						scenarios={scenarios}
						activeId={scenario.id}
						activeScenario={scenario}
						onSelect={(id) => {
							setActiveId(id)
							needsInitialized.current = false
						}}
						onDelete={(id) => {
							const remaining = scenarios.filter((s) => s.id !== id)
							setScenarios(remaining)
							if (activeId === id) {
								setActiveId(remaining[0].id)
								needsInitialized.current = false
							}
						}}
						onNew={() => {
							const s = { ...EMPTY_SCENARIO, id: uid() }
							setScenarios((prev) => [...prev, s])
							setActiveId(s.id)
							needsInitialized.current = false
							setConfigOpen(true)
						}}
						onDuplicate={() => {
							const s = { ...scenario, id: uid(), name: `${scenario.name} (copy)` }
							setScenarios((prev) => [...prev, s])
							setActiveId(s.id)
							needsInitialized.current = false
						}}
						onRestoreDefaults={() => {
							const defaults = [USB_C_SCENARIO, ...PRESET_SCENARIOS.map(hydrate)]
							setScenarios(defaults)
							setActiveId(defaults[0].id)
							needsInitialized.current = false
						}}
					/>

					<Field label='Scenario Name'>
						<Input
							value={scenario.name}
							onChange={(e) => updateScenario({ name: e.target.value })}
							className='text-lg font-semibold'
						/>
					</Field>

					<div>
						<Button
							className={`btn-sm gap-1 ${configOpen ? 'btn-active' : 'btn-ghost'}`}
							onClick={() => setConfigOpen(!configOpen)}
						>
							{configOpen ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
							Configure Items & Bundles
						</Button>
					</div>

					{configOpen && (
						<div className='surface p-6 space-y-6'>
							<ItemEditor items={scenario.items} onChange={(items) => updateScenario({ items })} />
							<div className='divider' />
							<BundleEditor
								bundles={scenario.bundles}
								items={scenario.items}
								onChange={(bundles) => updateScenario({ bundles })}
							/>
						</div>
					)}

					{scenario.items.length > 0 && (
						<div className='space-y-8 surface p-6'>
							<NeedsInput items={scenario.items} needs={needs} onChange={setNeeds} />
							<SolutionDisplay solution={solution} bundles={scenario.bundles} items={scenario.items} needs={needs} />
							<AllCombinationsTable
								bundles={scenario.bundles}
								items={scenario.items}
								needs={needs}
								solution={solution}
							/>
						</div>
					)}

					<PerUnitBreakdown bundles={scenario.bundles} items={scenario.items} />
					<ValueDecomposition bundles={scenario.bundles} items={scenario.items} impliedValues={impliedValues} />
					<LearnSection items={scenario.items} bundles={scenario.bundles} />
				</div>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
