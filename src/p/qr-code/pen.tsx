import { useDebouncedValue } from 'https://esm.sh/@mantine/hooks'
import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { select } from 'https://esm.sh/d3-selection'
import QRCode from 'https://esm.sh/qrcode'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

const CELL = 10

const ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const

type EccLevel = (typeof ECC_LEVELS)[number]

const capacityCache = new Map<string, number>()

/**
 * Capacity is a pure function of (version, ecc, mode) — cache so each combo only probes once.
 * There are only 4 × 40 × 3 = 480 unique combos, so this could be fully pre-computed and
 * exported as a static nested object (ecc → mode → version[]) for O(1) lookups with no runtime
 * cost — preferable if this moves to a library.
 */
const probeCapacity = (version: number, ecc: EccLevel, modeId: string): number =>
	capacityCache.getOrInsertComputed(`${version}:${ecc}:${modeId}`, () => {
		const ch = modeId === 'Numeric' ? '1' : modeId === 'Alphanumeric' ? 'A' : 'x'
		let hi = 7090
		let lo = 1

		while (lo < hi) {
			const mid = Math.floor((lo + hi + 1) / 2)

			try {
				if (QRCode.create(ch.repeat(mid), { errorCorrectionLevel: ecc }).version <= version) lo = mid
				else hi = mid - 1
			} catch {
				hi = mid - 1
			}
		}

		return lo
	})

const optimizeForQR = (raw: string): string => {
	try {
		const url = new URL(raw)
		const ux = (s: string) => s.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
		const scheme = url.protocol.slice(0, -1).toUpperCase()
		const host = url.hostname.toUpperCase()
		const port = url.port ? `:${url.port}` : ''

		return `${scheme}://${host}${port}${ux(url.pathname)}${ux(url.search)}${ux(url.hash)}`
	} catch {
		return raw
	}
}

type Seg = { mode: { id: string }; data: string }

const getQRInfo = (text: string, ecc: EccLevel) => {
	try {
		const qr = QRCode.create(text, { errorCorrectionLevel: ecc })
		const modeIds = [...new Set((qr.segments as unknown as Seg[]).map((s) => s.mode.id))]
		const mode = modeIds.length === 1 ? modeIds[0] : 'Mixed'
		const capacity = mode !== 'Mixed' ? probeCapacity(qr.version, ecc, mode) : null

		return { version: qr.version, n: qr.modules.size, mode, capacity }
	} catch {
		return null
	}
}

type ModuleType = 'alignment' | 'data' | 'finder' | 'timing'

type StyleName = 'blob' | 'classic' | 'halftone' | 'hex' | 'isometric'

type Cell = {
	col: number
	dark: boolean
	darkNeighbors: number
	row: number
	type: ModuleType
}

const DIRS: [number, number][] = [
	[-1, -1],
	[-1, 0],
	[-1, 1],
	[0, -1],
	[0, 1],
	[1, -1],
	[1, 0],
	[1, 1],
]

// biome-ignore lint/suspicious/noExplicitAny: qrcode library lacks exported types
const classifyCells = (qr: any): Cell[][] => {
	const n = qr.modules.size
	const { data } = qr.modules
	const reserved: Uint8Array = qr.modules.reservedBit
	const grid: Cell[][] = Array.from({ length: n }, (_r, row) =>
		Array.from({ length: n }, (_c, col) => {
			const dark = !!data[row * n + col]
			let type: ModuleType = 'data'

			if (reserved[row * n + col]) {
				const inFinder = (row < 8 && col < 8) || (row < 8 && col >= n - 8) || (row >= n - 8 && col < 8)

				type = inFinder ? 'finder' : row === 6 || col === 6 ? 'timing' : 'alignment'
			}

			return { row, col, dark, type, darkNeighbors: 0 }
		}),
	)

	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			grid[r][c].darkNeighbors = DIRS.filter(
				([dr, dc]) => r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n && grid[r + dr][c + dc].dark,
			).length
		}
	}

	return grid
}

// biome-ignore lint/suspicious/noExplicitAny: d3 selection type is complex and not worth narrowing here
const finderEyes = (svg: any, n: number) => {
	const g = svg.append('g')

	for (const [row, col] of [
		[3.5, 3.5],
		[3.5, n - 3.5],
		[n - 3.5, 3.5],
	]) {
		const cx = col * CELL
		const cy = row * CELL

		g.append('circle')
			.attr('cx', cx)
			.attr('cy', cy)
			.attr('r', 3.5 * CELL)
			.attr('fill', 'currentColor')
		g.append('circle')
			.attr('cx', cx)
			.attr('cy', cy)
			.attr('r', 2.5 * CELL)
			.attr('fill', 'var(--color-base-100, white)')
		g.append('circle')
			.attr('cx', cx)
			.attr('cy', cy)
			.attr('r', 1.5 * CELL)
			.attr('fill', 'currentColor')
	}
}

