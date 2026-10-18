import { useDebouncedValue } from 'https://esm.sh/@mantine/hooks'
import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { select, type Selection } from 'https://esm.sh/d3-selection'
import QRCode, { type BitMatrix, type ModeId } from 'https://esm.sh/qrcode'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'

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
const probeCapacity = (version: number, ecc: EccLevel, modeId: ModeId) =>
	capacityCache.getOrInsertComputed(`${version}:${ecc}:${modeId}`, () => {
		const sampleChar = modeId === 'Numeric' ? '1' : modeId === 'Alphanumeric' ? 'A' : 'x'
		let high = 7090
		let low = 1

		while (low < high) {
			const middle = Math.floor((low + high + 1) / 2)

			try {
				if (QRCode.create(sampleChar.repeat(middle), { errorCorrectionLevel: ecc }).version <= version) low = middle
				else high = middle - 1
			} catch {
				high = middle - 1
			}
		}

		return low
	})

const optimizeForQR = (raw: string) => {
	try {
		const url = new URL(raw)
		// Uppercasing percent-escapes lets more of the URL encode in QR's alphanumeric mode.
		const upperEscapes = (text: string) => text.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase())
		const scheme = url.protocol.slice(0, -1).toUpperCase()
		const host = url.hostname.toUpperCase()
		const port = url.port ? `:${url.port}` : ''

		return `${scheme}://${host}${port}${upperEscapes(url.pathname)}${upperEscapes(url.search)}${upperEscapes(url.hash)}`
	} catch {
		return raw
	}
}

const getQRInfo = (text: string, ecc: EccLevel) => {
	try {
		const qr = QRCode.create(text, { errorCorrectionLevel: ecc })
		const [firstMode, ...otherModes] = qr.segments.map((segment) => segment.mode.id)
		const mode = firstMode && otherModes.every((modeId) => modeId === firstMode) ? firstMode : 'Mixed'
		const capacity = mode !== 'Mixed' ? probeCapacity(qr.version, ecc, mode) : null

		return { version: qr.version, moduleCount: qr.modules.size, mode, capacity }
	} catch {
		return null
	}
}

type ModuleType = 'alignment' | 'data' | 'finder' | 'timing'

const STYLES = ['classic', 'blob', 'halftone', 'isometric', 'hex'] as const

type StyleName = (typeof STYLES)[number]

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

const classifyCells = ({ size: moduleCount, data, reservedBit }: BitMatrix): Cell[][] => {
	const isDark = (row: number, col: number) =>
		row >= 0 && row < moduleCount && col >= 0 && col < moduleCount && !!data[row * moduleCount + col]

	return Array.from({ length: moduleCount }, (_r, row) =>
		Array.from({ length: moduleCount }, (_c, col) => {
			let type: ModuleType = 'data'

			if (reservedBit[row * moduleCount + col]) {
				const inFinder =
					(row < 8 && col < 8) || (row < 8 && col >= moduleCount - 8) || (row >= moduleCount - 8 && col < 8)

				type = inFinder ? 'finder' : row === 6 || col === 6 ? 'timing' : 'alignment'
			}

			const darkNeighbors = DIRS.filter(([dy, dx]) => isDark(row + dy, col + dx)).length
			return { row, col, dark: isDark(row, col), type, darkNeighbors }
		}),
	)
}

type Svg = Selection<SVGSVGElement, unknown, null, undefined>

