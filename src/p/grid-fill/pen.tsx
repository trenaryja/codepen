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
import { strToU8, zipSync } from 'https://esm.sh/fflate'
import { parseAsString, useQueryState } from 'https://esm.sh/nuqs'
import { NuqsAdapter } from 'https://esm.sh/nuqs/adapters/react'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'

// TODO: replace with `import { colorMix, interpolateColors } from '@trenaryja/ui/utils'`
const colorMix = (from: string, to: string, ratio: number) =>
	`color-mix(in oklab, ${from} ${R.clamp(ratio, { min: 0, max: 100 })}%, ${to})`
const interpolateColors = (t: number, stops: string[]) => {
	if (stops.length === 1) return stops[0]
	const lastIndex = stops.length - 1
	const scaled = R.clamp(t, { min: 0, max: 1 }) * lastIndex
	const segment = Math.min(Math.floor(scaled), lastIndex - 1)
	return colorMix(stops[segment], stops[segment + 1], Math.round((1 - (scaled - segment)) * 100))
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

export const computeTags = (recipe: Recipe, ctx: TagContext) => {
	const tags: TagId[] = []
	if (recipe.unique === ctx.maxUnique) tags.push('max-unique')
	if (recipe.unique === 1) tags.push('monochrome')
	if (!('1×1' in recipe.counts)) tags.push('no-1x1')
	if (R.values(recipe.counts).every((c) => c === 1)) tags.push('no-repeat')
	if (R.keys(recipe.counts).every(isSquareKey)) tags.push('squares-only')
	return tags
}

const computeTagContext = (recipes: Recipe[]): TagContext => ({
	maxUnique: Math.max(0, ...recipes.map((r) => r.unique)),
})

export const matchesFilter = (recipe: Recipe, filters: Filters) => {
	for (const tag of filters.tags) if (!recipe.tags.includes(tag)) return false
	for (const c of filters.constraints) {
		const count = recipe.counts[c.size] ?? 0
		if (c.op === '=' && count !== c.n) return false
		if (c.op === '>=' && count < c.n) return false
		if (c.op === 'exclude' && count > 0) return false
	}
	return true
}

const OP_SYMBOL: Record<Constraint['op'], string> = { '=': '=', '>=': '≥', exclude: '✕' }

const constraintKey = (c: Constraint) => `${c.size}|${c.op}|${c.n}`
const sameConstraint = (a: Constraint, b: Constraint) => constraintKey(a) === constraintKey(b)
const dedupeConstraints = (cs: Constraint[]) => R.uniqueBy(cs, constraintKey)

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
	return Math.min(widthA, heightA) - Math.min(widthB, heightB) || Math.max(widthA, heightA) - Math.max(widthB, heightB)
}

// Enumerate piece multisets; bitmask DFS verifies each is packable (6×5: ~200M layout-search nodes → 12K).
const keyOf = (w: number, h: number) => (w <= h ? `${w}×${h}` : `${h}×${w}`)

const availableSizes = (W: number, H: number) => {
	const seen = new Set<string>()
	const sizes: string[] = []
	for (let w = 1; w <= W; w++)
		for (let h = 1; h <= H; h++) {
			const size = keyOf(w, h)
			if (seen.has(size)) continue
			seen.add(size)
			sizes.push(size)
		}
	return R.sort(sizes, byFamily)
}

