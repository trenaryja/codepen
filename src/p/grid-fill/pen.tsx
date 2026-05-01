import {
	autoUpdate,
	FloatingPortal,
	flip,
	offset,
	shift,
	useDismiss,
	useFloating,
	useFocus,
	useHover,
	useInteractions,
	useRole,
} from 'https://esm.sh/@floating-ui/react'
import { useVirtualizer } from 'https://esm.sh/@tanstack/react-virtual'
import { Button, Field, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { strToU8, zipSync } from 'https://esm.sh/fflate'
import { parseAsString, useQueryState } from 'https://esm.sh/nuqs'
import { NuqsAdapter } from 'https://esm.sh/nuqs/adapters/react'
import { useEffect, useRef, useState, type ReactNode } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuDownload, LuHeart, LuSlidersHorizontal } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { BASE62, decodeIntegers, encodeIntegers, triIndex, triInverse } from './codec'
import { colorMix, EdgeBadges, interpolateColors, Stepper } from './migrate-to-ui'

type Bin = { x: number; y: number; w: number; h: number; key: string }
type Recipe = { key: string; counts: Record<string, number>; unique: number; layout: Bin[]; tags: TagId[] }

const TAG_IDS = ['max-unique', 'monochrome', 'no-repeat', 'squares-only', 'uniform-count', 'all-multi'] as const
type TagId = (typeof TAG_IDS)[number]
type Constraint = { size: string; op: '=' | '>=' | 'exclude'; n: number }
const OP_SYMBOL: Record<Constraint['op'], string> = { '=': '=', '>=': '≥', exclude: '✕' }
export type Filters = { tags: Set<TagId>; favoriteOnly: boolean; constraints: Constraint[] }

const GF_PITCH = 42.5 // mm/unit: 42mm nominal + 0.5mm → ~1mm min gap between printed bins
const PRINT_BED_H = 256 // X1C bed depth mm — anchor plate to back-left, away from exclusion zone
const PRINT_BED_MARGIN = 5 // mm clearance from bed edge
const SVG_PADDING = 20
const SVG_CELL = 100
const BIN_INSET = 3

const STOPS = [
	'var(--color-primary)',
	'var(--color-secondary)',
	'var(--color-accent)',
	'var(--color-info)',
	'var(--color-success)',
	'var(--color-warning)',
	'var(--color-error)',
]

const TAGS: Record<TagId | 'favorite', { label: string; description: string }> = {
	favorite: { label: 'favorites', description: 'Recipes you have marked as favorites.' },
	'max-unique': {
		label: 'max unique',
		description: 'Uses the largest number of distinct piece sizes possible for this plate.',
	},
	monochrome: {
		label: 'mono',
		description: 'Uses only a single piece size.',
	},
	'no-repeat': {
		label: 'no repeat',
		description: 'Every piece in the recipe is a different size — no size appears twice.',
	},
	'squares-only': {
		label: 'squares only',
		description: 'Every piece is a square (width = height).',
	},
	'uniform-count': {
		label: 'uniform',
		description: 'Every piece size appears the same number of times.',
	},
	'all-multi': {
		label: 'all multi',
		description: 'Every piece size appears at least twice — no singletons.',
	},
}

const encodeRecipe = (counts: Record<string, number>, W: number, H: number) => {
	const pieces = Object.entries(counts)
		.map(([key, count]) => {
			const [w, h] = key.split('×').map(Number)
			return { w, h, count }
		})
		.sort((a, b) => triIndex(a.w, a.h) - triIndex(b.w, b.h))

	const values = [W, H, pieces.length]
	let prevIndex = -1
	for (let i = 0; i < pieces.length; i++) {
		const { w, h, count } = pieces[i]
		const pairIndex = triIndex(w, h)
		values.push(pairIndex - prevIndex)
		if (i < pieces.length - 1) values.push(count)
		prevIndex = pairIndex
	}

	return encodeIntegers(values, BASE62)
}

