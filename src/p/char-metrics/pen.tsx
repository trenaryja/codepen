import { RadioGroup, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import type { Dispatch, ReactNode, SetStateAction } from 'https://esm.sh/react'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

const FONTS: Record<string, string> = {
	serif: 'Georgia, "Times New Roman", serif',
	sans: 'system-ui, "Helvetica Neue", Arial, sans-serif',
	mono: '"Courier New", Courier, monospace',
}
const ACCENT = 'var(--color-primary)'
const FG = 'var(--color-base-content)'
const MONO = `'DM Mono', monospace`
const BASE_HEIGHT = 400

function cssFont(size: number, family: string, weight = 400) {
	return `${weight} ${size}px ${FONTS[family]}`
}

// One offscreen context serves every measurement: it is never rendered, and `font` is overwritten
// on the line before it is read. Closing over it rather than declaring it at module scope makes
// that scratch state private to `measure`, which is the only thing allowed to touch it.
const measure = (() => {
	const ctx = document.createElement('canvas').getContext('2d')!

	return (text: string, font: string) => {
		ctx.font = font
		return ctx.measureText(text)
	}
})()

const SCAN = 400 // offscreen scan canvas, px square
const SCAN_BASELINE = 300 // where the glyph sits inside that canvas
const INK = 128 // alpha above which a pixel counts as ink

type Span = [start: number, end: number]

type Raster = {
	ink: (x: number, y: number) => boolean
	advance: number
}

// Draw one glyph in isolation and expose an ink predicate over its pixels; a single
// getImageData readback backs every scan below.
function rasterize(char: string, font: string): Raster {
	const canvas = document.createElement('canvas')
	canvas.width = SCAN
	canvas.height = SCAN
	const ctx = canvas.getContext('2d')!
	ctx.font = font
	ctx.fillStyle = '#fff'
	ctx.textBaseline = 'alphabetic'
	ctx.fillText(char, 0, SCAN_BASELINE)
	const { data } = ctx.getImageData(0, 0, SCAN, SCAN)
	return {
		ink: (x, y) => x >= 0 && x < SCAN && y >= 0 && y < SCAN && data[(y * SCAN + x) * 4 + 3]! > INK,
		advance: ctx.measureText(char).width,
	}
}

function rowSpans({ ink }: Raster, y: number, limit = SCAN) {
	const spans: Span[] = []
	let start = -1

	for (let x = 0; x < limit; x++) {
		if (ink(x, y)) {
			if (start < 0) start = x
		} else if (start >= 0) {
			spans.push([start, x - 1])
			start = -1
		}
	}

	if (start >= 0) spans.push([start, limit - 1])
	return spans
}

function columnSpans({ ink }: Raster, x: number) {
	const spans: Span[] = []
	let start = -1

	for (let y = 0; y < SCAN; y++) {
		if (ink(x, y)) {
			if (start < 0) start = y
		} else if (start >= 0) {
			spans.push([start, y - 1])
			start = -1
		}
	}

	if (start >= 0) spans.push([start, SCAN - 1])
	return spans
}

type Color = string

const lineWidth = { strokeWidth: 1.5 }
const monoLabel = { fontSize: 10.5, fontFamily: MONO }

function HLine({
	y,
	width,
	color = ACCENT,
	label,
	dashed,
	side = 'right',
	alpha = 1,
}: {
	y: number
	width: number
	color?: Color
	label?: string | null
	dashed?: boolean
	side?: 'left' | 'right'
	alpha?: number
}) {
	return (
		<g opacity={alpha} stroke={color} fill={color}>
			<line x1={0} y1={y} x2={width} y2={y} {...lineWidth} strokeDasharray={dashed ? '4 5' : undefined} />
			{label && (
				<text
					x={side === 'right' ? width - 8 : 8}
					y={y - 4}
					{...monoLabel}
					textAnchor={side === 'right' ? 'end' : 'start'}
					stroke='none'
				>
					{label}
				</text>
			)}
		</g>
	)
}

function VLine({
	x,
	height,
	color = ACCENT,
	label,
	dashed,
	alpha = 1,
}: {
	x: number
	height: number
	color?: Color
	label?: string | null
	dashed?: boolean
	alpha?: number
}) {
	return (
		<g opacity={alpha} stroke={color} fill={color}>
			<line x1={x} y1={0} x2={x} y2={height} {...lineWidth} strokeDasharray={dashed ? '4 5' : undefined} />
			{label && (
				<text x={x} y={12} fontSize={10} fontFamily={MONO} textAnchor='middle' stroke='none'>
					{label}
				</text>
			)}
		</g>
	)
}

function HBracket({
	x1,
	x2,
	y,
	color = ACCENT,
	label,
	above = true,
	tick = 8,
}: {
	x1: number
	x2: number
	y: number
	color?: Color
	label?: string | null
	above?: boolean
	tick?: number
}) {
	const direction = above ? -1 : 1
	const signedTick = direction * tick
	return (
		<g stroke={color} fill={color}>
			<path
				d={`M${x1},${y - signedTick}V${y + signedTick}M${x1},${y}H${x2}M${x2},${y - signedTick}V${y + signedTick}`}
				{...lineWidth}
				fill='none'
			/>
			{label && (
				<text x={(x1 + x2) / 2} y={y + direction * (tick + 14)} {...monoLabel} textAnchor='middle' stroke='none'>
					{label}
				</text>
			)}
		</g>
	)
}

function VBracket({
	x,
	y1,
	y2,
	color = ACCENT,
	label,
	right = true,
	tick = 7,
}: {
	x: number
	y1: number
	y2: number
	color?: Color
	label?: string | null
	right?: boolean
	tick?: number
}) {
	const direction = right ? 1 : -1
	const signedTick = direction * tick
	return (
		<g stroke={color} fill={color}>
			<path
				d={`M${x - signedTick},${y1}H${x + signedTick}M${x},${y1}V${y2}M${x - signedTick},${y2}H${x + signedTick}`}
				{...lineWidth}
				fill='none'
			/>
			{label && (
				<text
					x={x + direction * (tick + 4)}
					y={(y1 + y2) / 2 + 4}
					{...monoLabel}
					textAnchor={right ? 'start' : 'end'}
					stroke='none'
				>
					{label}
				</text>
			)}
		</g>
	)
}

function Rect({
	x1,
	y1,
	x2,
	y2,
	color = ACCENT,
	fill = false,
	fillOpacity = 0.1,
	strokeWidth = 1.5,
	dashed,
}: {
	x1: number
	y1: number
	x2: number
	y2: number
	color?: Color
	fill?: boolean
	fillOpacity?: number
	strokeWidth?: number
	dashed?: boolean
}) {
	const box = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
	return (
		<>
			{fill && <rect {...box} fill={color} opacity={fillOpacity} />}
			<rect
				{...box}
				stroke={color}
				strokeWidth={strokeWidth}
				fill='none'
				strokeDasharray={dashed ? '3 4' : undefined}
			/>
		</>
	)
}

function Char({
	text,
	font,
	x,
	baseline,
	alpha = 1,
	color = FG,
}: {
	text: string
	font: string
	x: number
	baseline: number
	alpha?: number
	color?: Color
}) {
	return (
		<text x={x} y={baseline} style={{ font }} fill={color} opacity={alpha} dominantBaseline='alphabetic'>
			{text}
		</text>
	)
}

function Label({
	text,
	x,
	y,
	color = ACCENT,
	align = 'end',
	alpha = 1,
}: {
	text: string
	x: number
	y: number
	color?: Color
	align?: string
	alpha?: number
}) {
	const anchor = align === 'left' ? 'start' : align === 'center' ? 'middle' : 'end'
	return (
		<text x={x} y={y} fill={color} opacity={alpha} {...monoLabel} textAnchor={anchor} stroke='none'>
			{text}
		</text>
	)
}

type Layout = {
	width: number
	height: number
	font: string
	fontSize: number
	fontAscent: number
	fontDescent: number
	capHeight: number
	xHeight: number
	descenderDepth: number
	ascenderHeight: number
	advance: number
	charX: number
	inkLeft: number
	inkRight: number
	inkTop: number
	inkBottom: number
	baselineY: number
	sample: string
	trackingEm?: number
	textBoxTrim?: TextBoxTrim
}

// Everything the panel picks once and every diagram is drawn against.
type Specimen = {
	family: string
	fontWeight: number
	width: number
	height: number
	lineHeightRatio?: number
	trackingEm?: number
	textBoxTrim?: TextBoxTrim
}

// One specimen plus the text a single diagram measures.
type LayoutRequest = Specimen & {
	sample: string
	fontSize: number
}

function computeLayout({ sample, fontSize, family, fontWeight, width, height }: LayoutRequest): Layout {
	const font = cssFont(Math.round((fontSize * height) / BASE_HEIGHT), family, fontWeight)
	const metrics = measure(sample, font)
	const capHeight = measure('H', font).actualBoundingBoxAscent
	const xHeight = measure('x', font).actualBoundingBoxAscent
	const descenderDepth = measure('p', font).actualBoundingBoxDescent
	const ascenderHeight = measure('hd', font).actualBoundingBoxAscent
	const { fontBoundingBoxAscent: fontAscent, fontBoundingBoxDescent: fontDescent, width: advance } = metrics
	const charX = (width - advance) / 2
	const baselineY = (height - fontAscent - fontDescent) / 2 + fontAscent
	return {
		width,
		height,
		font,
		fontSize: Math.round((fontSize * height) / BASE_HEIGHT),
		fontAscent,
		fontDescent,
		capHeight,
		xHeight,
		descenderDepth,
		ascenderHeight,
		advance,
		charX,
		baselineY,
		sample,
		inkLeft: charX - metrics.actualBoundingBoxLeft,
		inkRight: charX + metrics.actualBoundingBoxRight,
		inkTop: baselineY - metrics.actualBoundingBoxAscent,
		inkBottom: baselineY + metrics.actualBoundingBoxDescent,
	}
}

function multiLayout(request: LayoutRequest): [Layout, Layout] {
	const { fontSize, height, lineHeightRatio } = request
	const lineHeightFor = (layout: Layout) =>
		lineHeightRatio === 0
			? layout.fontAscent + layout.fontDescent
			: lineHeightRatio != null
				? lineHeightRatio * layout.fontSize
				: layout.fontAscent + layout.fontDescent + layout.fontSize * 0.22

	let layout = computeLayout(request)
	let lineHeight = lineHeightFor(layout)
	const totalHeight = lineHeight + layout.fontAscent + layout.fontDescent

	if (totalHeight > height - 32) {
		layout = computeLayout({ ...request, fontSize: Math.round(fontSize * ((height - 32) / totalHeight)) })
		lineHeight = lineHeightFor(layout)
	}

	const firstBaselineY = (height - lineHeight - layout.fontAscent - layout.fontDescent) / 2 + layout.fontAscent
	return [
		{ ...layout, baselineY: firstBaselineY },
		{ ...layout, baselineY: firstBaselineY + lineHeight },
	]
}

const WEIGHT_OPTIONS = [
	{ value: 'thin', label: 'thin', weight: 100 },
	{ value: 'light', label: 'light', weight: 300 },
	{ value: 'normal', label: 'normal', weight: 400 },
	{ value: 'bold', label: 'bold', weight: 700 },
	{ value: 'black', label: 'black', weight: 900 },
] as const
type FontWeightSize = (typeof WEIGHT_OPTIONS)[number]['value']

const TRACKING_OPTIONS = [
	{ value: 'tighter', label: 'tighter', em: -0.05 },
	{ value: 'tight', label: 'tight', em: -0.025 },
	{ value: 'normal', label: 'normal', em: 0 },
	{ value: 'wide', label: 'wide', em: 0.025 },
	{ value: 'wider', label: 'wider', em: 0.05 },
	{ value: 'widest', label: 'widest', em: 0.1 },
] as const
type TrackingSize = (typeof TRACKING_OPTIONS)[number]['value']

const TEXT_BOX_OPTIONS = [
	{ value: 'none', label: 'none' },
	{ value: 'start', label: 'start' },
	{ value: 'end', label: 'end' },
	{ value: 'both', label: 'both' },
] as const
type TextBoxTrim = (typeof TEXT_BOX_OPTIONS)[number]['value']

// ratio: 0 is a sentinel meaning lineHeight = fontAscent + fontDescent (zero extra leading, lines touch)
const LEADING_OPTIONS = [
	{ value: 'none', label: 'none', ratio: 0 },
	{ value: 'xs', label: 'xs', ratio: 1.25 },
	{ value: 'sm', label: 'sm', ratio: 1.375 },
	{ value: 'md', label: 'md', ratio: 1.5 },
	{ value: 'lg', label: 'lg', ratio: 1.75 },
	{ value: 'xl', label: 'xl', ratio: 2 },
] as const
type LeadingSize = (typeof LEADING_OPTIONS)[number]['value']

type Term = {
	id: string
	name: string
	sample: string
	fontSize: number
	multiLine?: boolean
	definition: string
	draw: (layout: Layout, secondLine?: Layout) => ReactNode
}

type Group = {
	name: string
	terms: Term[]
}

const GROUPS: Group[] = [
	{
		name: 'Vertical Metrics',
		terms: [
			{
				id: 'baseline',
				name: 'baseline',
				sample: 'Ag',
				fontSize: 140,
				definition:
					'The invisible horizontal line on which glyphs sit. Every other vertical metric is measured relative to the baseline. In CSS, vertical-align and line-height are both anchored here.',
				draw: ({ baselineY, charX, font, sample, width }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine width={width} y={baselineY} label='baseline' />
					</>
				),
			},
			{
				id: 'xheight',
				name: 'x-height',
				sample: 'xag',
				fontSize: 140,
				definition:
					'The height of lowercase letters without ascenders or descenders, typically measured on "x". A larger x-height relative to cap height improves readability at small sizes.',
				draw: ({ baselineY, charX, font, sample, width, xHeight }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine width={width} y={baselineY} color={FG} dashed alpha={0.12} />
						<HLine width={width} y={baselineY - xHeight} label='x-height' />
						<VBracket x={charX - 18} y1={baselineY - xHeight} y2={baselineY} right={false} />
					</>
				),
			},
			{
				id: 'capheight',
				name: 'cap height',
				sample: 'Hx',
				fontSize: 140,
				definition:
					'The height of uppercase flat letters (H, I, E) measured from the baseline. Usually slightly shorter than the ascender line. Exposed in CSS via the cap unit.',
				draw: ({ baselineY, capHeight, charX, font, sample, width }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine width={width} y={baselineY} color={FG} dashed alpha={0.12} />
						<HLine width={width} y={baselineY - capHeight} label='cap height' />
						<VBracket x={charX - 18} y1={baselineY - capHeight} y2={baselineY} right={false} />
					</>
				),
			},
			{
				id: 'ascender',
				name: 'ascender',
				sample: 'hd',
				fontSize: 140,
				definition:
					'The upward stroke of a lowercase letter extending above the x-height, as in b, d, h, k, l. In most typefaces the ascender line sits at or slightly above the cap height.',
				draw: ({ ascenderHeight, baselineY, charX, font, sample, width, xHeight }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine width={width} y={baselineY} color={FG} dashed alpha={0.12} />
						<HLine width={width} y={baselineY - xHeight} color={FG} label='x-height' dashed alpha={0.25} />
						<HLine width={width} y={baselineY - ascenderHeight} label='ascender' />
						<VBracket x={charX - 18} y1={baselineY - ascenderHeight} y2={baselineY - xHeight} right={false} />
					</>
				),
			},
			{
				id: 'descender',
				name: 'descender',
				sample: 'pg',
				fontSize: 140,
				definition:
					'The downward stroke of a lowercase letter extending below the baseline, as in p, q, g, j, y. Descender depth varies widely and directly affects minimum comfortable line-height.',
				draw: ({ baselineY, charX, descenderDepth, font, sample, width }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine width={width} y={baselineY} color={FG} dashed alpha={0.12} />
						<HLine width={width} y={baselineY + descenderDepth} label='descender' />
						<VBracket x={charX - 18} y1={baselineY} y2={baselineY + descenderDepth} right={false} />
					</>
				),
			},
			{
				id: 'font-ascent',
				name: 'font ascent',
				sample: 'A',
				fontSize: 150,
				definition:
					"The maximum ascent declared in the font's OS/2 table (sTypoAscender). Used by the browser to compute line box height. May exceed any individual glyph's actual ink to reserve space for all possible characters.",
				draw: ({ baselineY, capHeight, charX, font, fontAscent, sample, width }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine
							width={width}
							y={baselineY - capHeight}
							color={FG}
							label='cap height'
							side='left'
							dashed
							alpha={0.25}
						/>
						<HLine width={width} y={baselineY - fontAscent} label='font ascent' />
						<VBracket x={width - 22} y1={baselineY - fontAscent} y2={baselineY - capHeight} label='gap' right={false} />
					</>
				),
			},
			{
				id: 'font-descent',
				name: 'font descent',
				sample: 'p',
				fontSize: 150,
				definition:
					"The maximum descent declared in the font tables (sTypoDescent). Together with font ascent it defines the em-relative line box. Often deeper than any glyph's actual descender.",
				draw: ({ baselineY, charX, descenderDepth, font, fontDescent, sample, width }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<HLine width={width} y={baselineY} color={FG} dashed alpha={0.12} />
						<HLine
							width={width}
							y={baselineY + descenderDepth}
							color={FG}
							label='ink descent'
							side='left'
							dashed
							alpha={0.25}
						/>
						<HLine width={width} y={baselineY + fontDescent} label='font descent' />
						{fontDescent - descenderDepth > 2 && (
							<VBracket
								x={width - 22}
								y1={baselineY + descenderDepth}
								y2={baselineY + fontDescent}
								label='gap'
								right={false}
							/>
						)}
					</>
				),
			},
			{
				id: 'overshoot',
				name: 'overshoot',
				sample: 'OH',
				fontSize: 140,
				definition:
					'Rounded or pointed glyphs (O, o, A, V) extend slightly beyond the baseline and cap height to compensate for optical illusion. Without overshoot, round letters appear shorter than flat-topped ones.',
				draw: ({ baselineY, charX, font, sample, width }) => {
					const flatTopY = baselineY - measure('H', font).actualBoundingBoxAscent
					const roundTopY = baselineY - measure('O', font).actualBoundingBoxAscent
					const overshoot = flatTopY - roundTopY
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<HLine width={width} y={flatTopY} color={FG} label='cap height (H)' side='left' dashed alpha={0.35} />
							{overshoot > 4 ? (
								<>
									<HLine width={width} y={roundTopY} label='O overshoot' />
									<VBracket x={width - 22} y1={roundTopY} y2={flatTopY} label='overshoot' right={false} />
								</>
							) : (
								<>
									<HLine width={width} y={roundTopY} />
									{overshoot > 1 && (
										<Label text={`O overshoot (+${overshoot.toFixed(1)}px)`} x={width - 8} y={roundTopY - 5} />
									)}
								</>
							)}
						</>
					)
				},
			},
		],
	},
	{
		name: 'Horizontal Metrics',
		terms: [
			{
				id: 'advance',
				name: 'advance width',
				sample: 'H',
				fontSize: 150,
				definition:
					'The total horizontal distance the cursor advances after placing a glyph. Includes ink width plus side bearings on both sides. CSS letter-spacing and word-spacing operate on this value.',
				draw: ({ advance, baselineY, charX, font, fontDescent, height, sample }) => {
					const y = Math.min(baselineY + fontDescent + 22, height - 26)
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<VLine x={charX} height={height} dashed alpha={0.25} />
							<VLine x={charX + advance} height={height} dashed alpha={0.25} />
							<HBracket x1={charX} x2={charX + advance} y={y} label='advance width' above={false} />
						</>
					)
				},
			},
			{
				id: 'lsb',
				name: 'left sidebearing',
				sample: 'H',
				fontSize: 150,
				definition:
					"The horizontal space from the glyph's origin to its leftmost ink edge. Controls visual rhythm on the left side. Negative values allow ink to extend beyond the origin point.",
				draw: ({ baselineY, charX, font, fontDescent, height, inkLeft, sample }) => {
					const y = Math.min(baselineY + fontDescent + 14, height - 26)
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<VLine x={charX} height={height} color={FG} label='origin' dashed alpha={0.35} />
							<VLine x={inkLeft} height={height} dashed alpha={0.5} />
							{Math.abs(inkLeft - charX) > 1 && <HBracket x1={charX} x2={inkLeft} y={y} label='LSB' above={false} />}
						</>
					)
				},
			},
			{
				id: 'rsb',
				name: 'right sidebearing',
				sample: 'H',
				fontSize: 150,
				definition:
					"The space from a glyph's rightmost ink edge to its advance point. Together with LSB, RSB determines the white space surrounding each character and controls visual rhythm.",
				draw: ({ advance, baselineY, charX, font, fontDescent, height, inkRight, sample }) => {
					const advanceEnd = charX + advance
					const y = Math.min(baselineY + fontDescent + 14, height - 26)
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<VLine x={inkRight} height={height} dashed alpha={0.5} />
							<VLine x={advanceEnd} height={height} color={FG} label='advance' dashed alpha={0.35} />
							{advanceEnd - inkRight > 1 && <HBracket x1={inkRight} x2={advanceEnd} y={y} label='RSB' above={false} />}
						</>
					)
				},
			},
			{
				id: 'inkwidth',
				name: 'ink width',
				sample: 'H',
				fontSize: 150,
				definition:
					"The actual horizontal extent of a glyph's visible ink, from leftmost to rightmost pixel. Does not include side bearings. Useful for optical centering or tight layout calculations.",
				draw: ({ baselineY, charX, font, fontDescent, height, inkLeft, inkRight, sample }) => {
					const y = Math.min(baselineY + fontDescent + 14, height - 26)
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<VLine x={inkLeft} height={height} dashed alpha={0.4} />
							<VLine x={inkRight} height={height} dashed alpha={0.4} />
							<HBracket x1={inkLeft} x2={inkRight} y={y} label='ink width' above={false} />
						</>
					)
				},
			},
		],
	},
	{
		name: 'Em & Bounds',
		terms: [
			{
				id: 'emsquare',
				name: 'em square',
				sample: 'M',
				fontSize: 140,
				definition:
					'The design space in which each glyph is drawn. Historically the height of a capital "M". In digital type it\'s a conceptual square equal to the font-size, subdivided into UPM units.',
				draw: ({ advance, baselineY, charX, font, fontAscent, fontDescent, sample }) => {
					const [top, bottom] = [baselineY - fontAscent, baselineY + fontDescent]
					return (
						<>
							<Rect x1={charX} y1={top} x2={charX + advance} y2={bottom} fill fillOpacity={0.07} />
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<Label text='em square' x={charX + advance / 2} y={top - 7} align='center' />
						</>
					)
				},
			},
			{
				id: 'inkbounds',
				name: 'ink bounds',
				sample: 'A',
				fontSize: 150,
				definition:
					"The tightest rectangle containing a glyph's actual rendered pixels. Known as actualBoundingBox in the Canvas API. Varies per character—unlike font bounds which are constant declared values.",
				draw: ({ baselineY, charX, font, inkBottom, inkLeft, inkRight, inkTop, sample }) => (
					<>
						<Char text={sample} font={font} x={charX} baseline={baselineY} />
						<Rect x1={inkLeft} y1={inkTop} x2={inkRight} y2={inkBottom} fill />
						<Label text='ink bounds' x={inkLeft} y={inkTop - 7} align='left' />
					</>
				),
			},
			{
				id: 'fontbounds',
				name: 'font bounds',
				sample: 'A',
				fontSize: 150,
				definition:
					'The rectangle defined by declared font metrics: (ascent + descent) × advance width. May be much larger than the actual ink. CSS layout operates on font bounds—this is what line-height and the box model use.',
				draw: ({
					advance,
					baselineY,
					charX,
					font,
					fontAscent,
					fontDescent,
					inkBottom,
					inkLeft,
					inkRight,
					inkTop,
					sample,
				}) => {
					const [fontTop, fontBottom] = [baselineY - fontAscent, baselineY + fontDescent]
					return (
						<>
							<Rect x1={charX} y1={fontTop} x2={charX + advance} y2={fontBottom} fill fillOpacity={0.07} />
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<Rect x1={inkLeft} y1={inkTop} x2={inkRight} y2={inkBottom} color={FG} strokeWidth={1} dashed />
							<Label text='ink' x={inkRight + 4} y={(inkTop + inkBottom) / 2} color={FG} align='left' alpha={0.4} />
							<Label text='font bounds' x={charX + advance - 4} y={fontTop - 7} />
						</>
					)
				},
			},
		],
	},
	{
		name: 'Spacing & Rhythm',
		terms: [
			{
				id: 'leading',
				name: 'leading',
				sample: 'Ag',
				fontSize: 140,
				multiLine: true,
				definition:
					"Extra vertical space added between lines of text, beyond the font's ascent + descent. Named for the lead strips typesetters placed between rows of metal type. In CSS it's part of line-height.",
				draw: (line1, line2) => {
					if (!line2) return null
					const [gapTop, gapBottom] = [line1.baselineY + line1.fontDescent, line2.baselineY - line2.fontAscent]
					return (
						<>
							<Char text={line1.sample} font={line1.font} x={line1.charX} baseline={line1.baselineY} />
							<Char text={line2.sample} font={line2.font} x={line2.charX} baseline={line2.baselineY} />
							<HLine width={line1.width} y={gapTop} dashed label='font descent' side='right' />
							<HLine width={line1.width} y={gapBottom} dashed label='font ascent' side='left' />
							{gapBottom > gapTop + 1 && (
								<>
									<rect x={0} y={gapTop} width={line1.width} height={gapBottom - gapTop} fill={ACCENT} opacity={0.14} />
									<VBracket x={line1.width - 18} y1={gapTop} y2={gapBottom} label='leading' right={false} />
								</>
							)}
							<HLine width={line1.width} y={line1.baselineY} color={FG} dashed alpha={0.18} />
							<HLine width={line1.width} y={line2.baselineY} color={FG} dashed alpha={0.18} />
						</>
					)
				},
			},
			{
				id: 'lineheight',
				name: 'line height',
				sample: 'Ag',
				fontSize: 140,
				multiLine: true,
				definition:
					'The total vertical distance from one baseline to the next. Equals font ascent + font descent + leading. In CSS the line-height property sets this; extra space distributes equally above and below as half-leading.',
				draw: (line1, line2) => {
					if (!line2) return null
					return (
						<>
							<Char text={line1.sample} font={line1.font} x={line1.charX} baseline={line1.baselineY} />
							<Char text={line2.sample} font={line2.font} x={line2.charX} baseline={line2.baselineY} />
							<HLine width={line1.width} y={line1.baselineY} color={FG} label='baseline 1' dashed alpha={0.4} />
							<HLine width={line1.width} y={line2.baselineY} color={FG} label='baseline 2' dashed alpha={0.4} />
							<VBracket
								x={line1.width - 18}
								y1={line1.baselineY}
								y2={line2.baselineY}
								label='line-height'
								right={false}
							/>
						</>
					)
				},
			},
			{
				id: 'tracking',
				name: 'tracking',
				sample: 'HELLO',
				fontSize: 64,
				definition:
					'Uniform horizontal spacing applied equally between all glyphs in a text run. Called letter-spacing in CSS. Unlike kerning, tracking is a constant additive value—not glyph-pair-specific.',
				draw: ({ baselineY, font, fontDescent, fontSize, sample, trackingEm, width: panelWidth, xHeight }) => {
					const track = (trackingEm ?? 0.1) * fontSize
					const widths = sample.split('').map((char) => measure(char, font).width)
					const totalWidth = widths.reduce((sum, width) => sum + width, 0) + track * (widths.length - 1)
					const glyphs: { char: string; x: number; width: number }[] = []
					let cursorX = (panelWidth - totalWidth) / 2

					for (const [i, width] of widths.entries()) {
						glyphs.push({ char: sample[i]!, x: cursorX, width })
						cursorX += width + track
					}

					return (
						<>
							{glyphs.map(({ char, x, width }, i) => (
								<g key={`${char}-${Math.round(x)}`}>
									<Char text={char} font={font} x={x} baseline={baselineY} />
									{i < glyphs.length - 1 && track > 0 && (
										<rect
											x={x + width}
											y={baselineY - xHeight}
											width={track}
											height={xHeight}
											fill={ACCENT}
											opacity={0.22}
										/>
									)}
								</g>
							))}
							<Label text='tracking gaps' x={panelWidth / 2} y={baselineY + fontDescent + 20} align='center' />
						</>
					)
				},
			},
			{
				id: 'kerning',
				name: 'kerning',
				sample: 'AV',
				fontSize: 130,
				definition:
					"Optical spacing adjustment between specific glyph pairs, encoded in the font's GPOS or kern table. The AV pair is a classic example: without kerning there's a visible gap that kerning tightens for visual balance.",
				draw: ({ baselineY, capHeight, charX, descenderDepth, font, fontDescent, height, sample, width }) => {
					const widthOfA = measure('A', font).width
					const kern = widthOfA + measure('V', font).width - measure('AV', font).width
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							{kern > 0.5 ? (
								<>
									<rect
										x={charX + widthOfA - kern}
										y={baselineY - capHeight}
										width={kern}
										height={capHeight + descenderDepth}
										fill={ACCENT}
										opacity={0.22}
									/>
									<HBracket
										x1={charX + widthOfA - kern}
										x2={charX + widthOfA}
										y={baselineY + fontDescent + 12}
										label={`kern −${kern.toFixed(1)}px`}
										above={false}
									/>
								</>
							) : (
								<>
									<VLine x={charX + widthOfA} height={height} color={FG} label='A/V junction' dashed alpha={0.35} />
									<Label
										text='no kern pair in this font'
										x={width / 2}
										y={baselineY + fontDescent + 22}
										align='center'
									/>
								</>
							)}
						</>
					)
				},
			},
		],
	},
	{
		name: 'Glyph Anatomy',
		terms: [
			{
				id: 'counter',
				name: 'counter',
				sample: 'O',
				fontSize: 150,
				definition:
					'The enclosed or partially enclosed negative space within a glyph. The fully enclosed hole in O or D is a closed counter; the open concavity in c or u is an open counter. Counter size shapes perceived weight.',
				draw: ({ advance, baselineY, capHeight, charX, font, sample, width, xHeight }) => {
					const centerX = charX + advance / 2
					const centerY = baselineY - capHeight * 0.5
					const radius = xHeight * 0.34
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<circle cx={centerX} cy={centerY} r={radius} fill={ACCENT} opacity={0.2} />
							<circle
								cx={centerX}
								cy={centerY}
								r={radius}
								stroke={ACCENT}
								strokeWidth={1.5}
								fill='none'
								opacity={0.7}
							/>
							<Label text='counter' x={width - 10} y={centerY - radius - 8} />
							<line
								x1={width - 60}
								y1={centerY - radius - 5}
								x2={centerX + radius + 2}
								y2={centerY - radius * 0.5}
								stroke={ACCENT}
								strokeWidth={1}
								opacity={0.5}
							/>
						</>
					)
				},
			},
			{
				id: 'stem',
				name: 'stem',
				sample: 'H',
				fontSize: 150,
				definition:
					"The primary vertical or near-vertical stroke of a letter—the two upright strokes in H, or the single stroke in I. Stem width is a primary variable in determining a typeface's perceived weight.",
				draw: ({ baselineY, capHeight, charX, font, sample }) => {
					// Scanned at 20% of cap height — above the baseline serifs, below the crossbar,
					// so the first ink span is the left stem alone.
					const raster = rasterize('H', font)
					const stemSpan = rowSpans(raster, Math.round(SCAN_BASELINE - capHeight * 0.2))[0]
					if (!stemSpan) return null

					const stemLeft = charX + stemSpan[0]
					const stemWidth = stemSpan[1] - stemSpan[0] + 1
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<rect
								x={stemLeft}
								y={baselineY - capHeight}
								width={stemWidth}
								height={capHeight}
								fill={ACCENT}
								opacity={0.22}
							/>
							<HBracket
								x1={stemLeft}
								x2={stemLeft + stemWidth}
								y={Math.max(baselineY - capHeight - 14, 34)}
								label='stem'
							/>
						</>
					)
				},
			},
			{
				id: 'bowl',
				name: 'bowl',
				sample: 'b',
				fontSize: 150,
				definition:
					'The curved closed stroke forming the rounded part of letters like b, d, o, p, q. Bowl size and shape create the distinctive silhouette of a typeface and affect its texture at small sizes.',
				draw: ({ baselineY, charX, font, inkRight, sample, xHeight }) => {
					const raster = rasterize('b', font)

					// At mid x-height a 'b' reads as stem, gap, bowl — so the second ink span starts the bowl.
					const bowlSpan = rowSpans(raster, Math.round(SCAN_BASELINE - xHeight * 0.5))[1]
					if (!bowlSpan) return null

					// Column down the middle of the bowl gives its vertical extent.
					const bowlRight = Math.round(inkRight - charX)
					const column = columnSpans(raster, Math.round((bowlSpan[0] + bowlRight) / 2))
					const inkTop = column[0]?.[0]
					const inkBottom = column.at(-1)?.[1]
					if (inkTop == null || inkBottom == null) return null

					const bowlX = charX + bowlSpan[0]
					const bowlWidth = inkRight - bowlX
					const bowlTop = baselineY + (inkTop - SCAN_BASELINE)

					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<rect
								x={bowlX}
								y={bowlTop}
								width={bowlWidth}
								height={inkBottom - inkTop + 1}
								fill={ACCENT}
								opacity={0.22}
							/>
							<HBracket x1={bowlX} x2={bowlX + bowlWidth} y={Math.max(bowlTop - 14, 26)} label='bowl' />
						</>
					)
				},
			},
		],
	},
	{
		name: 'CSS & Text Box',
		terms: [
			{
				id: 'halfleading',
				name: 'half-leading',
				sample: 'Ag',
				fontSize: 130,
				definition:
					'The extra space above and below inline text produced by the gap between line-height and the em square, split equally top and bottom. This phantom padding is why CSS text appears to have mysterious vertical spacing.',
				draw: ({ baselineY, charX, font, fontAscent, fontDescent, fontSize, sample, width }) => {
					const halfLeading = fontSize * 0.125
					const halfLeadingTop = baselineY - fontAscent - halfLeading
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<rect x={0} y={halfLeadingTop} width={width} height={halfLeading} fill={ACCENT} opacity={0.14} />
							<rect x={0} y={baselineY + fontDescent} width={width} height={halfLeading} fill={ACCENT} opacity={0.14} />
							<HLine width={width} y={baselineY - fontAscent} color={FG} label='font ascent' dashed alpha={0.3} />
							<HLine
								width={width}
								y={baselineY + fontDescent}
								color={FG}
								label='font descent'
								side='left'
								dashed
								alpha={0.3}
							/>
							<VBracket x={10} y1={halfLeadingTop} y2={baselineY - fontAscent} label='½ lead' right />
							<VBracket
								x={10}
								y1={baselineY + fontDescent}
								y2={baselineY + fontDescent + halfLeading}
								label='½ lead'
								right
							/>
						</>
					)
				},
			},
			{
				id: 'textboxtrim',
				name: 'text-box-trim',
				sample: 'Ag',
				fontSize: 120,
				definition:
					'A CSS property (text-box: trim-both) that removes half-leading from the top and bottom of a text block. Allows containers to size tightly to cap height or x-height, enabling precise spacing without magic-number padding.',
				draw: ({
					advance,
					baselineY,
					capHeight,
					charX,
					descenderDepth,
					font,
					fontAscent,
					fontDescent,
					fontSize,
					inkRight,
					sample,
					textBoxTrim,
				}) => {
					const halfLeading = fontSize * 0.125
					const [defaultTop, defaultBottom] = [
						baselineY - fontAscent - halfLeading,
						baselineY + fontDescent + halfLeading,
					]
					const trim = textBoxTrim ?? 'both'
					const trimTop = trim === 'end' ? defaultTop : baselineY - capHeight
					const trimBottom = trim === 'start' ? defaultBottom : baselineY + descenderDepth
					return (
						<>
							<Char text={sample} font={font} x={charX} baseline={baselineY} />
							<Rect
								x1={charX - 8}
								y1={defaultTop}
								x2={charX + advance + 8}
								y2={defaultBottom}
								color={FG}
								strokeWidth={1}
								dashed
							/>
							<Label
								text='default'
								x={charX - 10}
								y={defaultTop - 7}
								color={FG}
								align='left'
								alpha={trim === 'none' ? 0.7 : 0.35}
							/>
							{trim !== 'none' && (
								<>
									<Rect
										x1={charX - 8}
										y1={trimTop}
										x2={inkRight + 8}
										y2={trimBottom}
										fill
										fillOpacity={0.08}
										strokeWidth={1.5}
									/>
									<Label text={`trim-${trim}`} x={inkRight + 12} y={trimTop - 7} align='left' />
								</>
							)}
						</>
					)
				},
			},
		],
	},
]