type ParamSpec = {
	default: number
	label: string
	max: number
	min: number
	step: number
}

type P = Record<string, number>

const PARAM_SPECS: Partial<Record<StyleName, Record<string, ParamSpec>>> = {
	blob: {
		blur: { label: 'Blur', min: 0.05, max: 1.5, step: 0.05, default: 0.45 },
		threshold: { label: 'Threshold', min: 5, max: 50, step: 1, default: 50 },
	},
	halftone: {
		minR: { label: 'Min size', min: 0, max: 1, step: 0.01, default: 0.1 },
		range: { label: 'Range', min: 0, max: 1, step: 0.01, default: 0.6 },
	},
	isometric: {
		depth: { label: 'Depth', min: 0, max: 1, step: 0.05, default: 0.5 },
	},
	hex: {
		radius: { label: 'Hex radius', min: 0.2, max: 0.9, step: 0.01, default: 0.45 },
	},
}

// biome-ignore lint/suspicious/noExplicitAny: d3 selection type is complex and not worth narrowing here
type RenderArgs = { cells: Cell[][]; n: number; p: P; svg: any }

const renderClassic = ({ svg, cells }: RenderArgs) => {
	svg
		.selectAll('rect')
		.data(cells.flat().filter((c: Cell) => c.dark))
		.join('rect')
		.attr('x', (c: Cell) => c.col * CELL)
		.attr('y', (c: Cell) => c.row * CELL)
		.attr('width', CELL)
		.attr('height', CELL)
		.attr('fill', 'currentColor')
}

const renderBlob = ({ svg, cells, n, p }: RenderArgs) => {
	const f = svg
		.append('defs')
		.append('filter')
		.attr('id', 'mb')
		.attr('x', '-10%')
		.attr('y', '-10%')
		.attr('width', '120%')
		.attr('height', '120%')

	f.append('feGaussianBlur')
		.attr('in', 'SourceGraphic')
		.attr('stdDeviation', CELL * p.blur)
		.attr('result', 'blur')
	f.append('feColorMatrix')
		.attr('in', 'blur')
		.attr('mode', 'matrix')
		.attr('values', `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${p.threshold} ${-p.threshold / 2}`)

	svg
		.append('g')
		.attr('filter', 'url(#mb)')
		.selectAll('circle')
		.data(cells.flat().filter((c: Cell) => c.dark && c.type !== 'finder'))
		.join('circle')
		.attr('cx', (c: Cell) => (c.col + 0.5) * CELL)
		.attr('cy', (c: Cell) => (c.row + 0.5) * CELL)
		.attr('r', CELL * 0.56)
		.attr('fill', 'currentColor')

	finderEyes(svg, n)
}

const renderHalftone = ({ svg, cells, n, p }: RenderArgs) => {
	finderEyes(svg, n)

	svg
		.append('g')
		.selectAll('circle')
		.data(cells.flat().filter((c: Cell) => c.dark && c.type !== 'finder'))
		.join('circle')
		.attr('cx', (c: Cell) => (c.col + 0.5) * CELL)
		.attr('cy', (c: Cell) => (c.row + 0.5) * CELL)
		.attr('r', (c: Cell) => CELL * (p.minR + p.range * (c.darkNeighbors / 8)))
		.attr('fill', 'currentColor')
}

const renderIsometric = ({ svg, cells, n, p }: RenderArgs) => {
	const h = CELL * p.depth
	const dark = cells.flat().filter((c: Cell) => c.dark)
	// Only draw a face when it's exposed — no dark neighbor occluding it
	const bottomFaces = dark.filter((c: Cell) => c.row + 1 >= n || !cells[c.row + 1][c.col].dark)
	const rightFaces = dark.filter((c: Cell) => c.col + 1 >= n || !cells[c.row][c.col + 1].dark)
	const pts = {
		bottom: (c: Cell) => {
			const x = c.col * CELL
			const y = c.row * CELL

			return `${x},${y + CELL} ${x + h},${y + CELL + h} ${x + CELL + h},${y + CELL + h} ${x + CELL},${y + CELL}`
		},
		right: (c: Cell) => {
			const x = c.col * CELL
			const y = c.row * CELL

			return `${x + CELL},${y} ${x + CELL + h},${y + h} ${x + CELL + h},${y + CELL + h} ${x + CELL},${y + CELL}`
		},
	}

	svg
		.append('g')
		.attr('opacity', 0.4)
		.selectAll('polygon')
		.data(bottomFaces)
		.join('polygon')
		.attr('points', pts.bottom)
		.attr('fill', 'currentColor')

	svg
		.append('g')
		.attr('opacity', 0.6)
		.selectAll('polygon')
		.data(rightFaces)
		.join('polygon')
		.attr('points', pts.right)
		.attr('fill', 'currentColor')

	svg
		.append('g')
		.selectAll('rect')
		.data(dark)
		.join('rect')
		.attr('x', (c: Cell) => c.col * CELL)
		.attr('y', (c: Cell) => c.row * CELL)
		.attr('width', CELL)
		.attr('height', CELL)
		.attr('fill', 'currentColor')
}