const maxCountFor = (size: string, W: number, H: number) => {
	const [w, h] = size.split('×').map(Number)
	return Math.floor((W * H) / (w * h))
}

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
	for (let keyIndex = 0; keyIndex < K; keyIndex++) {
		const [w, h] = sizeKeys[keyIndex].split('×').map(Number)
		keyArea[keyIndex] = w * h
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
		function* emit(keyIndex: number, remArea: number, remUnique: number): Generator<Int8Array> {
			if (remUnique === 0) {
				if (remArea === 0) yield Int8Array.from(counts)
				return
			}
			if (keyIndex >= K) return
			if (K - keyIndex < remUnique) return
			yield* emit(keyIndex + 1, remArea, remUnique)
			const area = keyArea[keyIndex]
			const maxCount = Math.floor(remArea / area)
			for (let count = 1; count <= maxCount; count++) {
				counts[keyIndex] = count
				yield* emit(keyIndex + 1, remArea - count * area, remUnique - 1)
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
	const ctx = computeTagContext(found)
	for (const recipe of found) recipe.tags = computeTags(recipe, ctx)
	return found
}

// Fewest unique first; ties broken by (size, count) in family order.
const sortRecipes = (recipes: Recipe[]) => {
	const allKeys = R.pipe(
		recipes,
		R.flatMap((x) => R.keys(x.counts)),
		R.unique(),
		R.sort(byFamily),
	)
	const familyOrder = R.fromEntries(allKeys.map((k, i) => [k, i] as const))
	const sortedEntries = (r: Recipe) => R.sortBy(R.entries(r.counts), ([s]) => familyOrder[s])
	return R.sort(recipes, (a, b) => {
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
}

// ── 3MF export ───────────────────────────────────────────────────────────────

const GF_PITCH = 42.5 // mm/unit: 42mm nominal + 0.5mm → ~1mm min gap between printed bins
const PRINT_BED_H = 256 // X1C bed depth mm — anchor plate to back-left, away from exclusion zone
const PRINT_BED_MARGIN = 5 // mm clearance from bed edge

function parseSTL(buf: ArrayBuffer) {
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

async function build3mf(recipe: Recipe): Promise<Blob> {
	const uniqueSizes = [...new Set(recipe.layout.map((b) => b.key))]
	const geoms = new Map<string, { verts: number[]; tris: number[] }>()
	await Promise.all(
		uniqueSizes.map(async (key) => {
			const buf = await fetch(`/gridfinity/bin_${key.replace('×', 'x')}.stl`).then((r) => r.arrayBuffer())
			geoms.set(key, parseSTL(buf))
		}),
	)

	// Single 3dmodel.model with all geometry objects + wrapper objects + build items.
	// Bins where w<h (portrait in grid) get a 90° rotation so the STL's large axis (X)
	// maps to bed Y and small axis (Y) maps to bed X.
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
		// STL files store larger dimension in X. For portrait bins (w<h), rotate 90° CW so
		// STL-X (large) → bed-Y and STL-Y (small) → bed-X, matching the grid orientation.
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

	return new Blob(
		[
			zipSync({
				'[Content_Types].xml': strToU8(
					`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>`,
				),
				'_rels/.rels': strToU8(
					`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`,
				),
				'3D/3dmodel.model': strToU8(xml),
			}),
		],
		{ type: 'model/3mf' },
	)
}

const ExportButton = ({ recipe, W, H }: { recipe: Recipe | null; W: number; H: number }) => {
	const [busy, setBusy] = useState(false)
	if (!recipe) return null

	const download = async () => {
		setBusy(true)
		await Promise.resolve()
		try {
			const blob = await build3mf(recipe)
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `gridfinity_${W}x${H}.3mf`
			a.click()
			URL.revokeObjectURL(url)
		} catch (err) {
			console.error('3MF export failed:', err)
		} finally {
			setBusy(false)
		}
	}

	return (
		<button type='button' className='btn btn-sm btn-primary w-full' onClick={download} disabled={busy}>
			{busy ? 'Generating…' : 'Download 3MF'}
		</button>
	)
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

const CountStepper = ({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) => (
	<div className='join'>
		<button
			type='button'
			className='btn btn-xs btn-ghost join-item'
			onClick={() => onChange(Math.max(1, value - 1))}
			disabled={value <= 1}
		>
			−
		</button>
		<span className='btn btn-xs btn-ghost join-item pointer-events-none tabular-nums min-w-6'>{value}</span>
		<button
			type='button'
			className='btn btn-xs btn-ghost join-item'
			onClick={() => onChange(Math.min(max, value + 1))}
			disabled={value >= max}
		>
			+
		</button>
	</div>
)

// ── FilterMatrix ──────────────────────────────────────────────────────────────

const SizeCell = ({
	size,
	constraint,
	filteredCount,
	onSetOp,
	onUpdateN,
	W,
	H,
}: {
	size: string
	constraint: Constraint | null
	filteredCount: number
	onSetOp: (op: Constraint['op'] | null) => void
	onUpdateN: (n: number) => void
	W: number
	H: number
}) => {
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
						className={`btn btn-xs join-item px-1.5 ${constraint?.op === op ? 'btn-primary' : 'btn-ghost'}`}
						onClick={() => onSetOp(constraint?.op === op ? null : op)}
					>
						{OP_SYMBOL[op]}
					</button>
				))}
			</div>
			<div className={constraint && constraint.op !== 'exclude' ? '' : 'invisible'}>
				<CountStepper value={constraint?.n ?? 1} max={maxCountFor(size, W, H)} onChange={onUpdateN} />
			</div>
		</div>
	)
}

const FilterMatrixPanel = ({
	sizes,
	filters,
	W,
	H,
	onTagToggle,
	onSetSizeOp,
	onUpdateSizeN,
	tagCounts,
	filteredSizeCounts,
}: {
	sizes: string[]
	filters: Filters
	W: number
	H: number
	onTagToggle: (id: TagId) => void
	onSetSizeOp: (size: string, op: Constraint['op'] | null) => void
	onUpdateSizeN: (size: string, n: number) => void
	tagCounts: Map<TagId, number>
	filteredSizeCounts: Map<string, number>
}) => (
	<div className='flex flex-col gap-3'>
		<div className='flex flex-wrap gap-1.5 justify-center'>
			{TAG_IDS.map((id) => (
				<TagChip
					key={id}
					id={id}
					active={filters.tags.has(id)}
					onToggle={() => onTagToggle(id)}
					count={tagCounts.get(id) ?? 0}
				/>
			))}
		</div>
		<div className='grid gap-2' style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
			{sizes.map((size) => (
				<SizeCell
					key={size}
					size={size}
					constraint={filters.constraints.find((c) => c.size === size) ?? null}
					filteredCount={filteredSizeCounts.get(size) ?? 0}
					onSetOp={(op) => onSetSizeOp(size, op)}
					onUpdateN={(n) => onUpdateSizeN(size, n)}
					W={W}
					H={H}
				/>
			))}
		</div>
	</div>
)

const Plate = ({ W, H, bins }: { W: number; H: number; bins: Bin[] }) => {
	const padding = 20,
		viewBoxWidth = 600,
		viewBoxHeight = 500
	const cell = Math.min((viewBoxWidth - 2 * padding) / W, (viewBoxHeight - 2 * padding) / H)
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

// ── Generic integer codec — TODO: move to @trenaryja/ui/utils ─────────────────
// Layers: alphabet/BigInt (bitsToStr/strToBits) → Elias gamma (encodeIntegers/decodeIntegers) → triangular pairs (triIdx/triInv).

/** Full printable ASCII minus space — 94 chars, most compact for typeable strings. */
export const BASE94 = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)).join('')
/** URL-safe base-64 (no padding) — all chars pass unescaped in query strings. */
export const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
/** Alphanumeric — safe in filenames, HTML ids, and case-sensitive contexts. */
export const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

// TODO: move to @trenaryja/ui/utils
export const bitsToStr = (bits: boolean[], alphabet = BASE94) => {
	const base = BigInt(alphabet.length)
	let n = 1n
	for (const bit of bits) n = (n << 1n) | (bit ? 1n : 0n)
	let result = ''
	while (n > 0n) {
		result = alphabet[Number(n % base)] + result
		n /= base
	}
	return result
}

// TODO: move to @trenaryja/ui/utils
export const strToBits = (str: string, alphabet = BASE94) => {
	const lookup = new Map(alphabet.split('').map((ch, i) => [ch, i]))
	const base = BigInt(alphabet.length)
	let n = 0n
	for (const ch of str) n = n * base + BigInt(lookup.get(ch)!)
	return [...n.toString(2).slice(1)].map((ch) => ch === '1')
}

// Elias gamma: encode n ≥ 1 as ⌊log₂n⌋ leading zeros then n in binary — self-delimiting.
const egPush = (n: number, bits: boolean[]) => {
	const bin = n.toString(2)
	for (let i = 1; i < bin.length; i++) bits.push(false)
	for (const ch of bin) bits.push(ch === '1')
}
const egPop = (bits: boolean[], pos: number): [number, number] => {
	let k = 0
	while (pos + k < bits.length && !bits[pos + k]) k++
	let n = 0
	for (let i = 0; i <= k; i++) n = (n << 1) | (bits[pos + k + i] ? 1 : 0)
	return [n, pos + 2 * k + 1]
}

// TODO: move to @trenaryja/ui/utils
export const encodeIntegers = (values: number[], alphabet = BASE94): string => {
	const bits: boolean[] = []
	for (const v of values) egPush(v, bits)
	return bitsToStr(bits, alphabet)
}

// TODO: move to @trenaryja/ui/utils
export const decodeIntegers = (str: string, alphabet = BASE94): number[] => {
	const bits = strToBits(str, alphabet)
	const values: number[] = []
	let pos = 0
	while (pos < bits.length) {
		const [v, next] = egPop(bits, pos)
		values.push(v)
		pos = next
	}
	return values
}

// TODO: move to @trenaryja/ui/utils
export const triIdx = (a: number, b: number) => ((b - 1) * b) / 2 + (a - 1) // a ≤ b

// TODO: move to @trenaryja/ui/utils
export const triInv = (index: number): [number, number] => {
	const b = Math.floor((1 + Math.sqrt(1 + 8 * index)) / 2)
	return [index - ((b - 1) * b) / 2 + 1, b]
}

// ── Recipe codec ── [W, H, N, idx₁+1, c₁, gap₂, c₂, …, gapₙ]; last count inferred from area.

export const encodeRecipe = (counts: Record<string, number>, W: number, H: number) => {
	const pieces = R.entries(counts)
		.map(([key, count]) => {
			const [w, h] = key.split('×').map(Number)
			return { w, h, count }
		})
		.sort((a, b) => triIdx(a.w, a.h) - triIdx(b.w, b.h))

	const values = [W, H, pieces.length]
	let prevIndex = 0
	for (let i = 0; i < pieces.length; i++) {
		const { w, h, count } = pieces[i]
		const pairIndex = triIdx(w, h)
		values.push(i === 0 ? pairIndex + 1 : pairIndex - prevIndex)
		if (i < pieces.length - 1) values.push(count)
		prevIndex = pairIndex
	}

	return encodeIntegers(values, BASE62)
}

export const decodeRecipe = (encoded: string) => {
	const values = decodeIntegers(encoded, BASE62)
	let pos = 0
	const read = () => values[pos++]

	const W = read()
	const H = read()
	const N = read()
	let remaining = W * H
	const counts: Record<string, number> = {}
	let prevIndex = 0

	for (let i = 0; i < N; i++) {
		const raw = read()
		const pairIndex = i === 0 ? raw - 1 : prevIndex + raw
		const [w, h] = triInv(pairIndex)
		const area = w * h
		const count = i === N - 1 ? Math.floor(remaining / area) : read()
		counts[`${w}×${h}`] = count
		remaining -= count * area
		prevIndex = pairIndex
	}

	return { W, H, counts }
}

const DimensionSliders = ({
	W,
	H,
	onChangeW,
	onChangeH,
}: {
	W: number
	H: number
	onChangeW: (v: number) => void
	onChangeH: (v: number) => void
}) => (
	<section className='grid grid-cols-2 gap-4'>
		<Field label={`Plate width: ${W}`}>
			<Range min={2} max={6} value={W} onChange={(e) => onChangeW(+e.target.value)} />
		</Field>
		<Field label={`Plate depth: ${H}`}>
			<Range min={2} max={6} value={H} onChange={(e) => onChangeH(+e.target.value)} />
		</Field>
	</section>
)

const RecipeStats = ({
	selectedRecipe,
	filteredIndex,
	filteredCount,
	totalPieces,
}: {
	selectedRecipe: Recipe | null
	filteredIndex: number
	filteredCount: number
	totalPieces: number
}) => (
	<div className='stats stats-horizontal w-full *:place-items-center'>
		<div className='stat'>
			<div className='stat-title'>Unique sizes</div>
			<div className='stat-value text-2xl'>{selectedRecipe?.unique ?? '—'}</div>
		</div>
		<div className='stat'>
			<div className='stat-title'>Recipe</div>
			<div className='stat-value text-2xl'>{selectedRecipe ? `${filteredIndex + 1}/${filteredCount}` : '—'}</div>
		</div>
		<div className='stat'>
			<div className='stat-title'>Pieces</div>
			<div className='stat-value text-2xl'>{selectedRecipe ? totalPieces : '—'}</div>
		</div>
	</div>
)

const RecipeList = ({
	filteredRecipes,
	totalCount,
	selectedKey,
	filteredIndex,
	onSelect,
	filtersActive,
	onClearAll,
	filters,
	onToggleSizeConstraint,
	W,
	H,
}: {
	filteredRecipes: Recipe[]
	totalCount: number
	selectedKey: string | null
	filteredIndex: number
	onSelect: (key: string, encoded: string) => void
	filtersActive: boolean
	onClearAll: () => void
	filters: Filters
	onToggleSizeConstraint: (size: string, n: number) => void
	W: number
	H: number
}) => {
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

	// Selected row position changed → keep it visible.
	useEffect(() => {
		if (filteredIndex >= 0) rowVirtualizer.scrollToIndex(filteredIndex, { align: 'auto' })
	}, [filteredIndex, rowVirtualizer])

	return (
		<div className='flex flex-col gap-2'>
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
			<div className='h-[60vh] rounded-box border border-current/10 overflow-hidden'>
				{filteredRecipes.length === 0 ? (
					<div className='size-full flex flex-col items-center justify-center gap-3 text-sm text-base-content/70'>
						<span>No matching recipes.</span>
						<button type='button' className='btn btn-sm' onClick={onClearAll}>
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
								const recipe = filteredRecipes[virtualItem.index]
								const isSelected = recipe.key === selectedKey
								return (
									<li
										key={recipe.key}
										className='absolute top-0 left-0 w-full'
										style={{ transform: `translateY(${virtualItem.start}px)` }}
									>
										<button
											type='button'
											onClick={() => onSelect(recipe.key, encodeRecipe(recipe.counts, W, H))}
											className={isSelected ? 'menu-active' : ''}
										>
											<span className='opacity-50 font-mono whitespace-pre'>
												{encodeRecipe(recipe.counts, W, H).padStart(9)}
											</span>
											<div className='flex flex-wrap items-center gap-2'>
												{R.sort(R.entries(recipe.counts), (a, b) => byFamily(a[0], b[0])).map(([size, count]) => {
													const pinned = filters.constraints.some((c) => sameConstraint(c, { size, op: '=', n: count }))
													return (
														<button
															key={size}
															type='button'
															onClick={(e) => {
																e.stopPropagation()
																onToggleSizeConstraint(size, count)
															}}
															className={`relative badge badge-lg ${pinned ? 'badge-primary' : 'badge-soft'} gap-1 tabular-nums cursor-pointer`}
														>
															<span>{size}</span>
															{count > 1 && (
																<span className='absolute -top-2 -right-2 badge badge-xs border border-current/10 px-1'>
																	{count}
																</span>
															)}
														</button>
													)
												})}
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
		</div>
	)
}

const Root = () => {
	const [compactId, setCompactId] = useQueryState('id', parseAsString)
	const [W, setW] = useState(() => {
		if (!compactId) return 6
		try {
			return decodeRecipe(compactId).W
		} catch {
			return 6
		}
	})
	const [H, setH] = useState(() => {
		if (!compactId) return 5
		try {
			return decodeRecipe(compactId).H
		} catch {
			return 5
		}
	})
	const [recipes, setRecipes] = useState<Recipe[]>([])
	const [selectedKey, setSelectedKey] = useState<string | null>(null)
	const [filters, setFilters] = useState<Filters>(emptyFilters)
	// Captured once at mount; cleared after the first solve so W/H slider changes don't re-restore.
	const restoreIdRef = useRef<string | null>(compactId)

	useEffect(() => {
		const sorted = sortRecipes(solve({ W, H }))
		setRecipes(sorted)

		const restoreId = restoreIdRef.current
		restoreIdRef.current = null

		let keyToSelect: string | null = null
		if (restoreId) {
			try {
				const { counts } = decodeRecipe(restoreId)
				const targetKey = R.entries(counts)
					.map(([k, v]) => `${k}:${v}`)
					.sort()
					.join('|')
				keyToSelect = sorted.find((r) => r.key === targetKey)?.key ?? null
			} catch {}
		}

		setSelectedKey(keyToSelect ?? sorted[0]?.key ?? null)
		const valid = new Set(availableSizes(W, H))
		setFilters((f) => ({ tags: f.tags, constraints: f.constraints.filter((c) => valid.has(c.size)) }))
	}, [W, H])

	const plateSizes = availableSizes(W, H)
	const filteredRecipes = recipes.filter((r) => matchesFilter(r, filters))
	const filteredIndex = selectedKey ? filteredRecipes.findIndex((r) => r.key === selectedKey) : -1
	const selectedRecipe = filteredIndex >= 0 ? filteredRecipes[filteredIndex] : null
	const layout = selectedRecipe?.layout ?? []
	const totalPieces = selectedRecipe ? R.sum(R.values(selectedRecipe.counts)) : 0
	const filtersActive = filters.tags.size > 0 || filters.constraints.length > 0

	// Per-tag and per-size counts in the filtered set — drive count badges and disabled states.
	const tagCounts = new Map<TagId, number>(TAG_IDS.map((id) => [id, 0]))
	for (const recipe of filteredRecipes) for (const tag of recipe.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
	const filteredSizeCounts = new Map<string, number>()
	for (const recipe of filteredRecipes)
		for (const size of R.keys(recipe.counts)) filteredSizeCounts.set(size, (filteredSizeCounts.get(size) ?? 0) + 1)

	// Filter change excluded the selected recipe → drop the selection (empty plate).
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

	const toggleSizeConstraint = (size: string, n: number) =>
		setFilters((f) => {
			const target = { size, op: '=' as const, n }
			const existingIndex = f.constraints.findIndex((c) => sameConstraint(c, target))
			if (existingIndex >= 0) return { ...f, constraints: f.constraints.filter((_, i) => i !== existingIndex) }
			return { ...f, constraints: [...f.constraints, target] }
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
			return { ...f, constraints: dedupeConstraints([...f.constraints, { size, op, n: op === 'exclude' ? 0 : 1 }]) }
		})

	const updateSizeN = (size: string, n: number) =>
		setFilters((f) => ({ ...f, constraints: f.constraints.map((c) => (c.size === size ? { ...c, n } : c)) }))

	return (
		<ThemeProvider>
			<main className='flex flex-col gap-6 p-8 items-center'>
				<div className='flex gap-2'>
					<h1 className='text-2xl font-medium'>Grid-fill</h1>
					<ThemePicker variant='popover' />
				</div>

				<div className='flex flex-wrap gap-8 items-start w-full'>
					<div className='flex flex-col gap-4 flex-1 min-w-72'>
						<DimensionSliders
							W={W}
							H={H}
							onChangeW={(v) => {
								setW(v)
								setCompactId(null)
							}}
							onChangeH={(v) => {
								setH(v)
								setCompactId(null)
							}}
						/>
						<RecipeStats
							selectedRecipe={selectedRecipe}
							filteredIndex={filteredIndex}
							filteredCount={filteredRecipes.length}
							totalPieces={totalPieces}
						/>
						<Plate W={W} H={H} bins={layout} />
						<ExportButton recipe={selectedRecipe} W={W} H={H} />
					</div>

					<div className='flex flex-col gap-4 flex-1 min-w-72'>
						<FilterMatrixPanel
							sizes={plateSizes}
							filters={filters}
							W={W}
							H={H}
							onTagToggle={toggleTag}
							onSetSizeOp={setSizeConstraint}
							onUpdateSizeN={updateSizeN}
							tagCounts={tagCounts}
							filteredSizeCounts={filteredSizeCounts}
						/>
					</div>

					<div className='flex flex-col gap-4 flex-1 min-w-72'>
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
							onToggleSizeConstraint={toggleSizeConstraint}
							W={W}
							H={H}
						/>
					</div>
				</div>
			</main>
		</ThemeProvider>
	)
}

if (typeof document !== 'undefined')
	createRoot(document.getElementById('root')!).render(
		<NuqsAdapter>
			<Root />
		</NuqsAdapter>,
	)