function Idle({ width, height, family, fontWeight }: Specimen) {
	const layout = computeLayout({ sample: 'Ag', fontSize: 140, family, fontWeight, width, height })
	const lines: [number, string][] = [
		[layout.baselineY, 'baseline'],
		[layout.baselineY - layout.xHeight, 'x-height'],
		[layout.baselineY - layout.capHeight, 'cap height'],
		[layout.baselineY - layout.fontAscent, 'ascent'],
		[layout.baselineY + layout.fontDescent, 'descent'],
		[layout.baselineY + layout.descenderDepth, 'descender'],
	]
	return (
		<>
			<Char text='Ag' font={layout.font} x={layout.charX} baseline={layout.baselineY} color={FG} alpha={0.08} />
			{lines.map(([y, label]) => (
				<g key={label}>
					<line x1={0} y1={y} x2={width} y2={y} stroke={FG} strokeWidth={1} strokeDasharray='3 6' opacity={0.08} />
					<text x={width - 8} y={y - 3} fill={FG} opacity={0.12} fontSize={10} fontFamily={MONO} textAnchor='end'>
						{label}
					</text>
				</g>
			))}
		</>
	)
}

function findTerm(id: string) {
	for (const group of GROUPS) for (const term of group.terms) if (term.id === id) return term
	return null
}

