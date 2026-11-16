import { create } from 'https://esm.sh/qrcode'
import React, { type ComponentProps, type ReactNode, useId } from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'

const CELL = 10
const INK = 'currentColor'
const PAPER = 'var(--color-base-100, white)'

export const QR_CODE_VARIANTS = ['classic', 'blob', 'halftone', 'isometric', 'hex'] as const

export type QRCodeVariant = (typeof QR_CODE_VARIANTS)[number]

/** Each error correction level's share of the code it can restore, in percent; a higher level draws a denser code */
export const QR_CODE_ECC_RECOVERY = { L: 7, M: 15, Q: 25, H: 30 } as const

export type QRCodeEccLevel = keyof typeof QR_CODE_ECC_RECOVERY

/** Shape defaults, in modules unless noted; each is read only by the variant it names */
export const QR_CODE_PARAMS = {
	/** `blob`: standard deviation of the blur that melts modules together */
	blur: 0.45,
	/** `blob`: alpha contrast after the blur, unitless; higher draws crisper edges */
	threshold: 50,
	/** `halftone`: radius of a dot with no dark neighbors */
	minDotRadius: 0.1,
	/** `halftone`: radius a dot gains with all 8 neighbors dark */
	dotRadiusRange: 0.6,
	/** `isometric`: extrusion toward the bottom right */
	depth: 0.5,
	/** `hex`: circumradius of a honeycomb cell, which takes the color of the module under its center */
	hexRadius: 0.45,
}

export type QRCodeParams = typeof QR_CODE_PARAMS

type Module = { col: number; finder: boolean; row: number }

type DrawArgs = {
	dark: readonly Module[]
	filterId: string
	isDark: (row: number, col: number) => boolean
	params: QRCodeParams
	size: number
}

const NEIGHBORS = R.range(-1, 2)
	.flatMap((dy) => R.range(-1, 2).map((dx) => [dy, dx] as const))
	.filter(([dy, dx]) => dy !== 0 || dx !== 0)

const square = ({ row, col }: Module) => (
	<rect key={`${row}-${col}`} x={col * CELL} y={row * CELL} width={CELL} height={CELL} fill={INK} />
)

const dot = ({ row, col }: Module, radius: number) => (
	<circle key={`${row}-${col}`} cx={(col + 0.5) * CELL} cy={(row + 0.5) * CELL} r={radius} fill={INK} />
)

const finderEyes = (size: number) => (
	<g>
		{(
			[
				[3.5, 3.5],
				[3.5, size - 3.5],
				[size - 3.5, 3.5],
			] as const
		).flatMap(([row, col]) =>
			[3.5, 2.5, 1.5].map((radius, i) => (
				<circle
					key={`${row}-${col}-${radius}`}
					cx={col * CELL}
					cy={row * CELL}
					r={radius * CELL}
					fill={i === 1 ? PAPER : INK}
				/>
			)),
		)}
	</g>
)

