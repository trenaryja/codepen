import { select, type Selection } from 'https://esm.sh/d3-selection'
import QRCode, { type BitMatrix } from 'https://esm.sh/qrcode'
import { CELL, type EccLevel } from './qr-info'

export type ModuleType = 'alignment' | 'data' | 'finder' | 'timing'

export const STYLES = ['classic', 'blob', 'halftone', 'isometric', 'hex'] as const

export type StyleName = (typeof STYLES)[number]

export type Cell = {
	col: number
	dark: boolean
	darkNeighbors: number
	row: number
	type: ModuleType
}

export const DIRS: [number, number][] = [
	[-1, -1],
	[-1, 0],
	[-1, 1],
	[0, -1],
	[0, 1],
	[1, -1],
	[1, 0],
	[1, 1],
]

export const classifyCells = ({ size: moduleCount, data, reservedBit }: BitMatrix): Cell[][] => {
	const isDark = (row: number, col: number) =>
		row >= 0 && row < moduleCount && col >= 0 && col < moduleCount && (data[row * moduleCount + col] ?? 0) !== 0

	return Array.from({ length: moduleCount }, (_r, row) =>
		Array.from({ length: moduleCount }, (_c, col) => {
			let type: ModuleType = 'data'

			if ((reservedBit[row * moduleCount + col] ?? 0) !== 0) {
				const inFinder =
					(row < 8 && col < 8) || (row < 8 && col >= moduleCount - 8) || (row >= moduleCount - 8 && col < 8)

				type = inFinder ? 'finder' : row === 6 || col === 6 ? 'timing' : 'alignment'
			}

			const darkNeighbors = DIRS.filter(([dy, dx]) => isDark(row + dy, col + dx)).length
			return { row, col, dark: isDark(row, col), type, darkNeighbors }
		}),
	)
}

export type Svg = Selection<SVGSVGElement, unknown, null, undefined>

export const finderEyes = (svg: Svg, moduleCount: number) => {
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

export type ParamSpec = {
	default: number
	label: string
	max: number
	min: number
	step: number
	style: StyleName
}

export const PARAM_SPECS = {
	blur: { style: 'blob', label: 'Blur', min: 0.05, max: 1.5, step: 0.05, default: 0.45 },
	threshold: { style: 'blob', label: 'Threshold', min: 5, max: 50, step: 1, default: 50 },
	minR: { style: 'halftone', label: 'Min size', min: 0, max: 1, step: 0.01, default: 0.1 },
	range: { style: 'halftone', label: 'Range', min: 0, max: 1, step: 0.01, default: 0.6 },
	depth: { style: 'isometric', label: 'Depth', min: 0, max: 1, step: 0.05, default: 0.5 },
	radius: { style: 'hex', label: 'Hex radius', min: 0.2, max: 0.9, step: 0.01, default: 0.45 },
} as const satisfies Record<string, ParamSpec>

export type ParamName = keyof typeof PARAM_SPECS

export type Params = Record<ParamName, number>

export type RenderArgs = { cells: Cell[][]; moduleCount: number; params: Params; svg: Svg }

export const renderClassic = ({ svg, cells }: RenderArgs) => {
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

export const renderBlob = ({ svg, cells, moduleCount, params }: RenderArgs) => {
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

export const renderHalftone = ({ svg, cells, moduleCount, params }: RenderArgs) => {
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

export const renderIsometric = ({ svg, cells, params }: RenderArgs) => {
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

export const renderHex = ({ svg, cells, moduleCount, params }: RenderArgs) => {
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

			if (cy < r || cy + r > W || cx < colPitch / 2 || cx + colPitch / 2 > W) continue

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

export type Renderer = (args: RenderArgs) => void

export const RENDERERS: Record<StyleName, Renderer> = {
	classic: renderClassic,
	blob: renderBlob,
	halftone: renderHalftone,
	isometric: renderIsometric,
	hex: renderHex,
}

export const ECC_LABELS: Record<EccLevel, string> = { L: '7%', M: '15%', Q: '25%', H: '30%' }

export type RenderConfig = { ecc: EccLevel; params: Params; style: StyleName }

export const renderQR = (el: SVGSVGElement, src: string, config: RenderConfig) => {
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