function renderTerm(term: Term, specimen: Specimen) {
	const request = { ...specimen, sample: term.sample, fontSize: term.fontSize }

	if (term.multiLine) {
		const [firstLine, secondLine] = multiLayout(request)
		return term.draw(firstLine, secondLine)
	}

	const layout = computeLayout(request)
	if (term.id === 'tracking') return term.draw({ ...layout, trackingEm: specimen.trackingEm })
	if (term.id === 'textboxtrim') return term.draw({ ...layout, textBoxTrim: specimen.textBoxTrim })
	return term.draw(layout)
}

function PageIntro() {
	return (
		<header className='px-8 pt-14 pb-10 border-b border-base-300'>
			<p className='font-mono text-xs tracking-[.18em] uppercase text-base-content/40 mb-3'>
				OpenType · CSS · Reference
			</p>
			<h1 className='font-[Instrument_Serif] text-[clamp(2.6rem,4.5vw,3.8rem)] leading-[1.1] tracking-tight mb-3'>
				Typography Metrics
			</h1>
			<p className='text-sm text-base-content/60 max-w-prose leading-relaxed'>
				A visual glossary of the measurements and terminology used to describe the anatomy of a typeface. Hover any term
				to see it illustrated.
			</p>
		</header>
	)
}

function FontControls({
	family,
	setFamily,
	fontWeightSize,
	setFontWeightSize,
}: {
	family: string
	setFamily: (family: string) => void
	fontWeightSize: FontWeightSize
	setFontWeightSize: (fontWeightSize: FontWeightSize) => void
}) {
	return (
		<div className='border-b border-base-300'>
			<div className='flex items-center px-4 py-2 border-b border-base-300/50'>
				<div className='join'>
					{(['serif', 'sans', 'mono'] as const).map((key) => (
						<button
							key={key}
							type='button'
							className={`join-item btn btn-xs${family === key ? ' btn-active' : ''}`}
							onClick={() => setFamily(key)}
						>
							{key.charAt(0).toUpperCase() + key.slice(1)}
						</button>
					))}
				</div>
			</div>
			<div className='flex items-center px-4 py-2'>
				<RadioGroup
					variant='btn'
					value={fontWeightSize}
					onChange={(event) => setFontWeightSize(event.target.value as FontWeightSize)}
					options={[...WEIGHT_OPTIONS]}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			</div>
		</div>
	)
}

