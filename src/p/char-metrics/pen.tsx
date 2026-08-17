import { RadioGroup, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { useEffect, useMemo, useRef, useState } from 'https://esm.sh/react'
import type { ReactNode } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

const FONTS: Record<string, string> = {
	serif: 'Georgia, "Times New Roman", serif',
	sans: 'system-ui, "Helvetica Neue", Arial, sans-serif',
	mono: '"Courier New", Courier, monospace',
}
const ACCENT = 'var(--color-primary)'
const FG = 'var(--color-base-content)'
const BG = 'var(--color-base-100)'
const MONO = `'DM Mono', monospace`
const BASE_HEIGHT = 400
const HERO_FONT_SIZE = 120

// Shared offscreen context: measurement only, never rendered.
const measureCtx = document.createElement('canvas').getContext('2d')!

function cssFont(size: number, family: string, weight = 400) {
	return `${weight} ${size}px ${FONTS[family]}`
}

function measure(text: string, font: string) {
	measureCtx.font = font
	return measureCtx.measureText(text)
}

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

function computeLayout(
	sample: string,
	fontSize: number,
	family: string,
	fontWeight: number,
	width: number,
	height: number,
): Layout {
	const font = cssFont(Math.round((fontSize * height) / BASE_HEIGHT), family, fontWeight)
	// eslint-disable-next-line @eslint-react/globals -- module-level measuring canvas; setting font before measureText is how the canvas measurement API works
	measureCtx.font = font
	const metrics = measureCtx.measureText(sample)
	const capHeight = measureCtx.measureText('H').actualBoundingBoxAscent
	const xHeight = measureCtx.measureText('x').actualBoundingBoxAscent
	const descenderDepth = measureCtx.measureText('p').actualBoundingBoxDescent
	const ascenderHeight = measureCtx.measureText('hd').actualBoundingBoxAscent
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

function multiLayout(
	sample: string,
	fontSize: number,
	family: string,
	fontWeight: number,
	width: number,
	height: number,
	lineHeightRatio?: number,
): [Layout, Layout] {
	const lineHeightFor = (layout: Layout) =>
		lineHeightRatio === 0
			? layout.fontAscent + layout.fontDescent
			: lineHeightRatio != null
				? lineHeightRatio * layout.fontSize
				: layout.fontAscent + layout.fontDescent + layout.fontSize * 0.22

	let layout = computeLayout(sample, fontSize, family, fontWeight, width, height)
	let lineHeight = lineHeightFor(layout)
	const totalHeight = lineHeight + layout.fontAscent + layout.fontDescent

	if (totalHeight > height - 32) {
		layout = computeLayout(
			sample,
			Math.round(fontSize * ((height - 32) / totalHeight)),
			family,
			fontWeight,
			width,
			height,
		)
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

function Idle({
	width,
	height,
	family,
	fontWeight,
}: {
	width: number
	height: number
	family: string
	fontWeight: number
}) {
	const layout = computeLayout('Ag', 140, family, fontWeight, width, height)
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

const HERO_WIDTH = 900
const HERO_HEIGHT = 480
const HERO_WEIGHT = 700
const HERO_BASELINE_1 = Math.round(HERO_HEIGHT * 0.4)
const HERO_BASELINE_2 = Math.round(HERO_HEIGHT * 0.83)
const LINE_1 = 'Anatomy' // A=0 n=1 a=2 t=3 o=4 m=5 y=6
const LINE_2 = 'of Type' // o=0 f=1 ' '=2 T=3 y=4 p=5 e=6

type Point = { x: number; y: number }

type Box = { x: number; y: number; width: number; height: number }

// Topmost ink row within a horizontal slice of the glyph.
function topRow(raster: Raster, x0 = 0, x1 = SCAN) {
	for (let y = 0; y < SCAN; y++) for (let x = x0; x < x1; x++) if (raster.ink(x, y)) return y
	return -1
}

function bottomRow(raster: Raster) {
	for (let y = SCAN - 1; y >= 0; y--) for (let x = 0; x < SCAN; x++) if (raster.ink(x, y)) return y
	return -1
}

function inkBounds(raster: Raster) {
	let left = SCAN
	let right = -1
	let top = SCAN
	let bottom = -1

	for (let y = 0; y < SCAN; y++) {
		for (let x = 0; x < SCAN; x++) {
			if (!raster.ink(x, y)) continue
			if (x < left) left = x
			if (x > right) right = x
			if (y < top) top = y
			if (y > bottom) bottom = y
		}
	}

	return right < 0 ? null : { left, right, top, bottom }
}

// The enclosed void of a glyph: probe a column for stroke → void → stroke, then
// re-scan the void's mid row for its horizontal extent.
function enclosedVoid(raster: Raster, probeX: number) {
	const vertical = columnSpans(raster, probeX)
	if (vertical.length < 2) return null
	const top = vertical[0]![1] + 1
	const bottom = vertical[1]![0] - 1
	if (bottom < top) return null

	const midY = Math.round((top + bottom) / 2)
	const horizontal = rowSpans(raster, midY)
	if (horizontal.length < 2) return null
	const left = horizontal[0]![1] + 1
	const right = horizontal.at(-1)![0] - 1
	if (right < left) return null

	return { top, bottom, left, right, midY }
}

// Apex of an arch or shoulder. Columns whose ink starts within `BAND` of the
// glyph's highest point form crests; the left stem's crest is dropped so
// `index` counts arches only.
function archApex(raster: Raster, index: number) {
	const BAND = 3
	const width = Math.ceil(raster.advance)
	const top = topRow(raster, 0, width)
	if (top < 0) return null

	const isCrest = (x: number) => {
		for (let y = top; y <= top + BAND; y++) if (raster.ink(x, y)) return true
		return false
	}

	const crests: Span[] = []
	let start = -1

	for (let x = 0; x < width; x++) {
		if (isCrest(x)) {
			if (start < 0) start = x
		} else if (start >= 0) {
			crests.push([start, x - 1])
			start = -1
		}
	}

	if (start >= 0) crests.push([start, width - 1])

	// A crest centred in the leftmost fifth of the advance is the stem, not an arch.
	const arches = crests.filter(([left, right]) => (left + right) / 2 > width * 0.2)
	const pool = arches.length ? arches : crests
	const arch = pool[Math.min(index, pool.length - 1)]
	return arch ? { x: (arch[0] + arch[1]) / 2, y: top } : null
}

// Trace the seam between the two strokes of a 'y' — the inner edge of whichever
// arm carries on into the descender, row by row. The trace becomes a clip edge,
// so the highlight follows the real diagonal instead of a rectangle straddling it.
function yArms(raster: Raster) {
	const top = topRow(raster)
	const bottom = bottomRow(raster)
	if (top < 0 || bottom < 0) return null

	// Both inner edges of the split, so the seam can follow either arm.
	const inner: { left: number; right: number; y: number }[] = []
	let merge = -1

	for (let y = top; y < SCAN; y++) {
		const spans = rowSpans(raster, y)

		if (spans.length >= 2) inner.push({ left: spans[0]![1], right: spans[1]![0], y })
		else if (inner.length) {
			merge = y
			break
		}
	}

	if (inner.length < 4 || merge < 0) return null

	// Which arm carries on into the descender? The dominant one. Measured in
	// Georgia, the tail leaves the junction on the thick left arm's slope and at
	// its weight while the hairline right arm simply stops there — so assuming the
	// textbook "right arm carries" construction gets this face backwards and joins
	// a hairline to a tail two strokes heavier than itself. Matching the tail's own
	// width instead looks more principled but is not: Georgia's tail narrows to a
	// waist before swelling into its terminal, so the answer depends entirely on
	// which row gets sampled. Where a face has no stroke contrast the two choices
	// render identically, so the near-tie costs nothing.
	const probe = rowSpans(raster, merge - Math.max(4, Math.round((merge - top) * 0.2)))
	if (probe.length < 2) return null
	const widthOf = (span: Span) => span[1] - span[0] + 1
	const carries = widthOf(probe[0]!) >= widthOf(probe[1]!) ? 'left' : 'right'

	// The seam runs along the *carrying* arm's inner edge. Always tracing the right
	// arm's edge instead only works when the right arm is the carrier: that edge
	// drifts left as it descends, which grows the highlight for a right-carrier but
	// eats into it for a left-carrier, notching the hairline's tip out of the tail.
	const seam: Point[] = inner.map((row) => ({ x: carries === 'left' ? row.left : row.right, y: row.y }))

	// The carrying arm's own span, so a callout can sit on the stroke. Averaging
	// the seam against an arm's outer edge lands short of it whenever the gap is
	// wider than the stroke — which is most of the way down.
	const sample = seam[Math.round(seam.length * 0.4)]! // round(0.4·n) < n
	const arm = rowSpans(raster, sample.y)[carries === 'left' ? 0 : 1]! // seam rows all have ≥2 spans

	// Below the junction no scan can separate the strokes. Carry the seam one
	// stroke-width further on its own slope, enough to avoid a flat horizontal
	// slice across the diagonal, then stop: projecting it all the way down
	// instead follows a straight line while the tail curves away from it, and
	// shears the terminal off the end of the stroke.
	const recent = seam.slice(-8) // nonempty: seam has ≥4 rows
	const slope = (recent.at(-1)!.x - recent[0]!.x) / Math.max(1, recent.length - 1)
	const last = seam.at(-1)!
	const taper = Math.round(Math.min(22, Math.max(6, widthOf(arm))))
	for (let i = 1; i <= taper; i++) seam.push({ x: last.x + slope * i, y: merge + i - 1 })

	return { top, merge, bottom, seam, sample, arm, carries }
}

// Flood fill inwards from the canvas border across non-ink pixels. What it
// reaches is outside the glyph; an enclosed counter is not reachable, but an
// aperture opens onto it — which is exactly what separates the two.
function outsideMask({ ink }: Raster) {
	const outside = new Uint8Array(SCAN * SCAN)
	const stack: number[] = []

	const visit = (x: number, y: number) => {
		if (x < 0 || x >= SCAN || y < 0 || y >= SCAN) return
		const i = y * SCAN + x
		if (outside[i] || ink(x, y)) return
		outside[i] = 1
		stack.push(i)
	}

	for (let x = 0; x < SCAN; x++) {
		visit(x, 0)
		visit(x, SCAN - 1)
	}

	for (let y = 0; y < SCAN; y++) {
		visit(0, y)
		visit(SCAN - 1, y)
	}

	while (stack.length) {
		const i = stack.pop()!
		const x = i % SCAN
		const y = (i - x) / SCAN
		visit(x + 1, y)
		visit(x - 1, y)
		visit(x, y + 1)
		visit(x, y - 1)
	}

	return outside
}

// Aperture of 'a': the widest gap between two strokes that still opens onto the
// outside. Filtering by reachability is what keeps this off the bowl's counter,
// which is the widest gap overall but fully enclosed.
function apertureGap(raster: Raster, xHeight: number) {
	const outside = outsideMask(raster)
	let best: Point | null = null
	let widest = 0

	for (let y = Math.round(SCAN_BASELINE - xHeight); y < SCAN_BASELINE; y++) {
		const spans = rowSpans(raster, y)

		for (let i = 1; i < spans.length; i++) {
			const from = spans[i - 1]![1] + 1
			const to = spans[i]![0] - 1
			const midX = Math.round((from + to) / 2)
			if (to < from || to - from + 1 <= widest || !outside[y * SCAN + midX]) continue
			widest = to - from + 1
			best = { x: midX, y }
		}
	}

	return best
}

// Terminal of 't': the right end of the crossbar. Searching only above the
// bottom hook keeps the hook's rightward curve from winning.
function crossbarTerminal(raster: Raster, xHeight: number) {
	const top = topRow(raster)
	if (top < 0) return null
	const floor = Math.round(SCAN_BASELINE - xHeight * 0.35)

	let best: Point | null = null

	for (let y = top; y <= floor; y++) {
		const lastSpan = rowSpans(raster, y).at(-1)
		if (!lastSpan) continue
		const right = lastSpan[1]
		if (!best || right > best.x) best = { x: right, y }
	}

	return best
}

// Every annotation on the hero is derived by rasterizing a single glyph to a detached
// canvas and scanning it for ink transitions, so the callouts follow whichever font is
// selected instead of being pinned to one measured typeface.
//
// Referentially transparent: the canvases allocated here are never attached to the
// document and no module state is touched, so the same font always yields the same
// coordinates and it memoizes safely on `family`.
function heroGeometry(family: string) {
	const font = cssFont(Math.round((HERO_FONT_SIZE * HERO_HEIGHT) / BASE_HEIGHT), family, HERO_WEIGHT)

	// Local measuring context — heroGeometry must not disturb the shared one.
	const measurer = document.createElement('canvas').getContext('2d')!
	measurer.font = font
	const capHeight = measurer.measureText('H').actualBoundingBoxAscent
	const xHeight = measurer.measureText('x').actualBoundingBoxAscent
	const ascent = measurer.measureText('f').actualBoundingBoxAscent
	const descent = measurer.measureText('p').actualBoundingBoxDescent

	// Kerning-aware per-character positions within a centred word.
	const charPositions = (word: string) => {
		const x0 = (HERO_WIDTH - measurer.measureText(word).width) / 2
		return word.split('').map((char, i) => ({
			char,
			x: x0 + measurer.measureText(word.slice(0, i)).width,
			w: measurer.measureText(word.slice(0, i + 1)).width - measurer.measureText(word.slice(0, i)).width,
		}))
	}

	const anatomy = charPositions(LINE_1)
	const ofType = charPositions(LINE_2)
	// LINE_1/LINE_2 are 7-char constants — indexes 0–6 always exist.
	const anatomyX0 = anatomy[0]!.x
	const ofTypeX0 = ofType[0]!.x

	// Canvas rows sit `SCAN_BASELINE` above their own origin; shift onto a text baseline.
	const onLine1 = (canvasY: number) => HERO_BASELINE_1 + canvasY - SCAN_BASELINE
	const onLine2 = (canvasY: number) => HERO_BASELINE_2 + canvasY - SCAN_BASELINE

	const capital = rasterize('A', font)
	const enn = rasterize('n', font)
	const ay = rasterize('a', font)
	const tee = rasterize('t', font)
	const oh = rasterize('o', font)
	const emm = rasterize('m', font)
	const why = rasterize('y', font)
	const eff = rasterize('f', font)
	const pee = rasterize('p', font)

	// The centre column carries ink only where the crossbar crosses the counter.
	const capWidth = Math.round(capital.advance)
	const centreX = Math.round(capWidth * 0.48)
	const centreSpans = columnSpans(capital, centreX).filter(
		([spanTop]) => spanTop > SCAN_BASELINE - capHeight * 0.75 && spanTop < SCAN_BASELINE - capHeight * 0.1,
	)
	const barTop = centreSpans.length ? centreSpans[0]![0] : Math.round(SCAN_BASELINE - capHeight * 0.44)
	const barBottom = centreSpans.length ? centreSpans[0]![1] : Math.round(SCAN_BASELINE - capHeight * 0.36)

	// Sample the inner edges of both diagonals above the crossbar, then
	// extrapolate down their slope to get the trapezoid corners. Clipping the
	// glyph to that trapezoid isolates the bar without touching the legs.
	const legGap = (y: number): Span | null => {
		const spans = rowSpans(capital, y, capWidth + 4)
		return spans.length >= 2 ? [spans[0]![1], spans[1]![0]] : null
	}

	const upper = legGap(barTop - 8)
	const higher = legGap(barTop - 24)
	const leftSlope = upper && higher ? (upper[0] - higher[0]) / 16 : -0.35
	const rightSlope = upper && higher ? (upper[1] - higher[1]) / 16 : 0.35
	const leftBase = upper ? upper[0] : Math.round(capWidth * 0.28)
	const rightBase = upper ? upper[1] : Math.round(capWidth * 0.68)
	const barHeight = barBottom - barTop + 1
	const barY = onLine1(barTop)
	// Grown a little vertically so the clip spans the bar's full thickness.
	const crossbar = {
		clip: [
			[anatomyX0 + leftBase + leftSlope * 8, barY - 2],
			[anatomyX0 + rightBase + rightSlope * 8, barY - 2],
			[anatomyX0 + rightBase + rightSlope * (10 + barHeight), barY + barHeight + 2],
			[anatomyX0 + leftBase + leftSlope * (10 + barHeight), barY + barHeight + 2],
		]
			.map(([x, y]) => `${x},${y}`)
			.join(' '),
		dot: {
			x: anatomyX0 + (leftBase + rightBase) / 2,
			y: barY + barHeight / 2,
		},
	}

	// A hole, not ink: the box below is filled with ACCENT and the word is
	// masked back out of it, so what remains is precisely the enclosed void.
	const ohVoid = enclosedVoid(oh, Math.round(oh.advance * 0.5))
	const counterBox: Box = ohVoid
		? {
				x: anatomy[4]!.x + ohVoid.left,
				y: onLine1(ohVoid.top),
				width: ohVoid.right - ohVoid.left + 1,
				height: ohVoid.bottom - ohVoid.top + 1,
			}
		: {
				x: anatomy[4]!.x + oh.advance * 0.28,
				y: HERO_BASELINE_1 - xHeight * 0.78,
				width: oh.advance * 0.44,
				height: xHeight * 0.56,
			}

	// Everything right of the stem, between the x-height and the baseline.
	// Below the baseline only the stem has ink, and its narrowest row is the stem
	// proper — sampling a single row instead lets a foot serif pass for the stem
	// and shoves the bowl's left edge halfway across the bowl.
	const peeBounds = inkBounds(pee)
	let peeStemSpan: Span | null = null

	for (let y = Math.round(SCAN_BASELINE + descent * 0.15); y <= Math.round(SCAN_BASELINE + descent * 0.8); y++) {
		const span = rowSpans(pee, y)[0]
		if (span && (!peeStemSpan || span[1] - span[0] < peeStemSpan[1] - peeStemSpan[0])) peeStemSpan = span
	}

	const bowlLeft = peeStemSpan ? peeStemSpan[1] : Math.round(pee.advance * 0.3)
	const bowlTop = topRow(pee)
	const bowlBox: Box = peeBounds
		? {
				x: ofType[5]!.x + bowlLeft,
				y: onLine2(bowlTop) - 2,
				width: peeBounds.right - bowlLeft + 3,
				height: HERO_BASELINE_2 - onLine2(bowlTop) + 3,
			}
		: { x: ofType[5]!.x, y: HERO_BASELINE_2 - xHeight, width: ofType[5]!.w, height: xHeight }

	// Both are *parts* of a glyph, so each clip is a half-plane cut at the
	// x-height or the baseline rather than the whole character.
	const effBounds = inkBounds(eff)
	const ascenderBox: Box = {
		x: ofType[1]!.x + (effBounds ? effBounds.left - 3 : 0),
		y: 0,
		width: effBounds ? effBounds.right - effBounds.left + 7 : ofType[1]!.w,
		height: HERO_BASELINE_2 - xHeight,
	}
	// Stopped at the next character's origin: 'y' overhangs its advance, and
	// without the clamp the box reaches far enough right to tint the 'p' stem.
	const whyBounds = inkBounds(why)
	const descenderLeft = ofType[4]!.x + (whyBounds ? whyBounds.left - 3 : 0)
	const descenderBox: Box = {
		x: descenderLeft,
		y: HERO_BASELINE_2,
		width: Math.min(ofType[5]!.x, ofType[4]!.x + (whyBounds ? whyBounds.right + 4 : ofType[4]!.w)) - descenderLeft,
		height: HERO_HEIGHT - HERO_BASELINE_2,
	}
	// The descender's own ink, so its callout lands on the 'y' and not the 'p'.
	const whyTail = rowSpans(why, Math.round(SCAN_BASELINE + descent * 0.55))[0]
	const descenderDot: Point = {
		x: ofType[4]!.x + (whyTail ? (whyTail[0] + whyTail[1]) / 2 : why.advance * 0.4),
		y: HERO_BASELINE_2 + descent * 0.55,
	}

	// A 'y' is two strokes: one arm stops at the junction, the other carries on
	// into the descender. The clip takes whichever side `yArms` measured as the
	// carrier — above the junction it runs along the traced seam between the
	// arms, and below it takes the whole glyph, so the highlight is one
	// continuous stroke with the tail and its terminal included. The far edge is
	// pinned to the 'y' ink; widening it would tint the neighbouring 'm'.
	const arms = yArms(why)
	const whyLine1Bounds = inkBounds(why)
	const strokeClip =
		arms && whyLine1Bounds
			? (() => {
					const glyphX = anatomy[6]!.x
					// Never left of the 'y' own advance origin. In a monospaced face its ink
					// starts within a pixel or two of that origin, so a bare margin reaches
					// back into the preceding 'm' and tints its serif.
					const left = glyphX + Math.max(0, whyLine1Bounds.left - 2)
					const right = glyphX + whyLine1Bounds.right + 2
					const topY = onLine1(arms.top) - 6
					const bottomY = onLine1(whyLine1Bounds.bottom) + 4
					const seamTopX = glyphX + arms.seam[0]!.x
					const seamEndY = onLine1(arms.seam.at(-1)!.y)
					const seam = arms.seam.map(
						(point) => `${Math.min(Math.max(glyphX + point.x, left), right)},${onLine1(point.y)}`,
					)
					// Once past the taper the clip releases to the glyph's far edge, so the
					// fused descender below stays whole whichever arm is the carrier.
					const release = arms.carries === 'left' ? right : left
					const corners = [`${release},${seamEndY}`, `${release},${bottomY}`]
					return arms.carries === 'left'
						? [`${left},${topY}`, `${seamTopX},${topY}`, ...seam, ...corners, `${left},${bottomY}`].join(' ')
						: [...seam, ...corners, `${right},${bottomY}`, `${right},${topY}`, `${seamTopX},${topY}`].join(' ')
				})()
			: ''
	const stroke: Point = arms
		? { x: anatomy[6]!.x + (arms.arm[0] + arms.arm[1]) / 2, y: onLine1(arms.sample.y) }
		: { x: anatomy[6]!.x + why.advance * 0.8, y: HERO_BASELINE_1 - xHeight * 0.5 }

	const capApex = topRow(capital, 0, capWidth)
	const capApexSpans = rowSpans(capital, capApex, capWidth)
	const uppercase: Point = capApexSpans.length
		? { x: anatomyX0 + (capApexSpans[0]![0] + capApexSpans.at(-1)![1]) / 2, y: onLine1(capApex) }
		: { x: anatomy[0]!.x + anatomy[0]!.w * 0.5, y: HERO_BASELINE_1 - capHeight }

	const ennArch = archApex(enn, 0)
	const lowercase: Point = ennArch
		? { x: anatomy[1]!.x + ennArch.x, y: onLine1(ennArch.y) }
		: { x: anatomy[1]!.x + anatomy[1]!.w * 0.6, y: HERO_BASELINE_1 - xHeight }

	const emmArch = archApex(emm, 0)
	const shoulder: Point = emmArch
		? { x: anatomy[5]!.x + emmArch.x, y: onLine1(emmArch.y) }
		: { x: anatomy[5]!.x + anatomy[5]!.w * 0.4, y: HERO_BASELINE_1 - xHeight }

	const gap = apertureGap(ay, xHeight)
	const aperture: Point = gap
		? { x: anatomy[2]!.x + gap.x, y: onLine1(gap.y) }
		: { x: anatomy[2]!.x + anatomy[2]!.w * 0.6, y: HERO_BASELINE_1 - xHeight * 0.6 }

	const tip = crossbarTerminal(tee, xHeight)
	const terminal: Point = tip
		? { x: anatomy[3]!.x + tip.x, y: onLine1(tip.y) }
		: { x: anatomy[3]!.x + anatomy[3]!.w, y: HERO_BASELINE_1 - xHeight }
	// A terminal is the free end of a stroke, so highlight a run of the crossbar
	// roughly as long as it is thick. A bare dot gave no sense of what it named.
	const crossbarColumn = tip
		? columnSpans(tee, Math.max(0, tip.x - 5)).find(([top, bottom]) => tip.y >= top - 2 && tip.y <= bottom + 2)
		: undefined
	const terminalBox: Box | null = tip
		? {
				x: anatomy[3]!.x + tip.x - (crossbarColumn ? (crossbarColumn[1] - crossbarColumn[0] + 1) * 1.8 : 16),
				y: onLine1(crossbarColumn ? crossbarColumn[0] - 2 : tip.y - 8),
				width: (crossbarColumn ? (crossbarColumn[1] - crossbarColumn[0] + 1) * 1.8 : 16) + 4,
				height: crossbarColumn ? crossbarColumn[1] - crossbarColumn[0] + 5 : 16,
			}
		: null

	const effTop = topRow(eff)
	const effSpans = rowSpans(eff, effTop)
	const ascender: Point = effSpans.length
		? { x: ofType[1]!.x + (effSpans[0]![0] + effSpans.at(-1)![1]) / 2, y: onLine2(effTop) }
		: { x: ofType[1]!.x + ofType[1]!.w * 0.5, y: HERO_BASELINE_2 - ascent }

	return {
		font,
		capHeight,
		xHeight,
		ascent,
		descent,
		anatomy,
		ofType,
		anatomyX0,
		ofTypeX0,
		crossbar,
		counterBox,
		bowlBox,
		ascenderBox,
		descenderBox,
		strokeClip,
		stroke,
		terminalBox,
		uppercase,
		lowercase,
		shoulder,
		aperture,
		terminal,
		ascender,
		stem: { x: ofType[3]!.x + ofType[3]!.w * 0.5, y: HERO_BASELINE_2 - capHeight * 0.48 },
		// Clear of whichever is wider — the default margin, or the second line
		// itself, which in a monospaced face runs far enough right to reach it.
		bracketX: Math.max(HERO_WIDTH - 160, ofTypeX0 + measurer.measureText(LINE_2).width + 14),
		// Top of the bowl's arc rather than its right edge, so the leader runs
		// straight up into open space instead of across the 'e'.
		bowl: { x: bowlBox.x + bowlBox.width * 0.5, y: bowlBox.y + 3 },
		descenderDot,
		guideYs: [
			...new Set([
				HERO_BASELINE_1,
				HERO_BASELINE_1 - capHeight,
				HERO_BASELINE_1 - xHeight,
				HERO_BASELINE_2,
				HERO_BASELINE_2 - capHeight,
				HERO_BASELINE_2 - xHeight,
				HERO_BASELINE_2 + descent,
			]),
		],
	}
}

function AnatomyHero({ family }: { family: string }) {
	const geometry = useMemo(() => heroGeometry(family), [family])
	const { anatomy, capHeight, xHeight, ascent, descent } = geometry

	const glyph = (text: string, x: number, baseline: number, color = FG) => (
		<Char text={text} font={geometry.font} x={x} baseline={baseline} color={color} />
	)

	const callout = (
		text: string,
		dot: Point,
		labelX: number,
		labelY: number,
		anchor: 'end' | 'middle' | 'start' = 'middle',
	) => (
		<g key={text}>
			{/* Ringed in the page colour so a dot stays legible whether it lands on
			    a plain letterform or inside one of the ACCENT highlights. */}
			<circle cx={dot.x} cy={dot.y} r={3.5} fill={ACCENT} stroke={BG} strokeWidth={1.5} />
			<line x1={dot.x} y1={dot.y} x2={labelX} y2={labelY} stroke={ACCENT} strokeWidth={1} opacity={0.55} />
			<text
				x={labelX}
				y={labelY}
				fill={FG}
				fontSize={12}
				fontFamily={MONO}
				textAnchor={anchor}
				dominantBaseline={labelY <= dot.y ? 'auto' : 'hanging'}
				opacity={0.7}
			>
				{text}
			</text>
		</g>
	)

	const ABOVE1 = HERO_BASELINE_1 - capHeight - 30
	const BELOW1 = HERO_BASELINE_1 + 30
	const BELOW2 = HERO_BASELINE_2 + descent + 22
	const BRACKET_X = geometry.bracketX

	// Labels in the top row are anchored to the feature they point at, which in a
	// monospaced face packs them close enough to touch. Nudge each one right of
	// its predecessor; the leader line keeps the association readable.
	const LABEL_GAP = 84
	const counterX = geometry.counterBox.x + geometry.counterBox.width / 2
	const topRowX = [geometry.uppercase.x, geometry.lowercase.x, counterX, geometry.shoulder.x]
	for (let i = 1; i < topRowX.length; i++) topRowX[i] = Math.max(topRowX[i]!, topRowX[i - 1]! + LABEL_GAP)

	return (
		<svg
			viewBox={`0 0 ${HERO_WIDTH} ${HERO_HEIGHT}`}
			width='100%'
			style={{ display: 'block' }}
			aria-label='Anatomy of Type — letterforms annotated with their anatomical feature names'
		>
			<defs>
				<clipPath id='hero-crossbar'>
					<polygon points={geometry.crossbar.clip} />
				</clipPath>
				<clipPath id='hero-stroke'>
					<polygon points={geometry.strokeClip} />
				</clipPath>
				<clipPath id='hero-bowl'>
					<rect {...geometry.bowlBox} />
				</clipPath>
				{geometry.terminalBox && (
					<clipPath id='hero-terminal'>
						<rect {...geometry.terminalBox} />
					</clipPath>
				)}
				<clipPath id='hero-ascender'>
					<rect {...geometry.ascenderBox} />
				</clipPath>
				<clipPath id='hero-descender'>
					<rect {...geometry.descenderBox} />
				</clipPath>
				{/* White where the counter box is, black where the glyph puts ink down —
				    so filling the box through this mask paints only the enclosed void. */}
				<mask id='hero-counter' maskUnits='userSpaceOnUse' x={0} y={0} width={HERO_WIDTH} height={HERO_HEIGHT}>
					<rect {...geometry.counterBox} fill='white' />
					{glyph('o', geometry.anatomy[4]!.x, HERO_BASELINE_1, 'black')}
				</mask>
			</defs>

			{geometry.guideYs.map((y) => (
				<line
					key={y}
					x1={0}
					y1={y}
					x2={HERO_WIDTH}
					y2={y}
					stroke={FG}
					strokeWidth={1}
					strokeDasharray='4 8'
					opacity={0.1}
				/>
			))}

			{glyph(LINE_1, geometry.anatomyX0, HERO_BASELINE_1)}
			{glyph(LINE_2, geometry.ofTypeX0, HERO_BASELINE_2)}

			{/* Both words in full above, then one ACCENT overlay per feature below. Each overlay
			    redraws a *single* glyph and clips it to a measured region, which is what keeps the
			    colour on the letterform. Redrawing the whole word instead lets a clip tint whichever
			    neighbour happens to reach into it — Courier Bold's 'm' overflows its own advance far
			    enough to catch the 'y' stroke clip and pick up a blue serif. `charPositions` includes
			    the run's kerning, so a glyph drawn on its own lands exactly over its base-layer twin. */}
			<g clipPath='url(#hero-crossbar)'>{glyph('A', geometry.anatomy[0]!.x, HERO_BASELINE_1, ACCENT)}</g>
			{geometry.strokeClip && (
				<g clipPath='url(#hero-stroke)'>{glyph('y', geometry.anatomy[6]!.x, HERO_BASELINE_1, ACCENT)}</g>
			)}
			{geometry.terminalBox && (
				<g clipPath='url(#hero-terminal)'>{glyph('t', geometry.anatomy[3]!.x, HERO_BASELINE_1, ACCENT)}</g>
			)}
			<g clipPath='url(#hero-bowl)'>{glyph('p', geometry.ofType[5]!.x, HERO_BASELINE_2, ACCENT)}</g>
			<g clipPath='url(#hero-ascender)'>{glyph('f', geometry.ofType[1]!.x, HERO_BASELINE_2, ACCENT)}</g>
			<g clipPath='url(#hero-descender)'>{glyph('y', geometry.ofType[4]!.x, HERO_BASELINE_2, ACCENT)}</g>
			<rect {...geometry.counterBox} fill={ACCENT} mask='url(#hero-counter)' />

			{callout('uppercase', geometry.uppercase, topRowX[0]!, ABOVE1)}
			{callout('lowercase', geometry.lowercase, topRowX[1]!, ABOVE1)}
			{callout(
				'counter',
				{ x: counterX, y: geometry.counterBox.y + geometry.counterBox.height / 2 },
				topRowX[2]!,
				ABOVE1,
			)}
			{callout('shoulder', geometry.shoulder, topRowX[3]!, ABOVE1)}

			{callout('cross bar', geometry.crossbar.dot, geometry.crossbar.dot.x - 14, BELOW1, 'end')}
			{callout('aperture', geometry.aperture, anatomy[2]!.x + anatomy[2]!.w * 0.5 + 30, BELOW1, 'start')}
			{callout('terminal', geometry.terminal, anatomy[3]!.x + anatomy[3]!.w * 0.5 + 44, BELOW1, 'start')}
			{callout('stroke', geometry.stroke, anatomy[6]!.x + anatomy[6]!.w + 6, BELOW1, 'start')}

			{callout('ascender', geometry.ascender, geometry.ofTypeX0 - 8, HERO_BASELINE_2 - ascent + 14, 'end')}
			{callout('stem', geometry.stem, geometry.stem.x - 34, BELOW2, 'end')}
			{/* Routed up into the empty band between the two lines — to the right
			    the 'e' would sit on top of the label. */}
			{callout('bowl', geometry.bowl, geometry.bowl.x, HERO_BASELINE_2 - capHeight - 16)}
			{callout('descender', geometry.descenderDot, geometry.descenderDot.x + 10, BELOW2, 'start')}
			{callout(
				'baseline',
				{ x: geometry.ofTypeX0 + 2, y: HERO_BASELINE_2 },
				geometry.ofTypeX0 - 6,
				HERO_BASELINE_2 + 18,
				'end',
			)}

			{/* Right-side brackets. The two spans share a baseline, so nesting them
			    at one x drew them on top of each other: the x-height bracket is
			    inset instead, and each label sits beside the part of its own span
			    the other doesn't cover — keeping them capHeight/2 apart in any font. */}
			<g stroke={FG} strokeWidth={1} fill={FG} opacity={0.65}>
				<path d={`M${BRACKET_X},${HERO_BASELINE_2 - capHeight}h8v${capHeight}h-8`} fill='none' />
				<text
					x={BRACKET_X + 46}
					y={HERO_BASELINE_2 - (capHeight + xHeight) / 2}
					fontSize={11}
					fontFamily={MONO}
					dominantBaseline='middle'
				>
					cap height
				</text>
				<path d={`M${BRACKET_X + 20},${HERO_BASELINE_2 - xHeight}h8v${xHeight}h-8`} fill='none' strokeDasharray='2 3' />
				<text
					x={BRACKET_X + 46}
					y={HERO_BASELINE_2 - xHeight / 2}
					fontSize={11}
					fontFamily={MONO}
					dominantBaseline='middle'
				>
					x-height
				</text>
			</g>
		</svg>
	)
}

function findTerm(id: string) {
	for (const group of GROUPS) for (const term of group.terms) if (term.id === id) return term
	return null
}

function renderTerm(
	term: Term,
	family: string,
	fontWeight: number,
	width: number,
	height: number,
	lineHeightRatio?: number,
	trackingEm?: number,
	textBoxTrim?: TextBoxTrim,
) {
	if (term.multiLine) {
		const [line1, line2] = multiLayout(term.sample, term.fontSize, family, fontWeight, width, height, lineHeightRatio)
		return term.draw(line1, line2)
	}

	const layout = computeLayout(term.sample, term.fontSize, family, fontWeight, width, height)
	if (term.id === 'tracking') return term.draw({ ...layout, trackingEm })
	if (term.id === 'textboxtrim') return term.draw({ ...layout, textBoxTrim })
	return term.draw(layout)
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

	const fontWeight = WEIGHT_OPTIONS.find((option) => option.value === fontWeightSize)!.weight
	const leadingRatio = LEADING_OPTIONS.find((option) => option.value === leadingSize)!.ratio
	const trackingEm = TRACKING_OPTIONS.find((option) => option.value === trackingSize)!.em

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
					<div className='border-b border-base-300 overflow-hidden'>
						<AnatomyHero family={family} />
					</div>
					<header className='px-8 pt-14 pb-10 border-b border-base-300'>
						<p className='font-mono text-xs tracking-[.18em] uppercase text-base-content/40 mb-3'>
							OpenType · CSS · Reference
						</p>
						<h1 className='font-[Instrument_Serif] text-[clamp(2.6rem,4.5vw,3.8rem)] leading-[1.1] tracking-tight mb-3'>
							Typography Metrics
						</h1>
						<p className='text-sm text-base-content/60 max-w-prose leading-relaxed'>
							A visual glossary of the measurements and terminology used to describe the anatomy of a typeface. Hover
							any term to see it illustrated.
						</p>
					</header>
					<div className={`main-grid${isMobile ? ' mobile' : ''}`}>
						<div ref={panelRef} className='diagram-panel sticky top-6' style={isMobile ? { width: '100%' } : undefined}>
							<div className='rounded-box border border-base-300 bg-base-200 overflow-hidden'>
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
								<svg
									viewBox={`0 0 ${width} ${height}`}
									width={width}
									height={height}
									style={{ display: 'block' }}
									aria-label={activeTerm?.name ?? 'Typography metrics diagram'}
								>
									{activeTerm ? (
										renderTerm(
											activeTerm,
											family,
											fontWeight,
											width,
											height,
											activeTerm.multiLine ? leadingRatio : undefined,
											trackingEm,
											textBoxTrim,
										)
									) : (
										<Idle width={width} height={height} family={family} fontWeight={fontWeight} />
									)}
								</svg>
								<div className='flex items-center justify-between px-4 py-2.5 border-t border-base-300 min-h-10'>
									<span className='font-mono text-xs text-base-content/50'>{activeTerm?.name ?? ''}</span>
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
							</div>
							{!isMobile && (
								<p className='pin-hint text-center font-mono text-xs text-base-content/25 mt-2'>
									Click to pin · <kbd className='kbd kbd-xs'>Esc</kbd> to unpin
								</p>
							)}
						</div>
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
					</div>
				</div>
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