const renderHex = ({ svg, cells, n, p }: RenderArgs) => {
	// True honeycomb: lay a pointy-top hex grid over the QR area.
	// Each hex samples the QR module at its center — dark hex if that module is dark.
	// Scannable when r < CELL/2 (hex center guaranteed within the same module cell).
	const r = CELL * p.radius
	const colPitch = Math.sqrt(3) * r
	const rowPitch = 1.5 * r
	const numCols = Math.ceil((n * CELL) / colPitch) + 2
	const numRows = Math.ceil((n * CELL) / rowPitch) + 2
	const dark: [number, number][] = []
	const W = n * CELL

	for (let hr = 0; hr < numRows; hr++) {
		const cy = r + hr * rowPitch

		if (cy > W + r) break

		const rowOffset = (hr % 2) * 0.5

		for (let hc = -1; hc <= numCols; hc++) {
			const cx = (hc + 0.5 + rowOffset) * colPitch

			if (cy - r < 0 || cy + r > W || cx - colPitch / 2 < 0 || cx + colPitch / 2 > W) continue

			const qc = Math.floor(cx / CELL)
			const qr = Math.floor(cy / CELL)

			if (qc >= 0 && qc < n && qr >= 0 && qr < n && cells[qr][qc].dark) dark.push([cx, cy])
		}
	}

	svg
		.append('g')
		.selectAll('polygon')
		.data(dark)
		.join('polygon')
		.attr('points', ([cx, cy]: [number, number]) =>
			Array.from({ length: 6 }, (_, i) => {
				const a = (i * Math.PI) / 3 - Math.PI / 2
				return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
			}).join(' '),
		)
		.attr('fill', 'currentColor')
}

const STYLES: StyleName[] = ['classic', 'blob', 'halftone', 'isometric', 'hex']

type Renderer = (args: RenderArgs) => void

const RENDERERS: Record<StyleName, Renderer> = {
	classic: renderClassic,
	blob: renderBlob,
	halftone: renderHalftone,
	isometric: renderIsometric,
	hex: renderHex,
}

const ECC_LABELS: Record<EccLevel, string> = { L: '7%', M: '15%', Q: '25%', H: '30%' }

type RenderConfig = { ecc: EccLevel; params: Record<StyleName, P>; style: StyleName }

const renderQR = (el: SVGSVGElement, src: string, config: RenderConfig) => {
	const { ecc, style, params } = config
	const qr = QRCode.create(src, { errorCorrectionLevel: ecc })
	const n = qr.modules.size
	const p = params[style]
	const pad = style === 'isometric' ? CELL * (p.depth ?? 0.5) : 0
	const svg = select(el)
		.attr('width', n * CELL + pad)
		.attr('height', n * CELL + pad)

	svg.selectAll('*').remove()
	svg
		.append('rect')
		.attr('width', n * CELL + pad)
		.attr('height', n * CELL + pad)
		.attr('fill', 'var(--color-base-100, white)')
	RENDERERS[style]({ svg, cells: classifyCells(qr), n, p })
}

type SliderProps = {
	params: Record<StyleName, P>
	setParam: (key: string, val: number) => void
	style: StyleName
	styleParams: Record<string, ParamSpec>
}

const Sliders = ({ styleParams, params, style, setParam }: SliderProps) => {
	if (!Object.keys(styleParams).length) return null

	return (
		<div className='flex flex-col gap-2 w-full max-w-xs'>
			{Object.entries(styleParams).map(([key, spec]) => (
				<label key={key} className='flex items-center gap-3'>
					<span className='text-sm opacity-60 w-28 shrink-0'>{spec.label}</span>
					<input
						type='range'
						className='range range-sm flex-1'
						min={spec.min}
						max={spec.max}
						step={spec.step}
						value={params[style][key]}
						onChange={(e) => setParam(key, +e.target.value)}
					/>
					<span className='font-mono text-xs w-10 text-right tabular-nums'>
						{params[style][key].toFixed(spec.step >= 1 ? 0 : 2)}
					</span>
				</label>
			))}
		</div>
	)
}

type StatsPanelProps = { capacity: number | null; charCount: number; n: number; version: number }