// The strip under the diagram: the active term's name, plus whichever control that
// term is adjustable by — leading, tracking, or text-box trim.
function DiagramFooter({
	activeId,
	activeName,
	leadingSize,
	setLeadingSize,
	trackingSize,
	setTrackingSize,
	textBoxTrim,
	setTextBoxTrim,
}: {
	activeId: string | null
	activeName: string
	leadingSize: LeadingSize
	setLeadingSize: (leadingSize: LeadingSize) => void
	trackingSize: TrackingSize
	setTrackingSize: (trackingSize: TrackingSize) => void
	textBoxTrim: TextBoxTrim
	setTextBoxTrim: (textBoxTrim: TextBoxTrim) => void
}) {
	return (
		<div className='flex items-center justify-between px-4 py-2.5 border-t border-base-300 min-h-10'>
			<span className='font-mono text-xs text-base-content/50'>{activeName}</span>
			{(activeId === 'leading' || activeId === 'lineheight') && (
				<RadioGroup
					variant='btn'
					value={leadingSize}
					onChange={(event) => setLeadingSize(event.target.value as LeadingSize)}
					options={[...LEADING_OPTIONS]}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			)}
			{activeId === 'tracking' && (
				<RadioGroup
					variant='btn'
					value={trackingSize}
					onChange={(event) => setTrackingSize(event.target.value as TrackingSize)}
					options={[...TRACKING_OPTIONS]}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			)}
			{activeId === 'textboxtrim' && (
				<RadioGroup
					variant='btn'
					value={textBoxTrim}
					onChange={(event) => setTextBoxTrim(event.target.value as TextBoxTrim)}
					options={[...TEXT_BOX_OPTIONS]}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			)}
		</div>
	)
}

