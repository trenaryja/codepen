import {
	autoUpdate,
	FloatingPortal,
	flip,
	offset,
	shift,
	useFloating,
	useHover,
	useInteractions,
} from 'https://esm.sh/@floating-ui/react'
import { useVirtualizer } from 'https://esm.sh/@tanstack/react-virtual'
import { Field, Range, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'

// TODO: replace with `import { colorMix, interpolateColors } from '@trenaryja/ui/utils'`
const colorMix = (from: string, to: string, ratio: number) =>
	`color-mix(in oklab, ${from} ${R.clamp(ratio, { min: 0, max: 100 })}%, ${to})`
const interpolateColors = (t: number, stops: string[]) => {
	if (stops.length === 1) return stops[0]
	const lastIdx = stops.length - 1
	const segment = Math.min(Math.floor(R.clamp(t, { min: 0, max: 1 }) * lastIdx), lastIdx - 1)
	return colorMix(
		stops[segment],
		stops[segment + 1],
		Math.round((1 - (R.clamp(t, { min: 0, max: 1 }) * lastIdx - segment)) * 100),
	)
}

type Bin = { x: number; y: number; w: number; h: number; key: string }
type Recipe = { key: string; counts: Record<string, number>; unique: number; layout: Bin[]; tags: TagId[] }
type SolveOpts = { W: number; H: number }

type TagId = 'max-unique' | 'monochrome' | 'no-1x1' | 'no-repeat' | 'squares-only'
type TagContext = { maxUnique: number }
type Constraint = { size: string; op: '=' | '>=' | 'exclude'; n: number }
export type Filters = { tags: Set<TagId>; constraints: Constraint[] }

const TAG_IDS: TagId[] = ['max-unique', 'monochrome', 'no-1x1', 'no-repeat', 'squares-only']

const TAGS: Record<TagId, { label: string; description: string }> = {
	'max-unique': {
		label: 'max unique',
		description: 'Uses the largest number of distinct piece sizes possible for this plate.',
	},
	monochrome: {
		label: 'mono',
		description: 'Uses only a single piece size.',
	},
	'no-1x1': {
		label: 'no 1×1',
		description: 'Contains no 1×1 pieces.',
	},
	'no-repeat': {
		label: 'no repeat',
		description: 'Every piece in the recipe is a different size — no size appears twice.',
	},
	'squares-only': {
		label: 'squares only',
		description: 'Every piece is a square (width = height).',
	},
}

const isSquareKey = (size: string) => {
	const [w, h] = size.split('×').map(Number)
	return w === h
}

export const computeTags = (recipe: Recipe, ctx: TagContext): TagId[] => {
	const tags: TagId[] = []
	if (recipe.unique === ctx.maxUnique) tags.push('max-unique')
	if (recipe.unique === 1) tags.push('monochrome')
	if (!('1×1' in recipe.counts)) tags.push('no-1x1')
	if (R.values(recipe.counts).every((c) => c === 1)) tags.push('no-repeat')
	if (R.keys(recipe.counts).every(isSquareKey)) tags.push('squares-only')
	return tags
}

const computeTagContext = (recipes: Recipe[]): TagContext => {
	let maxUnique = 0
	for (const recipe of recipes) if (recipe.unique > maxUnique) maxUnique = recipe.unique
	return { maxUnique }
}

export const matchesFilter = (recipe: Recipe, filters: Filters): boolean => {
	for (const tag of filters.tags) if (!recipe.tags.includes(tag)) return false
	return true
}

const STOPS = [
	'var(--color-primary)',
	'var(--color-secondary)',
	'var(--color-accent)',
	'var(--color-info)',
	'var(--color-success)',
	'var(--color-warning)',
	'var(--color-error)',
]

// Size-key order: group by smaller dimension (1×_, 2×_, 3×_, …), then by larger dimension.
const byFamily = (a: string, b: string) => {
	const [widthA, heightA] = a.split('×').map(Number)
	const [widthB, heightB] = b.split('×').map(Number)
	const [minA, maxA] = widthA <= heightA ? [widthA, heightA] : [heightA, widthA]
	const [minB, maxB] = widthB <= heightB ? [widthB, heightB] : [heightB, widthB]
	return minA - minB || maxA - maxB
}

// Direct recipe enumeration: generate multisets of pieces (integer compositions of the grid
// area with a target number of distinct parts), verify packability via a bitmask-grid DFS
// that bails at the first valid packing. Sidesteps the combinatorial explosion of layouts
// per recipe (6×5 had ~200M layout-search nodes → 12K packability nodes).
const keyOf = (w: number, h: number) => (w <= h ? `${w}×${h}` : `${h}×${w}`)

export const solve = ({ W, H }: SolveOpts) => {
	const AREA = W * H
	const FULL = (1 << W) - 1

	const seen = new Set<string>()
	const sizeKeys: string[] = []
	for (let w = 1; w <= W; w++)
		for (let h = 1; h <= H; h++) {
			const size = keyOf(w, h)
			if (seen.has(size)) continue
			seen.add(size)
			sizeKeys.push(size)
		}
	sizeKeys.sort((a, b) => {
		const [widthA, heightA] = a.split('×').map(Number)
		const [widthB, heightB] = b.split('×').map(Number)
		return widthB * heightB - widthA * heightA
	})
	const K = sizeKeys.length
	const keyArea = new Int32Array(K)
	const keyDimensions: number[][][] = []
	for (let keyIdx = 0; keyIdx < K; keyIdx++) {
		const [w, h] = sizeKeys[keyIdx].split('×').map(Number)
		keyArea[keyIdx] = w * h
		const dimensions =
			w === h
				? [[w, h]]
				: [
						[w, h],
						[h, w],
					]
		keyDimensions.push(dimensions.filter(([width, height]) => width <= W && height <= H))
	}

	const tryPack = (targetCounts: Int8Array) => {
		const rows = new Int32Array(H)
		const counts = Int8Array.from(targetCounts)
		const layout: Bin[] = []

		const firstEmpty = () => {
			for (let y = 0; y < H; y++) {
				const emptyMask = ~rows[y] & FULL
				if (emptyMask) return [31 - Math.clz32(emptyMask & -emptyMask), y]
			}
			return null
		}
		const recurse = (): boolean => {
			const cell = firstEmpty()
			if (!cell) {
				for (let keyIdx = 0; keyIdx < K; keyIdx++) if (counts[keyIdx] !== 0) return false
				return true
			}
			const [x, y] = cell
			for (let keyIdx = 0; keyIdx < K; keyIdx++) {
				if (counts[keyIdx] <= 0) continue
				const dimensions = keyDimensions[keyIdx]
				for (let i = 0; i < dimensions.length; i++) {
					const [w, h] = dimensions[i]
					if (x + w > W || y + h > H) continue
					const mask = ((1 << w) - 1) << x
					let fits = true
					for (let dy = 0; dy < h; dy++)
						if (rows[y + dy] & mask) {
							fits = false
							break
						}
					if (!fits) continue
					for (let dy = 0; dy < h; dy++) rows[y + dy] |= mask
					counts[keyIdx]--
					layout.push({ x, y, w, h, key: sizeKeys[keyIdx] })
					if (recurse()) return true
					layout.pop()
					counts[keyIdx]++
					for (let dy = 0; dy < h; dy++) rows[y + dy] &= ~mask
				}
			}
			return false
		}
		return recurse() ? layout.slice() : null
	}

	function* enumerateMultisets(uniqueTarget: number): Generator<Int8Array> {
		const counts = new Int8Array(K)
		function* emit(keyIdx: number, remArea: number, remUnique: number): Generator<Int8Array> {
			if (remUnique === 0) {
				if (remArea === 0) yield Int8Array.from(counts)
				return
			}
			if (keyIdx >= K) return
			if (K - keyIdx < remUnique) return
			yield* emit(keyIdx + 1, remArea, remUnique)
			const area = keyArea[keyIdx]
			const maxCount = Math.floor(remArea / area)
			for (let count = 1; count <= maxCount; count++) {
				counts[keyIdx] = count
				yield* emit(keyIdx + 1, remArea - count * area, remUnique - 1)
			}
			counts[keyIdx] = 0
		}
		yield* emit(0, AREA, uniqueTarget)
	}

	const recipeKeyOf = (counts: Int8Array) => {
		const parts: string[] = []
		for (let keyIdx = 0; keyIdx < K; keyIdx++)
			if (counts[keyIdx] > 0) parts.push(`${sizeKeys[keyIdx]}:${counts[keyIdx]}`)
		parts.sort()
		return parts.join('|')
	}

	const found: Recipe[] = []
	for (let uniqueCount = 1; uniqueCount <= K; uniqueCount++) {
		for (const counts of enumerateMultisets(uniqueCount)) {
			const layout = tryPack(counts)
			if (!layout) continue
			const countsObj: Record<string, number> = {}
			for (let keyIdx = 0; keyIdx < K; keyIdx++) if (counts[keyIdx] > 0) countsObj[sizeKeys[keyIdx]] = counts[keyIdx]
			found.push({ key: recipeKeyOf(counts), counts: countsObj, unique: uniqueCount, layout, tags: [] })
		}
	}
	const ctx = computeTagContext(found)
	for (const recipe of found) recipe.tags = computeTags(recipe, ctx)
	return found
}

// Recipe order: fewest unique sizes first; within ties, lex on the family-ordered (size, count)
// sequence — smallest piece type leads, then count of that piece, then next piece, …
const sortRecipes = (recipes: Recipe[]) => {
	const allKeys = R.pipe(
		recipes,
		R.flatMap((x) => R.keys(x.counts)),
		R.unique(),
		R.sort(byFamily),
	)
	const familyIdx = R.fromEntries(allKeys.map((k, i) => [k, i] as const))
	const seq = (r: Recipe) => R.sortBy(R.entries(r.counts), ([s]) => familyIdx[s])
	return R.sort(recipes, (a, b) => {
		if (a.unique !== b.unique) return a.unique - b.unique
		const sa = seq(a),
			sb = seq(b)
		for (let i = 0; i < sa.length && i < sb.length; i++) {
			const di = familyIdx[sa[i][0]] - familyIdx[sb[i][0]]
			if (di) return di
			if (sa[i][1] !== sb[i][1]) return sa[i][1] - sb[i][1]
		}
		return sa.length - sb.length
	})
}

const TagChip = ({
	id,
	active,
	onToggle,
	count,
}: {
	id: TagId
	active?: boolean
	onToggle?: () => void
	count?: number
}) => {
	const [open, setOpen] = useState(false)
	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		placement: 'top',
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	})
	const hover = useHover(context, { delay: { open: 120, close: 0 } })
	const { getReferenceProps, getFloatingProps } = useInteractions([hover])
	const { label, description } = TAGS[id]
	const disabled = !!onToggle && !active && count === 0
	const cursor = disabled ? 'cursor-not-allowed' : onToggle ? 'cursor-pointer' : 'cursor-help'
	const className = `relative badge badge-sm ${active ? 'badge-primary' : 'badge-ghost'} ${cursor} ${disabled ? 'opacity-40' : ''}`
	const inner = (
		<>
			{label}
			{count !== undefined && count > 0 && (
				<span className='absolute -top-2 -right-2 badge badge-xs border border-current/10 px-1 tabular-nums'>
					{count}
				</span>
			)}
		</>
	)
	return (
		<>
			{onToggle ? (
				<button
					ref={refs.setReference}
					type='button'
					aria-disabled={disabled}
					{...getReferenceProps({ onClick: disabled ? undefined : onToggle })}
					className={className}
				>
					{inner}
				</button>
			) : (
				<span ref={refs.setReference} {...getReferenceProps()} className={className}>
					{inner}
				</span>
			)}
			{open && (
				<FloatingPortal>
					<div
						ref={refs.setFloating}
						style={floatingStyles}
						{...getFloatingProps()}
						className='bg-base-300 text-base-content text-xs rounded-md p-2 max-w-xs shadow-lg z-50 pointer-events-none'
					>
						{description}
					</div>
				</FloatingPortal>
			)}
		</>
	)
}