const decodeRecipe = (encoded: string) => {
	const values = decodeIntegers(encoded, BASE62)
	let pos = 0
	const read = () => values[pos++]

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

const computeTags = (recipe: Recipe, maxUnique: number) => {
	const tags: TagId[] = []
	if (recipe.unique === maxUnique) tags.push('max-unique')
	if (recipe.unique === 1) tags.push('monochrome')
	if (R.values(recipe.counts).every((c) => c === 1)) tags.push('no-repeat')
	if (R.keys(recipe.counts).every((s) => s.split('×')[0] === s.split('×')[1])) tags.push('squares-only')
	const counts = R.values(recipe.counts)
	if (counts.every((count) => count === counts[0])) tags.push('uniform-count')
	if (counts.every((count) => count >= 2)) tags.push('all-multi')
	return tags
}

const matchesFilter = (recipe: Recipe, filters: Filters, favorites: Set<string>) => {
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

const emptyFilters = (): Filters => ({ tags: new Set(), favoriteOnly: false, constraints: [] })

const useFavorites = () => {
	const [favorites, setFavorites] = useState<Set<string>>(() => {
		try {
			const stored = localStorage.getItem('grid-fill:favorites')
			return new Set(stored ? JSON.parse(stored) : [])
		} catch {
			return new Set<string>()
		}
	})
	const toggleFavorite = (key: string) =>
		setFavorites((prev) => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			localStorage.setItem('grid-fill:favorites', JSON.stringify([...next]))
			return next
		})
	return { favorites, toggleFavorite }
}

const byFamily = (a: string, b: string) => {
	const [widthA, heightA] = a.split('×').map(Number)
	const [widthB, heightB] = b.split('×').map(Number)
	return Math.min(widthA, heightA) - Math.min(widthB, heightB) || Math.max(widthA, heightA) - Math.max(widthB, heightB)
}

const availableSizes = (W: number, H: number) => {
	const seen = new Set<string>()
	const sizes: string[] = []
	for (let w = 1; w <= W; w++)
		for (let h = 1; h <= H; h++) {
			const size = w <= h ? `${w}×${h}` : `${h}×${w}`
			if (seen.has(size)) continue
			seen.add(size)
			sizes.push(size)
		}
	return R.sort(sizes, byFamily)
}

const solve = ({ W, H }: { W: number; H: number }) => {
	const AREA = W * H
	const FULL = (1 << W) - 1

	const sizeKeys = availableSizes(W, H)
		.slice()
		.sort((a, b) => {
			const [wa, ha] = a.split('×').map(Number)
			const [wb, hb] = b.split('×').map(Number)
			return wb * hb - wa * ha
		})
	const K = sizeKeys.length
	const keyArea = new Int32Array(K)
	const keyDimensions: number[][][] = []
	for (let keyIndex = 0; keyIndex < K; keyIndex++) {
		const [w, h] = sizeKeys[keyIndex].split('×').map(Number)
		keyArea[keyIndex] = w * h
		const dims: number[][] = [[w, h]]
		if (w !== h) dims.push([h, w])
		keyDimensions.push(dims.filter(([width, height]) => width <= W && height <= H))
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
				for (let keyIndex = 0; keyIndex < K; keyIndex++) if (counts[keyIndex] !== 0) return false
				return true
			}
			const [x, y] = cell
			for (let keyIndex = 0; keyIndex < K; keyIndex++) {
				if (counts[keyIndex] <= 0) continue
				const dimensions = keyDimensions[keyIndex]
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
					counts[keyIndex]--
					layout.push({ x, y, w, h, key: sizeKeys[keyIndex] })
					if (recurse()) return true
					layout.pop()
					counts[keyIndex]++
					for (let dy = 0; dy < h; dy++) rows[y + dy] &= ~mask
				}
			}
			return false
		}
		return recurse() ? layout.slice() : null
	}

	function* enumerateMultisets(uniqueTarget: number): Generator<Int8Array> {
		const counts = new Int8Array(K)
		function* emit(keyIndex: number, remainingArea: number, remainingUnique: number): Generator<Int8Array> {
			if (remainingUnique === 0) {
				if (remainingArea === 0) yield Int8Array.from(counts)
				return
			}
			if (keyIndex >= K) return
			if (K - keyIndex < remainingUnique) return
			yield* emit(keyIndex + 1, remainingArea, remainingUnique)
			const area = keyArea[keyIndex]
			const maxCount = Math.floor(remainingArea / area)
			for (let count = 1; count <= maxCount; count++) {
				counts[keyIndex] = count
				yield* emit(keyIndex + 1, remainingArea - count * area, remainingUnique - 1)
			}
			counts[keyIndex] = 0
		}
		yield* emit(0, AREA, uniqueTarget)
	}

	const recipeKeyOf = (counts: Int8Array) => {
		const parts: string[] = []
		for (let keyIndex = 0; keyIndex < K; keyIndex++)
			if (counts[keyIndex] > 0) parts.push(`${sizeKeys[keyIndex]}:${counts[keyIndex]}`)
		parts.sort()
		return parts.join('|')
	}

	const found: Recipe[] = []
	for (let uniqueCount = 1; uniqueCount <= K; uniqueCount++) {
		for (const counts of enumerateMultisets(uniqueCount)) {
			const layout = tryPack(counts)
			if (!layout) continue
			const countsObj: Record<string, number> = {}
			for (let keyIndex = 0; keyIndex < K; keyIndex++)
				if (counts[keyIndex] > 0) countsObj[sizeKeys[keyIndex]] = counts[keyIndex]
			found.push({ key: recipeKeyOf(counts), counts: countsObj, unique: uniqueCount, layout, tags: [] })
		}
	}
	const maxUnique = Math.max(0, ...found.map((r) => r.unique))
	for (const recipe of found) recipe.tags = computeTags(recipe, maxUnique)
	return found
}