function Glossary({
	activeId,
	pinned,
	isMobile,
	setHovered,
	setPinned,
}: {
	activeId: string | null
	pinned: string | null
	isMobile: boolean
	setHovered: (id: string | null) => void
	setPinned: Dispatch<SetStateAction<string | null>>
}) {
	return (
		<div className={isMobile ? 'pt-5 px-4' : ''}>
			{GROUPS.map((group) => (
				<div key={group.name} className='mb-11'>
					<h2 className='font-mono text-xs tracking-[.18em] uppercase text-base-content/40 pb-3 border-b border-base-300 mb-1'>
						{group.name}
					</h2>
					{group.terms.map((term) => (
						<button
							key={term.id}
							type='button'
							className={`block w-full text-left mt-1 p-3 rounded-lg border transition-colors hover:bg-base-200 hover:border-base-300 ${activeId === term.id ? 'bg-base-200 border-base-300' : 'border-transparent'}`}
							onMouseEnter={() => !pinned && setHovered(term.id)}
							onMouseLeave={() => !pinned && setHovered(null)}
							onClick={() => setPinned((current) => (current === term.id ? null : term.id))}
						>
							<p className='font-mono text-sm font-medium mb-1'>{term.name}</p>
							<p className='text-xs text-base-content/60 leading-relaxed'>{term.definition}</p>
						</button>
					))}
				</div>
			))}
		</div>
	)
}