const StatsPanel = ({ version, n, charCount, capacity }: StatsPanelProps) => (
	<div className='stats stats-vertical sm:stats-horizontal shadow'>
		<div className='stat'>
			<div className='stat-title'>Version</div>
			<div className='stat-value'>{version}</div>
			<div className='stat-desc'>
				{n} × {n} modules
			</div>
		</div>
		<div className='stat'>
			<div className='stat-title'>Capacity</div>
			<div className='stat-value'>
				{charCount}
				{capacity !== null && <span className='text-lg font-normal opacity-40'>/{capacity}</span>}
			</div>
			<div className='stat-desc'>
				{capacity !== null ? `${capacity - charCount} chars remaining` : 'mixed mode — varies by segment'}
			</div>
		</div>
	</div>
)

const Root = () => {
	const [text, setText] = useState('https://example.com')
	const [undoText, setUndoText] = useState<string | null>(null)
	const [style, setStyle] = useState<StyleName>('classic')
	const [ecc, setEcc] = useState<EccLevel>('L')
	const [params, setParams] = useState<Record<StyleName, P>>({
		classic: {},
		blob: { blur: 0.45, threshold: 50 },
		halftone: { minR: 0.1, range: 0.6 },
		isometric: { depth: 0.5 },
		hex: { radius: 0.45 },
	})
	const svgRef = useRef<SVGSVGElement>(null)
	const svgOptRef = useRef<SVGSVGElement>(null)
	const [debouncedText] = useDebouncedValue(text, 250)
	const textInfo = getQRInfo(debouncedText, ecc)
	const optText = optimizeForQR(debouncedText)
	const optInfo = getQRInfo(optText, ecc)
	const canOptimize = optText !== debouncedText && !!textInfo && !!optInfo && optInfo.version < textInfo.version
	const setParam = (key: string, val: number) => setParams((p) => ({ ...p, [style]: { ...p[style], [key]: val } }))

	const applyOptimize = () => {
		setUndoText(text)
		setText(optText)
	}

	useEffect(() => {
		if (svgRef.current && debouncedText) renderQR(svgRef.current, debouncedText, { ecc, style, params })
	}, [debouncedText, ecc, style, params])

	useEffect(() => {
		if (svgOptRef.current && canOptimize) renderQR(svgOptRef.current, optText, { ecc, style, params })
	}, [optText, canOptimize, ecc, style, params])

	return (
		<ThemeProvider>
			<main className='min-h-screen grid content-center place-items-center gap-8 p-10'>
				<div className='join'>
					<input
						className='input join-item'
						type='url'
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder='Enter URL'
					/>
					{undoText && (
						<button
							type='button'
							className='btn join-item'
							onClick={() => {
								setText(undoText)
								setUndoText(null)
							}}
						>
							Undo
						</button>
					)}
				</div>

				<div className='join flex-wrap justify-center'>
					{STYLES.map((s) => (
						<button
							key={s}
							type='button'
							className={`btn join-item btn-sm capitalize ${style === s ? 'btn-active' : ''}`}
							onClick={() => setStyle(s)}
						>
							{s}
						</button>
					))}
				</div>

				<div className='join'>
					{ECC_LEVELS.map((lvl) => (
						<button
							key={lvl}
							type='button'
							title={`ECC ${lvl} — recovers up to ${ECC_LABELS[lvl]} damage`}
							className={`btn join-item btn-sm ${ecc === lvl ? 'btn-active' : ''}`}
							onClick={() => setEcc(lvl)}
						>
							{lvl}
						</button>
					))}
				</div>

				<Sliders styleParams={PARAM_SPECS[style] ?? {}} params={params} style={style} setParam={setParam} />

				{textInfo && (
					<>
						<div className={`flex gap-8 items-start ${canOptimize ? 'flex-row' : 'flex-col items-center'}`}>
							<div className='flex flex-col items-center gap-2'>
								<svg ref={svgRef} className='shadow' />
								{canOptimize && <span className='text-xs opacity-40 font-mono truncate max-w-40'>{debouncedText}</span>}
							</div>
							{canOptimize && optInfo && (
								<div className='flex flex-col items-center gap-2'>
									<svg ref={svgOptRef} className='shadow' />
									<span className='text-xs opacity-40 font-mono truncate max-w-40'>{optText}</span>
									<button type='button' className='btn btn-success btn-xs' onClick={applyOptimize}>
										Apply · {optInfo.mode} v{optInfo.version}
									</button>
								</div>
							)}
						</div>
						<StatsPanel
							version={textInfo.version}
							n={textInfo.n}
							charCount={debouncedText.length}
							capacity={textInfo.capacity}
						/>
					</>
				)}
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