const parseSTL = (buf: ArrayBuffer) => {
	const view = new DataView(buf)
	const count = view.getUint32(80, true)
	const vertMap = new Map<string, number>()
	const verts: number[] = []
	const tris: number[] = []
	for (let i = 0; i < count; i++) {
		const base = 84 + i * 50 + 12
		const tri: number[] = []
		for (let j = 0; j < 3; j++) {
			const x = view.getFloat32(base + j * 12, true)
			const y = view.getFloat32(base + j * 12 + 4, true)
			const z = view.getFloat32(base + j * 12 + 8, true)
			const k = `${x},${y},${z}`
			let idx = vertMap.get(k)
			if (idx === undefined) {
				idx = verts.length / 3
				vertMap.set(k, idx)
				verts.push(x, y, z)
			}
			tri.push(idx)
		}
		tris.push(...tri)
	}
	return { verts, tris }
}

const build3mf = async (recipe: Recipe): Promise<Blob> => {
	const uniqueSizes = [...new Set(recipe.layout.map((b) => b.key))]
	const geoms = new Map<string, { verts: number[]; tris: number[] }>()
	await Promise.all(
		uniqueSizes.map(async (key) => {
			const buf = await fetch(`/gridfinity/bin_${key.replace('×', 'x')}.stl`).then((r) => r.arrayBuffer())
			geoms.set(key, parseSTL(buf))
		}),
	)

	let xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>\n`

	const sizeId = new Map(uniqueSizes.map((k, i) => [k, i + 1]))
	for (const [key, { verts, tris }] of geoms) {
		xml += `  <object id="${sizeId.get(key)}" type="model">\n   <mesh>\n    <vertices>\n`
		for (let i = 0; i < verts.length; i += 3)
			xml += `     <vertex x="${verts[i].toFixed(4)}" y="${verts[i + 1].toFixed(4)}" z="${verts[i + 2].toFixed(4)}"/>\n`
		xml += `    </vertices>\n    <triangles>\n`
		for (let i = 0; i < tris.length; i += 3)
			xml += `     <triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>\n`
		xml += `    </triangles>\n   </mesh>\n  </object>\n`
	}

	const N = uniqueSizes.length
	for (let i = 0; i < recipe.layout.length; i++) {
		const bin = recipe.layout[i]
		// STL stores the larger dimension along X; portrait bins (w<h) need 90° CW so STL-X→bed-Y.
		const rotation = bin.w < bin.h ? '0 1 0 -1 0 0 0 0 1 0 0 0' : '1 0 0 0 1 0 0 0 1 0 0 0'
		xml += `  <object id="${N + i + 1}" type="model">\n   <components>\n    <component objectid="${sizeId.get(bin.key)}" transform="${rotation}"/>\n   </components>\n  </object>\n`
	}

	xml += ` </resources>\n <build>\n`
	for (let i = 0; i < recipe.layout.length; i++) {
		const bin = recipe.layout[i]
		const tx = PRINT_BED_MARGIN + bin.x * GF_PITCH + (bin.w * GF_PITCH) / 2
		const ty = PRINT_BED_H - PRINT_BED_MARGIN - bin.y * GF_PITCH - (bin.h * GF_PITCH) / 2
		xml += `  <item objectid="${N + i + 1}" transform="1 0 0 0 1 0 0 0 1 ${tx.toFixed(4)} ${ty.toFixed(4)} 0" printable="1"/>\n`
	}
	xml += ` </build>\n</model>`

	const zip = zipSync({
		'[Content_Types].xml': strToU8(
			`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>`,
		),
		'_rels/.rels': strToU8(
			`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`,
		),
		'3D/3dmodel.model': strToU8(xml),
	})
	return new Blob([new Uint8Array(zip.buffer as ArrayBuffer)], { type: 'model/3mf' })
}

type TagChipProps = { id: TagId | 'favorite'; icon?: ReactNode; active?: boolean; onToggle?: () => void; count?: number }

const TagChip = ({ id, icon, active, onToggle, count }: TagChipProps) => {
	const [open, setOpen] = useState(false)
	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		placement: 'top',
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	})
	const hover = useHover(context, { mouseOnly: true, delay: { open: 120, close: 0 } })
	const focus = useFocus(context)
	const dismiss = useDismiss(context)
	const role = useRole(context, { role: 'tooltip' })
	const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role])
	const { label, description } = TAGS[id]
	const disabled = !!onToggle && !active && count === 0
	const cursor = disabled ? 'cursor-not-allowed' : onToggle ? 'cursor-pointer' : 'cursor-help'
	const className = `badge badge-sm gap-1 ${active ? 'badge-primary' : 'badge-ghost'} ${cursor} ${disabled ? 'opacity-40' : ''}`
	const inner = (
		<>
			{icon}
			{label}
			{count !== undefined && (
				<span className={`badge badge-xs tabular-nums transition-opacity ${count > 0 ? 'opacity-60' : 'opacity-0'}`}>
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

type SizeCellProps = {
	size: string
	constraint: Constraint | null
	filteredCount: number
	onSetOp: (op: Constraint['op'] | null) => void
	onUpdateN: (n: number) => void
	W: number
	H: number
}

const SizeCell = ({ size, constraint, filteredCount, onSetOp, onUpdateN, W, H }: SizeCellProps) => {
	const [w, h] = size.split('×').map(Number)
	const impossible = filteredCount === 0 && !constraint
	return (
		<div
			className={`flex flex-col items-center gap-1.5 p-2 rounded-btn border text-center transition-opacity ${
				impossible
					? 'opacity-30 pointer-events-none border-base-300 bg-base-100'
					: constraint
						? 'border-primary bg-primary/10'
						: 'border-base-300 bg-base-100 hover:bg-base-200'
			}`}
		>
			<span className='text-xs font-mono font-semibold'>{size}</span>
			<div className='join'>
				{(['=', '>=', 'exclude'] as const).map((op) => (
					<button
						key={op}
						type='button'
						className={`btn btn-xs join-item px-1.5 ${constraint?.op === op ? 'btn-primary' : ''}`}
						onClick={() => onSetOp(constraint?.op === op ? null : op)}
					>
						{OP_SYMBOL[op]}
					</button>
				))}
			</div>
			<div className={constraint && constraint.op !== 'exclude' ? '' : 'invisible'}>
				<Stepper
					value={constraint?.n ?? 1}
					max={Math.floor((W * H) / (w * h))}
					onChange={onUpdateN}
					classNames={{ button: 'btn-xs' }}
				/>
			</div>
		</div>
	)
}

const ExportButton = ({ recipe, W, H }: { recipe: Recipe | null; W: number; H: number }) => {
	const [busy, setBusy] = useState(false)

	const download = async () => {
		if (!recipe) return
		setBusy(true)
		await Promise.resolve() // yield to event loop so React can flush busy state before build3mf blocks
		try {
			const blob = await build3mf(recipe)
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `gridfinity_${encodeRecipe(recipe.counts, W, H)}.3mf`
			a.click()
			URL.revokeObjectURL(url)
		} catch (err) {
			console.error('3MF export failed:', err)
		} finally {
			setBusy(false)
		}
	}

	return (
		<Button className='btn-square' onClick={download} disabled={busy || !recipe} title='Download 3MF'>
			<LuDownload />
		</Button>
	)
}

type RecipeListProps = {
	filteredRecipes: Recipe[]
	totalCount: number
	selectedKey: string | null
	filteredIndex: number
	onSelect: (key: string, encoded: string) => void
	filtersActive: boolean
	onClearAll: () => void
	filters: Filters
	favorites: Set<string>
	toggleFavorite: (key: string) => void
	W: number
	H: number
}

const RecipeList = ({
	filteredRecipes,
	totalCount,
	selectedKey,
	filteredIndex,
	onSelect,
	filtersActive,
	onClearAll,
	filters,
	favorites,
	toggleFavorite,
	W,
	H,
}: RecipeListProps) => {
	const scrollerRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: filteredRecipes.length,
		getScrollElement: () => scrollerRef.current,
		estimateSize: () => 62,
		overscan: 8,
		measureElement: (el) => el.getBoundingClientRect().height,
	})

	useEffect(() => {
		scrollerRef.current?.scrollTo(0, 0)
	}, [W, H, filters])

	useEffect(() => {
		if (filteredIndex >= 0) rowVirtualizer.scrollToIndex(filteredIndex, { align: 'auto' })
	}, [filteredIndex, rowVirtualizer])

	return (
		<div className='grid grid-rows-[auto_minmax(0,1fr)] gap-2'>
			<div className='flex items-center justify-between text-sm text-base-content/70'>
				<span>
					Showing {filteredRecipes.length} of {totalCount} recipes
				</span>
				{filtersActive && (
					<button type='button' className='btn btn-xs btn-ghost' onClick={onClearAll}>
						Clear all
					</button>
				)}
			</div>

			<div
				className='overflow-hidden'
				style={filteredRecipes.length > 0 ? { height: `min(100%, ${rowVirtualizer.getTotalSize()}px)` } : undefined}
			>
				{filteredRecipes.length === 0 ? (
					<div className='size-full flex flex-col items-center justify-center gap-3 text-sm text-base-content/70'>
						<span>No matching recipes.</span>
						<button type='button' className='btn btn-sm' onClick={onClearAll}>
							Clear all filters
						</button>
					</div>
				) : (
					<div ref={scrollerRef} className='size-full scroll-fade-y'>
						<ul className='relative' style={{ height: rowVirtualizer.getTotalSize() }}>
							{rowVirtualizer.getVirtualItems().map((virtualItem) => {
								const recipe = filteredRecipes[virtualItem.index]
								const isSelected = recipe.key === selectedKey
								const encoded = encodeRecipe(recipe.counts, W, H)
								return (
									<li
										key={recipe.key}
										data-index={virtualItem.index}
										ref={rowVirtualizer.measureElement}
										className='absolute top-0 left-0 w-full list-none pt-3 flex items-center gap-2'
										style={{ transform: `translateY(${virtualItem.start}px)` }}
									>
										<button
											type='button'
											onClick={() => onSelect(recipe.key, encoded)}
											className={`surface cursor-pointer relative flex-1 p-2 transition-colors ${isSelected ? 'border-primary' : ''}`}
										>
											<EdgeBadges placement='top-start'>
												<span className='badge badge-xs font-mono badge-soft'>{encoded}</span>
											</EdgeBadges>
											<EdgeBadges placement='top-end'>
												{recipe.tags.map((tag) => (
													<span key={tag} className='badge badge-xs badge-soft'>
														{TAGS[tag].label}
													</span>
												))}
											</EdgeBadges>
											<div className='flex gap-2 flex-nowrap overflow-x-fade pt-2'>
												{R.sort(R.entries(recipe.counts), (a, b) => byFamily(a[0], b[0])).map(([size, count]) => (
													<span key={size} className='indicator badge badge-soft tabular-nums'>
														{count > 1 && (
															<span className='indicator-item badge badge-xs px-1 tabular-nums'>{count}</span>
														)}
														{size}
													</span>
												))}
											</div>
										</button>
										<button
											type='button'
											className='btn btn-ghost btn-square btn-sm shrink-0'
											onClick={() => toggleFavorite(recipe.key)}
										>
											<LuHeart
												className={favorites.has(recipe.key) ? 'fill-primary text-primary' : 'text-base-content/30'}
											/>
										</button>
									</li>
								)
							})}
						</ul>
					</div>
				)}
			</div>
		</div>
	)
}

const parseInitialDims = (id: string | null) => {
	try {
		return id ? decodeRecipe(id) : null
	} catch {
		return null
	}
}

const Root = () => {
	const [compactId, setCompactId] = useQueryState('id', parseAsString)
	const [W, setW] = useState(() => parseInitialDims(compactId)?.W ?? 6)
	const [H, setH] = useState(() => parseInitialDims(compactId)?.H ?? 5)
	const [recipes, setRecipes] = useState<Recipe[]>([])
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const [filters, setFilters] = useState<Filters>(emptyFilters)
	const { favorites, toggleFavorite } = useFavorites()
	const restoreIdRef = useRef<string | null>(compactId)

	useEffect(() => {
		const solved = solve({ W, H })
		const allKeys = R.sort(R.unique(solved.flatMap((x) => R.keys(x.counts))), byFamily)
		const familyOrder = R.fromEntries(allKeys.map((k, i) => [k, i] as const))
		const sortedEntries = (recipe: Recipe) => R.sortBy(R.entries(recipe.counts), ([s]) => familyOrder[s])
		const sorted = R.sort(solved, (a, b) => {
			if (a.unique !== b.unique) return a.unique - b.unique
			const sortedA = sortedEntries(a),
				sortedB = sortedEntries(b)
			for (let i = 0; i < sortedA.length && i < sortedB.length; i++) {
				const diff = familyOrder[sortedA[i][0]] - familyOrder[sortedB[i][0]]
				if (diff) return diff
				if (sortedA[i][1] !== sortedB[i][1]) return sortedA[i][1] - sortedB[i][1]
			}
			return sortedA.length - sortedB.length
		})
		setRecipes(sorted)

		const restoreId = restoreIdRef.current
		restoreIdRef.current = null

		let keyToSelect: string | null = null
		if (restoreId) {
			try {
				const { counts } = decodeRecipe(restoreId)
				const pairs = R.entries(counts).map(([k, v]) => `${k}:${v}`)
				pairs.sort()
				const targetKey = pairs.join('|')
				keyToSelect = sorted.find((r) => r.key === targetKey)?.key ?? null
			} catch {}
		}

		setSelectedKey(keyToSelect ?? sorted[0]?.key ?? null)
		const valid = new Set(availableSizes(W, H))
		setFilters((f) => ({
			tags: f.tags,
			favoriteOnly: f.favoriteOnly,
			constraints: f.constraints.filter((c) => valid.has(c.size)),
		}))
	}, [W, H])

	const plateSizes = availableSizes(W, H)
	const filteredRecipes = recipes.filter((r) => matchesFilter(r, filters, favorites))
	const filteredIndex = selectedKey ? filteredRecipes.findIndex((r) => r.key === selectedKey) : -1
	const selectedRecipe = filteredIndex >= 0 ? filteredRecipes[filteredIndex] : null
	const layout = selectedRecipe?.layout ?? []
	const gridW = SVG_CELL * W
	const gridH = SVG_CELL * H
	const viewBoxWidth = gridW + 2 * SVG_PADDING
	const viewBoxHeight = gridH + 2 * SVG_PADDING
	const originX = SVG_PADDING
	const originY = SVG_PADDING
	const keys = R.sort(R.unique(layout.map((bin) => bin.key)), byFamily)
	const baseOf = (size: string) =>
		interpolateColors(keys.length > 1 ? keys.indexOf(size) / (keys.length - 1) : 0, STOPS)
	const filtersActive = filters.tags.size > 0 || filters.favoriteOnly || filters.constraints.length > 0

	const favoriteCount = filteredRecipes.filter((r) => favorites.has(r.key)).length
	const tagCounts = new Map<TagId, number>(TAG_IDS.map((id) => [id, 0]))
	for (const recipe of filteredRecipes) for (const tag of recipe.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
	const filteredSizeCounts = new Map<string, number>()
	for (const recipe of filteredRecipes)
		for (const size of R.keys(recipe.counts)) filteredSizeCounts.set(size, (filteredSizeCounts.get(size) ?? 0) + 1)

	useEffect(() => {
		if (selectedKey && filteredIndex === -1) setSelectedKey(null)
	}, [selectedKey, filteredIndex])

	const toggleTag = (id: TagId) =>
		setFilters((f) => {
			const tags = new Set(f.tags)
			if (tags.has(id)) tags.delete(id)
			else tags.add(id)
			return { ...f, tags }
		})

	const clearAll = () => setFilters(emptyFilters())

	const setSizeConstraint = (size: string, op: Constraint['op'] | null) =>
		setFilters((f) => {
			if (!op) return { ...f, constraints: f.constraints.filter((c) => c.size !== size) }
			const existing = f.constraints.find((c) => c.size === size)
			if (existing)
				return {
					...f,
					constraints: f.constraints.map((c) =>
						c.size === size ? { ...c, op, n: op === 'exclude' ? 0 : Math.max(1, c.n) } : c,
					),
				}
			return { ...f, constraints: [...f.constraints, { size, op, n: op === 'exclude' ? 0 : 1 }] }
		})

	const updateSizeN = (size: string, n: number) =>
		setFilters((f) => ({ ...f, constraints: f.constraints.map((c) => (c.size === size ? { ...c, n } : c)) }))

	return (
		<ThemeProvider>
			<div className='drawer drawer-end min-h-screen'>
				<input id='filter-drawer' type='checkbox' className='drawer-toggle' />

				<div className='drawer-content'>
					<main className='grid grid-cols-1 md:grid-cols-2 md:grid-rows-1 gap-4 p-4 w-full md:h-dvh md:overflow-hidden'>
						<svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className='self-center'>
							<title>Plate layout</title>
							{layout.map((bin) => {
								const base = baseOf(bin.key)
								const x = originX + bin.x * SVG_CELL + BIN_INSET
								const y = originY + bin.y * SVG_CELL + BIN_INSET
								const w = bin.w * SVG_CELL - 2 * BIN_INSET
								const h = bin.h * SVG_CELL - 2 * BIN_INSET
								const fontSize = SVG_CELL / 3
								return (
									<g key={`${bin.x}-${bin.y}`}>
										<rect
											x={x}
											y={y}
											width={w}
											height={h}
											rx={6}
											fill={colorMix(base, 'var(--color-base-100)', 10)}
											stroke={base}
										/>
										<text
											x={x + w / 2}
											y={y + h / 2}
											textAnchor='middle'
											dominantBaseline='central'
											fontSize={fontSize}
											fontWeight={500}
											fill={colorMix(base, 'var(--color-base-content)', 50)}
										>
											{`${bin.w}×${bin.h}`}
										</text>
									</g>
								)
							})}
						</svg>

						<nav className='grid gap-4 grid-rows-[auto_minmax(0,1fr)] pb-4 h-dvh max-h-full'>
							<section className='flex items-center justify-center flex-wrap gap-2 p-4'>
								<div className='flex gap-4'>
									<Field labelPlacement='top-center' label='Width'>
										<Stepper
											value={W}
											min={2}
											max={6}
											classNames={{ button: 'btn-sm' }}
											onChange={(v) => {
												setW(v)
												setCompactId(null)
											}}
										/>
									</Field>
									<Field labelPlacement='top-center' label='Depth'>
										<Stepper
											value={H}
											min={2}
											max={6}
											classNames={{ button: 'btn-sm' }}
											onChange={(v) => {
												setH(v)
												setCompactId(null)
											}}
										/>
									</Field>
								</div>
								<div className='flex items-center gap-1'>
									<ThemePicker variant='popover' />
									<ExportButton recipe={selectedRecipe} W={W} H={H} />
									<label htmlFor='filter-drawer' className='btn btn-square indicator' title='Filters'>
										{filtersActive && <span className='indicator-item size-2 rounded-full bg-primary' />}
										<LuSlidersHorizontal />
									</label>
								</div>
							</section>
							<RecipeList
								filteredRecipes={filteredRecipes}
								totalCount={recipes.length}
								selectedKey={selectedKey}
								filteredIndex={filteredIndex}
								onSelect={(key, encoded) => {
									setSelectedKey(key)
									setCompactId(encoded)
								}}
								filtersActive={filtersActive}
								onClearAll={clearAll}
								filters={filters}
								favorites={favorites}
								toggleFavorite={toggleFavorite}
								W={W}
								H={H}
							/>
						</nav>
					</main>
				</div>

				<div className='drawer-side z-20'>
					<label htmlFor='filter-drawer' aria-label='close filters' className='drawer-overlay' />
					<div className='bg-base-200 flex min-h-full w-sm flex-col gap-4 overflow-y-auto p-4'>
						<div className='flex items-center justify-between'>
							<span className='font-semibold'>Filters</span>
							<label htmlFor='filter-drawer' className='btn btn-sm btn-ghost btn-square'>
								✕
							</label>
						</div>
						<div className='flex flex-col gap-2'>
							<div className='flex flex-wrap gap-2 justify-center'>
								<TagChip
									id='favorite'
									icon={<LuHeart className='size-3' />}
									active={filters.favoriteOnly}
									onToggle={() => setFilters((f) => ({ ...f, favoriteOnly: !f.favoriteOnly }))}
									count={favoriteCount}
								/>
								{TAG_IDS.map((id) => (
									<TagChip
										key={id}
										id={id}
										active={filters.tags.has(id)}
										onToggle={() => toggleTag(id)}
										count={tagCounts.get(id) ?? 0}
									/>
								))}
							</div>
							<div className='grid gap-2' style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
								{plateSizes.map((size) => (
									<SizeCell
										key={size}
										size={size}
										constraint={filters.constraints.find((c) => c.size === size) ?? null}
										filteredCount={filteredSizeCounts.get(size) ?? 0}
										onSetOp={(op) => setSizeConstraint(size, op)}
										onUpdateN={(n) => updateSizeN(size, n)}
										W={W}
										H={H}
									/>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(
	<NuqsAdapter>
		<Root />
	</NuqsAdapter>,
)
