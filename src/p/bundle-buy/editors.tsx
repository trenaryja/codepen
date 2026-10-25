import { Button, Field, Input } from 'https://esm.sh/@trenaryja/ui'
import React from 'https://esm.sh/react'
import { LuPlus, LuTrash2 } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import type { Bundle, Item, Need } from './types'

export function ItemEditor({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
	const addItem = () => onChange([...items, { id: R.randomString(21), displayName: '', variable: '' }])
	const removeItem = (id: string) => onChange(items.filter((i) => i.id !== id))
	const updateItem = (id: string, patch: Partial<Item>) =>
		onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>Item Types</h3>
				<Button className='btn-ghost btn-xs gap-1' onClick={addItem}>
					<LuPlus size={14} /> Add Item
				</Button>
			</div>
			{items.map((item) => (
				<div key={item.id} className='flex items-end gap-2'>
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
			{items.length === 0 && <p className='py-2 text-center text-sm opacity-40'>No items defined yet</p>}
		</div>
	)
}

export function BundleEditor({
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
			{ id: R.randomString(21), name: '', price: 0, quantities: Object.fromEntries(items.map((i) => [i.id, 0])) },
		])
	const removeBundle = (id: string) => onChange(bundles.filter((b) => b.id !== id))
	const updateBundle = (id: string, patch: Partial<Bundle>) =>
		onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)))

	return (
		<div className='space-y-3'>
			<div className='flex items-center justify-between'>
				<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>Bundle Options</h3>
				<Button className='btn-ghost btn-xs gap-1' onClick={addBundle}>
					<LuPlus size={14} /> Add Bundle
				</Button>
			</div>
			{bundles.length > 0 && items.length > 0 && (
				<div className='overflow-x-auto'>
					<table className='table-sm table w-full'>
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
			{items.length === 0 && <p className='py-2 text-center text-sm opacity-40'>Define items first</p>}
			{bundles.length === 0 && items.length > 0 && (
				<p className='py-2 text-center text-sm opacity-40'>No bundles defined yet</p>
			)}
		</div>
	)
}

export function NeedsInput({
	items,
	needs,
	onChange,
}: {
	items: Item[]
	needs: Need
	onChange: (needs: Need) => void
}) {
	return (
		<div className='space-y-3'>
			<h3 className='text-sm font-semibold tracking-wide uppercase opacity-70'>How many do you need?</h3>
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