const finderEyes = (svg: Svg, moduleCount: number) => {
	const group = svg.append('g')

	for (const [row, col] of [
		[3.5, 3.5],
		[3.5, moduleCount - 3.5],
		[moduleCount - 3.5, 3.5],
	] as const) {
		const cx = col * CELL
		const cy = row * CELL

		group
			.append('circle')
			.attr('cx', cx)
			.attr('cy', cy)
			.attr('r', 3.5 * CELL)
			.attr('fill', 'currentColor')
		group
			.append('circle')
			.attr('cx', cx)
			.attr('cy', cy)
			.attr('r', 2.5 * CELL)
			.attr('fill', 'var(--color-base-100, white)')
		group
			.append('circle')
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
	style: StyleName
}

const PARAM_SPECS = {
	blur: { style: 'blob', label: 'Blur', min: 0.05, max: 1.5, step: 0.05, default: 0.45 },
	threshold: { style: 'blob', label: 'Threshold', min: 5, max: 50, step: 1, default: 50 },
	minR: { style: 'halftone', label: 'Min size', min: 0, max: 1, step: 0.01, default: 0.1 },
	range: { style: 'halftone', label: 'Range', min: 0, max: 1, step: 0.01, default: 0.6 },
	depth: { style: 'isometric', label: 'Depth', min: 0, max: 1, step: 0.05, default: 0.5 },
	radius: { style: 'hex', label: 'Hex radius', min: 0.2, max: 0.9, step: 0.01, default: 0.45 },
} as const satisfies Record<string, ParamSpec>

type ParamName = keyof typeof PARAM_SPECS

type Params = Record<ParamName, number>

type RenderArgs = { cells: Cell[][]; moduleCount: number; params: Params; svg: Svg }

const renderClassic = ({ svg, cells }: RenderArgs) => {
	svg
		.append('g')
		.selectAll('rect')
		.data(cells.flat().filter((cell) => cell.dark))
		.join('rect')
		.attr('x', (cell) => cell.col * CELL)
		.attr('y', (cell) => cell.row * CELL)
		.attr('width', CELL)
		.attr('height', CELL)
		.attr('fill', 'currentColor')
}

const renderBlob = ({ svg, cells, moduleCount, params }: RenderArgs) => {
	const filter = svg
		.append('defs')
		.append('filter')
		.attr('id', 'mb')
		.attr('x', '-10%')
		.attr('y', '-10%')
		.attr('width', '120%')
		.attr('height', '120%')

	filter
		.append('feGaussianBlur')
		.attr('in', 'SourceGraphic')
		.attr('stdDeviation', CELL * params.blur)
		.attr('result', 'blur')
	filter
		.append('feColorMatrix')
		.attr('in', 'blur')
		.attr('mode', 'matrix')
		.attr('values', `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${params.threshold} ${-params.threshold / 2}`)

	svg
		.append('g')
		.attr('filter', 'url(#mb)')
		.selectAll('circle')
		.data(cells.flat().filter((cell) => cell.dark && cell.type !== 'finder'))
		.join('circle')
		.attr('cx', (cell) => (cell.col + 0.5) * CELL)
		.attr('cy', (cell) => (cell.row + 0.5) * CELL)
		.attr('r', CELL * 0.56)
		.attr('fill', 'currentColor')

	finderEyes(svg, moduleCount)
}

const renderHalftone = ({ svg, cells, moduleCount, params }: RenderArgs) => {
	finderEyes(svg, moduleCount)

	svg
		.append('g')
		.selectAll('circle')
		.data(cells.flat().filter((cell) => cell.dark && cell.type !== 'finder'))
		.join('circle')
		.attr('cx', (cell) => (cell.col + 0.5) * CELL)
		.attr('cy', (cell) => (cell.row + 0.5) * CELL)
		.attr('r', (cell) => CELL * (params.minR + params.range * (cell.darkNeighbors / 8)))
		.attr('fill', 'currentColor')
}

const renderIsometric = ({ svg, cells, params }: RenderArgs) => {
	const h = CELL * params.depth
	const dark = cells.flat().filter((cell) => cell.dark)
	// Only draw a face when it's exposed — no dark neighbor occluding it
	const bottomFaces = dark.filter((cell) => !cells[cell.row + 1]?.[cell.col]?.dark)
	const rightFaces = dark.filter((cell) => !cells[cell.row]?.[cell.col + 1]?.dark)

	svg
		.append('g')
		.attr('opacity', 0.4)
		.selectAll('polygon')
		.data(bottomFaces)
		.join('polygon')
		.attr('points', ({ col, row }) => {
			const x = col * CELL
			const y = row * CELL
			return `${x},${y + CELL} ${x + h},${y + CELL + h} ${x + CELL + h},${y + CELL + h} ${x + CELL},${y + CELL}`
		})
		.attr('fill', 'currentColor')

	svg
		.append('g')
		.attr('opacity', 0.6)
		.selectAll('polygon')
		.data(rightFaces)
		.join('polygon')
		.attr('points', ({ col, row }) => {
			const x = col * CELL
			const y = row * CELL
			return `${x + CELL},${y} ${x + CELL + h},${y + h} ${x + CELL + h},${y + CELL + h} ${x + CELL},${y + CELL}`
		})
		.attr('fill', 'currentColor')

	svg
		.append('g')
		.selectAll('rect')
		.data(dark)
		.join('rect')
		.attr('x', (cell) => cell.col * CELL)
		.attr('y', (cell) => cell.row * CELL)
		.attr('width', CELL)
		.attr('height', CELL)
		.attr('fill', 'currentColor')
}

const renderHex = ({ svg, cells, moduleCount, params }: RenderArgs) => {
	// True honeycomb: lay a pointy-top hex grid over the QR area.
	// Each hex samples the QR module at its center — dark hex if that module is dark.
	// Scannable when r < CELL/2 (hex center guaranteed within the same module cell).
	const r = CELL * params.radius
	const colPitch = Math.sqrt(3) * r
	const rowPitch = 1.5 * r
	const numCols = Math.ceil((moduleCount * CELL) / colPitch) + 2
	const numRows = Math.ceil((moduleCount * CELL) / rowPitch) + 2
	const dark: [number, number][] = []
	const W = moduleCount * CELL

	for (let hr = 0; hr < numRows; hr++) {
		const cy = r + hr * rowPitch

		if (cy > W + r) break

		const rowOffset = (hr % 2) * 0.5

		for (let hc = -1; hc <= numCols; hc++) {
			const cx = (hc + 0.5 + rowOffset) * colPitch

			if (cy - r < 0 || cy + r > W || cx - colPitch / 2 < 0 || cx + colPitch / 2 > W) continue

			if (cells[Math.floor(cy / CELL)]?.[Math.floor(cx / CELL)]?.dark) dark.push([cx, cy])
		}
	}

	svg
		.append('g')
		.selectAll('polygon')
		.data(dark)
		.join('polygon')
		.attr('points', ([cx, cy]) =>
			Array.from({ length: 6 }, (_, i) => {
				const a = (i * Math.PI) / 3 - Math.PI / 2
				return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
			}).join(' '),
		)
		.attr('fill', 'currentColor')
}

type Renderer = (args: RenderArgs) => void

const RENDERERS: Record<StyleName, Renderer> = {
	classic: renderClassic,
	blob: renderBlob,
	halftone: renderHalftone,
	isometric: renderIsometric,
	hex: renderHex,
}

const ECC_LABELS: Record<EccLevel, string> = { L: '7%', M: '15%', Q: '25%', H: '30%' }

type RenderConfig = { ecc: EccLevel; params: Params; style: StyleName }

const renderQR = (el: SVGSVGElement, src: string, config: RenderConfig) => {
	const { ecc, style, params } = config
	const qr = QRCode.create(src, { errorCorrectionLevel: ecc })
	const moduleCount = qr.modules.size
	const pad = style === 'isometric' ? CELL * params.depth : 0
	const svg = select(el)
		.attr('width', moduleCount * CELL + pad)
		.attr('height', moduleCount * CELL + pad)

	svg.selectAll('*').remove()
	svg
		.append('rect')
		.attr('width', moduleCount * CELL + pad)
		.attr('height', moduleCount * CELL + pad)
		.attr('fill', 'var(--color-base-100, white)')
	RENDERERS[style]({ svg, cells: classifyCells(qr.modules), moduleCount, params })
}

type SliderProps = {
	params: Params
	setParam: (name: ParamName, value: number) => void
	style: StyleName
}

const Sliders = ({ params, style, setParam }: SliderProps) => {
	const styleSpecs = R.entries(PARAM_SPECS).filter(([, spec]) => spec.style === style)
	if (!styleSpecs.length) return null

	return (
		<div className='flex flex-col gap-2 w-full max-w-xs'>
			{styleSpecs.map(([name, spec]) => (
				<label key={name} className='flex items-center gap-3'>
					<span className='text-sm opacity-60 w-28 shrink-0'>{spec.label}</span>
					<input
						type='range'
						className='range range-sm flex-1'
						min={spec.min}
						max={spec.max}
						step={spec.step}
						value={params[name]}
						onChange={(e) => setParam(name, +e.target.value)}
					/>
					<span className='font-mono text-xs w-10 text-right tabular-nums'>
						{params[name].toFixed(spec.step >= 1 ? 0 : 2)}
					</span>
				</label>
			))}
		</div>
	)
}

type StatsPanelProps = { capacity: number | null; charCount: number; moduleCount: number; version: number }

const StatsPanel = ({ version, moduleCount, charCount, capacity }: StatsPanelProps) => (
	<div className='stats stats-vertical sm:stats-horizontal shadow'>
		<div className='stat'>
			<div className='stat-title'>Version</div>
			<div className='stat-value'>{version}</div>
			<div className='stat-desc'>
				{moduleCount} × {moduleCount} modules
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
	const [params, setParams] = useState<Params>(R.mapValues(PARAM_SPECS, (spec) => spec.default))
	const svgRef = useRef<SVGSVGElement>(null)
	const svgOptRef = useRef<SVGSVGElement>(null)
	const [debouncedText] = useDebouncedValue(text, 250)
	const textInfo = getQRInfo(debouncedText, ecc)
	const optText = optimizeForQR(debouncedText)
	const optInfo = getQRInfo(optText, ecc)
	const canOptimize = optText !== debouncedText && !!textInfo && !!optInfo && optInfo.version < textInfo.version
	const setParam = (name: ParamName, value: number) => setParams((prev) => ({ ...prev, [name]: value }))

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

				<Sliders params={params} style={style} setParam={setParam} />

				{textInfo && (
					<>
						<div className={`flex gap-8 items-start ${canOptimize ? 'flex-row' : 'flex-col items-center'}`}>
							<div className='flex flex-col items-center gap-2'>
								<svg ref={svgRef} className='shadow' />
								{canOptimize && <span className='text-xs opacity-40 font-mono truncate max-w-40'>{debouncedText}</span>}
							</div>
							{canOptimize && (
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
							moduleCount={textInfo.moduleCount}
							charCount={debouncedText.length}
							capacity={textInfo.capacity}
						/>
					</>
				)}
			</main>
		</ThemeProvider>
	)
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(<Root />)
