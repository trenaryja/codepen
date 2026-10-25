import React, { useState } from 'https://esm.sh/react'
import { LuChevronDown, LuChevronUp } from 'https://esm.sh/react-icons/lu'
import { fmt } from './scenarios'
import type { Bundle, Item } from './types'

export function LearnSection({ items, bundles }: { items: Item[]; bundles: Bundle[] }) {
	const [open, setOpen] = useState(false)

	return (
		<div className='space-y-3'>
			<button
				type='button'
				className='flex cursor-pointer items-center gap-2 text-sm font-semibold tracking-wide uppercase opacity-70 transition-opacity hover:opacity-100'
				onClick={() => setOpen(!open)}
			>
				{open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
				How It Works
			</button>
			{open && (
				<div className='surface space-y-6 p-6 text-sm leading-relaxed'>
					<div>
						<h4 className='mb-2 text-base font-bold'>The Problem</h4>
						<p>
							You want to buy some items that come in bundles. Each bundle has a price and contains different quantities
							of each item type. How do you spend the least money while getting everything you need?
						</p>
					</div>
					<div>
						<h4 className='mb-2 text-base font-bold'>Step 1: Model It as Math</h4>
						<p className='mb-2'>
							This is an <strong>Integer Linear Program (ILP)</strong>:
						</p>
						{bundles.length > 0 && items.length > 0 && (
							<div className='bg-base-200 space-y-2 rounded p-4 font-mono text-xs'>
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
						<h4 className='mb-2 text-base font-bold'>Step 2: Derive Implied Values</h4>
						<p className='mb-2'>
							We can also ask: what is each item <em>worth</em> based on how bundles are priced? This uses{' '}
							<strong>least-squares regression</strong>.
						</p>
						{items.length > 0 && (
							<div className='bg-base-200 space-y-2 rounded p-4 font-mono text-xs'>
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
						<h4 className='mb-2 text-base font-bold'>Step 3: Compare All Options</h4>
						<p>
							For small problems (typical shopping scenarios), we enumerate every feasible combination and rank by cost.
							For larger problems, specialized ILP solvers use branch-and-bound algorithms. This tool handles both — it
							searches exhaustively up to reasonable limits.
						</p>
					</div>
					<div>
						<h4 className='mb-2 text-base font-bold'>When to Use This</h4>
						<ul className='list-inside list-disc space-y-1'>
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