const Plate = ({ W, H, bins }: { W: number; H: number; bins: Bin[] }) => {
	const pad = 20,
		viewBoxWidth = 600,
		viewBoxHeight = 500
	const cell = Math.min((viewBoxWidth - 2 * pad) / W, (viewBoxHeight - 2 * pad) / H)
	const gridW = cell * W,
		gridH = cell * H
	const originX = (viewBoxWidth - gridW) / 2,
		originY = (viewBoxHeight - gridH) / 2
	const keys = R.sort(R.unique(bins.map((x) => x.key)), byFamily)
	const baseOf = (size: string) =>
		interpolateColors(keys.length > 1 ? keys.indexOf(size) / (keys.length - 1) : 0, STOPS)

	return (
		<svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className='w-full max-w-140 h-auto'>
			<title>Plate layout</title>
			<rect
				x={originX - 6}
				y={originY - 6}
				width={gridW + 12}
				height={gridH + 12}
				rx={10}
				className='fill-base-100 stroke-base-300'
				strokeWidth={0.5}
			/>
			{[...Array(W + 1).keys()].map((i) => (
				<line
					key={`v${i}`}
					x1={originX + i * cell}
					y1={originY}
					x2={originX + i * cell}
					y2={originY + gridH}
					className='stroke-base-300'
					strokeWidth={0.5}
				/>
			))}
			{[...Array(H + 1).keys()].map((j) => (
				<line
					key={`h${j}`}
					x1={originX}
					y1={originY + j * cell}
					x2={originX + gridW}
					y2={originY + j * cell}
					className='stroke-base-300'
					strokeWidth={0.5}
				/>
			))}
			{bins.map((bin) => {
				const base = baseOf(bin.key)
				const x = originX + bin.x * cell + 3
				const y = originY + bin.y * cell + 3
				const w = bin.w * cell - 6,
					h = bin.h * cell - 6
				const fontSize = Math.min(cell * 0.32, 22)
				return (
					<g key={`${bin.x}-${bin.y}`}>
						<rect
							x={x}
							y={y}
							width={w}
							height={h}
							rx={6}
							fill={colorMix(base, 'var(--color-base-100)', 18)}
							stroke={base}
							strokeWidth={1.5}
						/>
						<text
							x={x + w / 2}
							y={y + h / 2}
							textAnchor='middle'
							dominantBaseline='central'
							fontSize={fontSize}
							fontWeight={500}
							fill={colorMix(base, 'var(--color-base-content)', 45)}
						>
							{`${bin.w}×${bin.h}`}
						</text>
					</g>
				)
			})}
		</svg>
	)
}