function App() {
	const panelRef = useRef<HTMLDivElement>(null)
	const [family, setFamily] = useState('serif')
	const [pinned, setPinned] = useState<string | null>(null)
	const [hovered, setHovered] = useState<string | null>(null)
	const [size, setSize] = useState({ width: 330, height: 400, isMobile: false })
	const { width, height, isMobile } = size
	const [fontWeightSize, setFontWeightSize] = useState<FontWeightSize>('normal')
	const [leadingSize, setLeadingSize] = useState<LeadingSize>('md')
	const [trackingSize, setTrackingSize] = useState<TrackingSize>('widest')
	const [textBoxTrim, setTextBoxTrim] = useState<TextBoxTrim>('both')

	const specimen = {
		family,
		width,
		height,
		fontWeight: WEIGHT_OPTIONS.find((option) => option.value === fontWeightSize)!.weight,
		lineHeightRatio: LEADING_OPTIONS.find((option) => option.value === leadingSize)!.ratio,
		trackingEm: TRACKING_OPTIONS.find((option) => option.value === trackingSize)!.em,
		textBoxTrim,
	}

	const activeId = pinned ?? hovered
	const activeTerm = activeId ? findTerm(activeId) : null

	useEffect(() => {
		const panel = panelRef.current!
		let rafId: number | null = null
		const observer = new ResizeObserver(() => {
			if (rafId !== null) cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(() => {
				rafId = null
				const style = getComputedStyle(panel)
				const mobile = style.getPropertyValue('--mobile').trim() === '1'
				const panelWidth = Math.round(
					panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
				)
				if (panelWidth)
					setSize({
						width: panelWidth,
						height: mobile ? Math.round(panelWidth * 0.48) : BASE_HEIGHT,
						isMobile: mobile,
					})
			})
		})
		observer.observe(panel)

		return () => {
			observer.disconnect()
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [])

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setPinned(null)
		}

		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Reset the specimen controls whenever a new glossary term becomes active
	const [prevActiveId, setPrevActiveId] = useState(activeId)

	if (prevActiveId !== activeId) {
		setPrevActiveId(activeId)
		setLeadingSize('md')
		setTrackingSize('widest')
		setTextBoxTrim('both')
	}

	return (
		<ThemeProvider>
			<div className='full-bleed-container min-h-screen bg-base-100 text-base-content'>
				<div className='content-root'>
					<PageIntro />
					<div className={`main-grid${isMobile ? ' mobile' : ''}`}>
						<div ref={panelRef} className='diagram-panel sticky top-6' style={isMobile ? { width: '100%' } : undefined}>
							<div className='rounded-box border border-base-300 bg-base-200 overflow-hidden'>
								<FontControls
									family={family}
									setFamily={setFamily}
									fontWeightSize={fontWeightSize}
									setFontWeightSize={setFontWeightSize}
								/>
								<svg
									viewBox={`0 0 ${width} ${height}`}
									width={width}
									height={height}
									style={{ display: 'block' }}
									aria-label={activeTerm?.name ?? 'Typography metrics diagram'}
								>
									{activeTerm ? renderTerm(activeTerm, specimen) : <Idle {...specimen} />}
								</svg>
								<DiagramFooter
									activeId={activeId}
									activeName={activeTerm?.name ?? ''}
									leadingSize={leadingSize}
									setLeadingSize={setLeadingSize}
									trackingSize={trackingSize}
									setTrackingSize={setTrackingSize}
									textBoxTrim={textBoxTrim}
									setTextBoxTrim={setTextBoxTrim}
								/>
							</div>
							{!isMobile && (
								<p className='pin-hint text-center font-mono text-xs text-base-content/25 mt-2'>
									Click to pin · <kbd className='kbd kbd-xs'>Esc</kbd> to unpin
								</p>
							)}
						</div>
						<Glossary
							activeId={activeId}
							pinned={pinned}
							isMobile={isMobile}
							setHovered={setHovered}
							setPinned={setPinned}
						/>
					</div>
				</div>
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