const DRAW: Record<QRCodeVariant, (args: DrawArgs) => ReactNode> = {
	classic: ({ dark }) => <g>{dark.map(square)}</g>,
	blob: ({ dark, size, params, filterId }) => (
		<>
			<defs>
				<filter id={filterId} x='-10%' y='-10%' width='120%' height='120%'>
					<feGaussianBlur in='SourceGraphic' stdDeviation={CELL * params.blur} result='blur' />
					<feColorMatrix
						in='blur'
						mode='matrix'
						values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${params.threshold} ${-params.threshold / 2}`}
					/>
				</filter>
			</defs>
			<g filter={`url(#${filterId})`}>
				{dark.filter((module) => !module.finder).map((module) => dot(module, CELL * 0.56))}
			</g>
			{finderEyes(size)}
		</>
	),
	halftone: ({ dark, size, isDark, params }) => (
		<>
			{finderEyes(size)}
			<g>
				{dark
					.filter((module) => !module.finder)
					.map((module) => {
						const darkNeighbors = R.sumBy(NEIGHBORS, ([dy, dx]) => Number(isDark(module.row + dy, module.col + dx)))
						return dot(module, CELL * (params.minDotRadius + params.dotRadiusRange * (darkNeighbors / 8)))
					})}
			</g>
		</>
	),
	isometric: ({ dark, isDark, params }) => {
		const depth = CELL * params.depth
		const faces = (
			opacity: number,
			isExposed: (module: Module) => boolean,
			points: (x: number, y: number) => string,
		) => (
			<g opacity={opacity}>
				{dark.filter(isExposed).map(({ row, col }) => (
					<polygon key={`${row}-${col}`} points={points(col * CELL, row * CELL)} fill={INK} />
				))}
			</g>
		)
		return (
			<>
				{faces(
					0.4,
					({ row, col }) => !isDark(row + 1, col),
					(x, y) =>
						`${x},${y + CELL} ${x + depth},${y + CELL + depth} ${x + CELL + depth},${y + CELL + depth} ${x + CELL},${y + CELL}`,
				)}
				{faces(
					0.6,
					({ row, col }) => !isDark(row, col + 1),
					(x, y) =>
						`${x + CELL},${y} ${x + CELL + depth},${y + depth} ${x + CELL + depth},${y + CELL + depth} ${x + CELL},${y + CELL}`,
				)}
				<g>{dark.map(square)}</g>
			</>
		)
	},
	hex: ({ size, isDark, params }) => {
		const radius = CELL * params.hexRadius
		const side = size * CELL
		const colPitch = Math.sqrt(3) * radius
		const rowPitch = 1.5 * radius
		return (
			<g>
				{R.range(0, Math.ceil(side / rowPitch))
					.flatMap((hexRow) =>
						R.range(0, Math.ceil(side / colPitch)).map(
							(hexCol) => [(hexCol + 0.5 + (hexRow % 2) * 0.5) * colPitch, radius + hexRow * rowPitch] as const,
						),
					)
					.filter(
						([cx, cy]) =>
							cy + radius <= side && cx + colPitch / 2 <= side && isDark(Math.floor(cy / CELL), Math.floor(cx / CELL)),
					)
					.map(([cx, cy]) => (
						<polygon
							key={`${cx}-${cy}`}
							points={R.times(6, (i) => {
								const angle = (i * Math.PI) / 3 - Math.PI / 2
								return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
							}).join(' ')}
							fill={INK}
						/>
					))}
			</g>
		)
	},
}

export type QRCodeProps = Omit<ComponentProps<'svg'>, 'children'> & {
	/** Text to encode; empty, or past what a QR code holds at `ecc`, throws */
	value: string
	/** @default 'L' */
	ecc?: QRCodeEccLevel
	/**
	 * - `classic`: square modules
	 * - `blob`: modules melted together, finder patterns as rings
	 * - `halftone`: dots that grow with their dark neighbors, finder patterns as rings
	 * - `isometric`: modules extruded toward the bottom right
	 * - `hex`: a honeycomb over the modules
	 * @default 'classic'
	 */
	variant?: QRCodeVariant
	/** @default QR_CODE_PARAMS */
	params?: Partial<QRCodeParams>
}

/** `value` as a QR code `<svg>` in `currentColor` on daisyUI's `--color-base-100`: 10px per module until CSS sizes it, then scaled to fit */
export const QRCode = ({ value, ecc = 'L', variant = 'classic', params: overrides = {}, ...props }: QRCodeProps) => {
	const filterId = useId()
	const { size, data } = create(value, { errorCorrectionLevel: ecc }).modules
	const isDark = (row: number, col: number) =>
		row >= 0 && row < size && col >= 0 && col < size && data[row * size + col] === 1
	const dark = R.times(size * size, (i) => ({ row: Math.floor(i / size), col: i % size }))
		.filter(({ row, col }) => isDark(row, col))
		.map(({ row, col }) => ({
			row,
			col,
			finder: (row < 8 && (col < 8 || col >= size - 8)) || (row >= size - 8 && col < 8),
		}))
	const params = { ...QR_CODE_PARAMS, ...R.pickBy(overrides, R.isDefined) }
	const side = size * CELL + (variant === 'isometric' ? CELL * params.depth : 0)

	return (
		<svg width={side} height={side} viewBox={`0 0 ${side} ${side}`} {...props}>
			<rect width={side} height={side} fill={PAPER} />
			{DRAW[variant]({ dark, size, isDark, params, filterId })}
		</svg>
	)
}