const emptyFilters = (): Filters => ({ tags: new Set(), constraints: [] })

const Root = () => {
	const [W, setW] = useState(6)
	const [H, setH] = useState(5)
	const [recipes, setRecipes] = useState<Recipe[]>([])
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const [filters, setFilters] = useState<Filters>(emptyFilters)

	useEffect(() => {
		const sorted = sortRecipes(solve({ W, H }))
		setRecipes(sorted)
		setSelectedKey(sorted[0]?.key ?? null)
		setFilters(emptyFilters())
	}, [W, H])

	const filteredRecipes = recipes.filter((r) => matchesFilter(r, filters))
	const filteredIdx = selectedKey ? filteredRecipes.findIndex((r) => r.key === selectedKey) : -1
	const selectedRecipe = filteredIdx >= 0 ? filteredRecipes[filteredIdx] : null
	const layout = selectedRecipe?.layout ?? []
	const totalPieces = selectedRecipe ? R.sum(R.values(selectedRecipe.counts)) : 0
	const filtersActive = filters.tags.size > 0 || filters.constraints.length > 0

	// How many recipes in the current filtered list carry each tag — drives
	// per-chip count badges and disables inactive chips that would yield zero.
	const tagCounts = new Map<TagId, number>(TAG_IDS.map((id) => [id, 0]))
	for (const recipe of filteredRecipes) for (const tag of recipe.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)

	// Filter change excluded the selected recipe → drop the selection (empty plate).
	useEffect(() => {
		if (selectedKey && filteredIdx === -1) setSelectedKey(null)
	}, [selectedKey, filteredIdx])

	const scrollerRef = useRef<HTMLDivElement>(null)
	// Rows are uniform menu-sm height (36px). Fixed estimate + no measureElement keeps
	// getTotalSize() stable so dragging the scrollbar tracks the cursor — measureElement
	// shrinks total size as new rows enter the viewport, sliding the thumb under the mouse.
	const rowVirtualizer = useVirtualizer({
		count: filteredRecipes.length,
		getScrollElement: () => scrollerRef.current,
		estimateSize: () => 36,
		overscan: 8,
	})

	// Plate or filter change: jump back to the top of the (possibly new) list.
	useEffect(() => {
		scrollerRef.current?.scrollTo(0, 0)
	}, [W, H, filters])

	// Selected row position changed → keep it visible. Phases 7+ (keyboard nav,
	// layout carousel) will flip the selection externally and rely on this.
	useEffect(() => {
		if (filteredIdx >= 0) rowVirtualizer.scrollToIndex(filteredIdx, { align: 'auto' })
	}, [filteredIdx, rowVirtualizer])

	const toggleTag = (id: TagId) =>
		setFilters((f) => {
			const tags = new Set(f.tags)
			if (tags.has(id)) tags.delete(id)
			else tags.add(id)
			return { ...f, tags }
		})

	const clearAll = () => setFilters(emptyFilters())

	return (
		<ThemeProvider>
			<main className='full-bleed-container p-8 gap-y-4 place-items-center'>
				<div className='flex gap-2'>
					<h1 className='text-2xl font-medium mb-6'>Grid-fill</h1>
					<ThemePicker variant='popover' />
				</div>

				<section className='grid grid-cols-2 gap-4 w-full'>
					<Field label={`Plate width: ${W}`}>
						<Range min={2} max={6} value={W} onChange={(e) => setW(+e.target.value)} />
					</Field>
					<Field label={`Plate depth: ${H}`}>
						<Range min={2} max={6} value={H} onChange={(e) => setH(+e.target.value)} />
					</Field>
				</section>

				<div className='stats stats-horizontal w-full *:place-items-center'>
					<div className='stat'>
						<div className='stat-title'>Unique sizes</div>
						<div className='stat-value text-2xl'>{selectedRecipe?.unique ?? '—'}</div>
					</div>
					<div className='stat'>
						<div className='stat-title'>Recipe</div>
						<div className='stat-value text-2xl'>
							{selectedRecipe ? `${filteredIdx + 1}/${filteredRecipes.length}` : '—'}
						</div>
					</div>
					<div className='stat'>
						<div className='stat-title'>Pieces</div>
						<div className='stat-value text-2xl'>{selectedRecipe ? totalPieces : '—'}</div>
					</div>
				</div>

				<Plate W={W} H={H} bins={layout} />

				<section className='w-full flex flex-wrap items-center gap-2'>
					{TAG_IDS.map((id) => (
						<TagChip
							key={id}
							id={id}
							active={filters.tags.has(id)}
							onToggle={() => toggleTag(id)}
							count={tagCounts.get(id) ?? 0}
						/>
					))}
				</section>

				<div className='w-full flex items-center justify-between text-sm text-base-content/70'>
					<span>
						Showing {filteredRecipes.length} of {recipes.length} recipes
					</span>
					{filtersActive && (
						<button type='button' className='btn btn-xs btn-ghost' onClick={clearAll}>
							Clear all
						</button>
					)}
				</div>

				<div className='w-full h-[60vh] rounded-box border border-current/10 overflow-hidden'>
					{filteredRecipes.length === 0 ? (
						<div className='size-full flex flex-col items-center justify-center gap-3 text-sm text-base-content/70'>
							<span>No matching recipes.</span>
							<button type='button' className='btn btn-sm' onClick={clearAll}>
								Clear all filters
							</button>
						</div>
					) : (
						<div ref={scrollerRef} className='size-full scroll-fade-y'>
							<ul
								className='menu menu-sm flex-nowrap p-0 w-full relative'
								style={{ height: rowVirtualizer.getTotalSize() }}
							>
								{rowVirtualizer.getVirtualItems().map((virtualItem) => {
									const i = virtualItem.index
									const recipe = filteredRecipes[i]
									const isSelected = recipe.key === selectedKey
									return (
										<li
											key={recipe.key}
											className='absolute top-0 left-0 w-full'
											style={{ transform: `translateY(${virtualItem.start}px)` }}
										>
											<button
												type='button'
												onClick={() => setSelectedKey(recipe.key)}
												className={isSelected ? 'menu-active' : ''}
											>
												<span className='opacity-50 font-mono tabular-nums whitespace-pre'>
													{`${i + 1}`.padStart(`${filteredRecipes.length}`.length, ' ')}.
												</span>
												<div className='flex flex-wrap items-center gap-2'>
													{R.sort(R.entries(recipe.counts), (a, b) => byFamily(a[0], b[0])).map(([size, count]) => (
														<div key={size} className='relative badge badge-lg badge-soft gap-1 tabular-nums'>
															<span>{size}</span>
															{count > 1 && (
																<span className='absolute -top-2 -right-2 badge badge-xs border border-current/10 px-1'>
																	{count}
																</span>
															)}
														</div>
													))}
													{recipe.tags.map((tag) => (
														<TagChip key={tag} id={tag} />
													))}
												</div>
											</button>
										</li>
									)
								})}
							</ul>
						</div>
					)}
				</div>
			</main>
		</ThemeProvider>
	)
}

if (typeof document !== 'undefined') createRoot(document.getElementById('root')!).render(<Root />)
