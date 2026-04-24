import { Field, Range, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { useEffect, useState } from 'https://esm.sh/react'
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
type Recipe = { key: string; counts: Record<string, number>; unique: number; layout: Bin[] }
type SolveOpts = { W: number; H: number }

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
			if (w === W && h === H) continue
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
			found.push({ key: recipeKeyOf(counts), counts: countsObj, unique: uniqueCount, layout })
		}
	}
	return found
}

// Recipe order: fewest pieces first, then lex on family-ordered count vector (ascending, so
// recipes with fewer small pieces float up within each count group).
const sortRecipes = (recipes: Recipe[]) => {
	const allKeys = R.pipe(
		recipes,
		R.flatMap((x) => R.keys(x.counts)),
		R.unique(),
		R.sort(byFamily),
	)
	return R.sortBy(
		recipes,
		(x) => R.sum(R.values(x.counts)),
		...allKeys.map((size) => (x: Recipe) => x.counts[size] ?? 0),
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

const Root = () => {
	const [W, setW] = useState(6)
	const [H, setH] = useState(5)
	const [recipes, setRecipes] = useState<Recipe[]>([])
	const [recipeIdx, setRecipeIdx] = useState(0)

	useEffect(() => {
		setRecipes(sortRecipes(solve({ W, H })))
		setRecipeIdx(0)
	}, [W, H])

	const selectedRecipe = recipes[recipeIdx]
	const layout = selectedRecipe?.layout ?? []
	const totalPieces = selectedRecipe ? R.sum(R.values(selectedRecipe.counts)) : 0

	return (
		<ThemeProvider>
			<main className='full-bleed-container p-8 gap-y-4 place-items-center'>
				<div className='flex gap-2'>
					<h1 className='text-2xl font-medium mb-6'>Grid-fill</h1>
					<ThemePicker variant='popover' />
				</div>

				<section className='grid grid-cols-2 gap-4 w-full'>
					<Field label={`Plate width: ${W}`}>
						<Range min={3} max={6} value={W} onChange={(e) => setW(+e.target.value)} />
					</Field>
					<Field label={`Plate depth: ${H}`}>
						<Range min={3} max={6} value={H} onChange={(e) => setH(+e.target.value)} />
					</Field>
				</section>

				<div className='stats stats-horizontal w-full *:place-items-center'>
					<div className='stat'>
						<div className='stat-title'>Unique sizes</div>
						<div className='stat-value text-2xl'>{selectedRecipe?.unique ?? '—'}</div>
					</div>
					<div className='stat'>
						<div className='stat-title'>Recipe</div>
						<div className='stat-value text-2xl'>{recipes.length ? `${recipeIdx + 1}/${recipes.length}` : '—'}</div>
					</div>
					<div className='stat'>
						<div className='stat-title'>Pieces</div>
						<div className='stat-value text-2xl'>{selectedRecipe ? totalPieces : '—'}</div>
					</div>
				</div>

				<Plate W={W} H={H} bins={layout} />

				<ul className='menu menu-sm max-h-80 flex-nowrap overflow-y-fade'>
					{recipes.map((recipe, i) => (
						<li key={recipe.key}>
							<button type='button' onClick={() => setRecipeIdx(i)} className={i === recipeIdx ? 'menu-active' : ''}>
								<span className='opacity-50 tabular-nums'>{`${i + 1}`.padStart(`${recipes.length}`.length, ' ')}.</span>
								<div className='flex flex-wrap gap-2'>
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
								</div>
							</button>
						</li>
					))}
				</ul>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
