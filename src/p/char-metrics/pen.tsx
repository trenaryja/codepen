import { RadioGroup, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

// ── Constants ──────────────────────────────────────────────────────────────────
const FONTS: Record<string, string> = {
	serif: 'Georgia, "Times New Roman", serif',
	sans: 'system-ui, "Helvetica Neue", Arial, sans-serif',
	mono: '"Courier New", Courier, monospace',
}
const ACCENT = 'var(--color-primary)'
const FG = 'var(--color-base-content)'
const BG = 'var(--color-base-100)'
const MONO = `'DM Mono', monospace`
const BASE_CH = 400
const HERO_FONT_SIZE = 120

// ── Measurement (offscreen canvas — no rendering) ─────────────────────────────
const _mx = document.createElement('canvas').getContext('2d')!
function px(size: number, font: string, weight = 400) {
	return `${weight} ${size}px ${FONTS[font]}`
}
function measure(text: string, fs: string) {
	_mx.font = fs
	return _mx.measureText(text)
}

// ── SVG primitives ─────────────────────────────────────────────────────────────
type Color = string
const lw = { strokeWidth: 1.5 }
const mono = { fontSize: 10.5, fontFamily: MONO }

function HLine({
	y,
	cw,
	color = ACCENT,
	label,
	dashed,
	side = 'right',
	alpha = 1,
}: {
	y: number
	cw: number
	color?: Color
	label?: string | null
	dashed?: boolean
	side?: 'left' | 'right'
	alpha?: number
}) {
	return (
		<g opacity={alpha} stroke={color} fill={color}>
			<line x1={0} y1={y} x2={cw} y2={y} {...lw} strokeDasharray={dashed ? '4 5' : undefined} />
			{label && (
				<text
					x={side === 'right' ? cw - 8 : 8}
					y={y - 4}
					{...mono}
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
	ch,
	color = ACCENT,
	label,
	dashed,
	alpha = 1,
}: {
	x: number
	ch: number
	color?: Color
	label?: string | null
	dashed?: boolean
	alpha?: number
}) {
	return (
		<g opacity={alpha} stroke={color} fill={color}>
			<line x1={x} y1={0} x2={x} y2={ch} {...lw} strokeDasharray={dashed ? '4 5' : undefined} />
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
	const d = above ? -1 : 1
	return (
		<g stroke={color} fill={color}>
			<path
				d={`M${x1},${y - d * tick}V${y + d * tick}M${x1},${y}H${x2}M${x2},${y - d * tick}V${y + d * tick}`}
				{...lw}
				fill='none'
			/>
			{label && (
				<text x={(x1 + x2) / 2} y={y + d * (tick + 14)} {...mono} textAnchor='middle' stroke='none'>
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
	const d = right ? 1 : -1
	return (
		<g stroke={color} fill={color}>
			<path
				d={`M${x - d * tick},${y1}H${x + d * tick}M${x},${y1}V${y2}M${x - d * tick},${y2}H${x + d * tick}`}
				{...lw}
				fill='none'
			/>
			{label && (
				<text x={x + d * (tick + 4)} y={(y1 + y2) / 2 + 4} {...mono} textAnchor={right ? 'start' : 'end'} stroke='none'>
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
	const r = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
	return (
		<>
			{fill && <rect {...r} fill={color} opacity={fillOpacity} />}
			<rect {...r} stroke={color} strokeWidth={strokeWidth} fill='none' strokeDasharray={dashed ? '3 4' : undefined} />
		</>
	)
}

function Char({
	text,
	fs,
	x,
	baseline,
	alpha = 1,
	color = FG,
}: {
	text: string
	fs: string
	x: number
	baseline: number
	alpha?: number
	color?: Color
}) {
	return (
		<text x={x} y={baseline} style={{ font: fs }} fill={color} opacity={alpha} dominantBaseline='alphabetic'>
			{text}
		</text>
	)
}

function Label({
	text,
	x,
	y,
	color = ACCENT,
	align = 'end' as CanvasTextAlign,
	alpha = 1,
}: {
	text: string
	x: number
	y: number
	color?: Color
	align?: string
	alpha?: number
}) {
	const ta = align === 'left' ? 'start' : align === 'center' ? 'middle' : 'end'
	return (
		<text x={x} y={y} fill={color} opacity={alpha} {...mono} textAnchor={ta} stroke='none'>
			{text}
		</text>
	)
}

// ── Layout ─────────────────────────────────────────────────────────────────────
interface Layout {
	cw: number
	ch: number
	fs: string
	fontSize: number
	fontAscent: number
	fontDescent: number
	capHeight: number
	xHeight: number
	descDepth: number
	ascHeight: number
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
	font: string,
	fontWeight: number,
	cw: number,
	ch: number,
): Layout {
	const fs = px(Math.round((fontSize * ch) / BASE_CH), font, fontWeight)
	_mx.font = fs
	const sm = _mx.measureText(sample)
	const capHeight = _mx.measureText('H').actualBoundingBoxAscent
	const xHeight = _mx.measureText('x').actualBoundingBoxAscent
	const descDepth = _mx.measureText('p').actualBoundingBoxDescent
	const ascHeight = _mx.measureText('hd').actualBoundingBoxAscent
	const { fontBoundingBoxAscent: fontAscent, fontBoundingBoxDescent: fontDescent, width: advance } = sm
	const charX = (cw - advance) / 2
	const baselineY = (ch - fontAscent - fontDescent) / 2 + fontAscent
	return {
		cw,
		ch,
		fs,
		fontSize: Math.round((fontSize * ch) / BASE_CH),
		fontAscent,
		fontDescent,
		capHeight,
		xHeight,
		descDepth,
		ascHeight,
		advance,
		charX,
		baselineY,
		sample,
		inkLeft: charX - sm.actualBoundingBoxLeft,
		inkRight: charX + sm.actualBoundingBoxRight,
		inkTop: baselineY - sm.actualBoundingBoxAscent,
		inkBottom: baselineY + sm.actualBoundingBoxDescent,
	}
}

function multiLayout(
	sample: string,
	fontSize: number,
	font: string,
	fontWeight: number,
	cw: number,
	ch: number,
	lineHeightRatio?: number,
): [Layout, Layout] {
	const calcLineH = (L: Layout) =>
		lineHeightRatio === 0
			? L.fontAscent + L.fontDescent
			: lineHeightRatio != null
				? lineHeightRatio * L.fontSize
				: L.fontAscent + L.fontDescent + L.fontSize * 0.22

	let L = computeLayout(sample, fontSize, font, fontWeight, cw, ch)
	let lineH = calcLineH(L)
	const totalH = lineH + L.fontAscent + L.fontDescent
	if (totalH > ch - 32) {
		L = computeLayout(sample, Math.round(fontSize * ((ch - 32) / totalH)), font, fontWeight, cw, ch)
		lineH = calcLineH(L)
	}

	const by1 = (ch - lineH - L.fontAscent - L.fontDescent) / 2 + L.fontAscent
	return [
		{ ...L, baselineY: by1 },
		{ ...L, baselineY: by1 + lineH },
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

// ratio: 0 is a sentinel meaning lineH = fontAscent + fontDescent (zero extra leading, lines touch)
const LEADING_OPTIONS = [
	{ value: 'none', label: 'none', ratio: 0 },
	{ value: 'xs', label: 'xs', ratio: 1.25 },
	{ value: 'sm', label: 'sm', ratio: 1.375 },
	{ value: 'md', label: 'md', ratio: 1.5 },
	{ value: 'lg', label: 'lg', ratio: 1.75 },
	{ value: 'xl', label: 'xl', ratio: 2 },
] as const
type LeadingSize = (typeof LEADING_OPTIONS)[number]['value']

// ── Terms ──────────────────────────────────────────────────────────────────────
interface Term {
	id: string
	name: string
	sample: string
	fontSize: number
	multiLine?: boolean
	def: string
	draw(L: Layout, L2?: Layout): ReactNode
}
interface Group {
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
				def: 'The invisible horizontal line on which glyphs sit. Every other vertical metric is measured relative to the baseline. In CSS, vertical-align and line-height are both anchored here.',
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine cw={L.cw} y={L.baselineY} label='baseline' />
					</>
				),
			},
			{
				id: 'xheight',
				name: 'x-height',
				sample: 'xag',
				fontSize: 140,
				def: 'The height of lowercase letters without ascenders or descenders, typically measured on "x". A larger x-height relative to cap height improves readability at small sizes.',
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine cw={L.cw} y={L.baselineY} color={FG} dashed alpha={0.12} />
						<HLine cw={L.cw} y={L.baselineY - L.xHeight} label='x-height' />
						<VBracket x={L.charX - 18} y1={L.baselineY - L.xHeight} y2={L.baselineY} right={false} />
					</>
				),
			},
			{
				id: 'capheight',
				name: 'cap height',
				sample: 'Hx',
				fontSize: 140,
				def: 'The height of uppercase flat letters (H, I, E) measured from the baseline. Usually slightly shorter than the ascender line. Exposed in CSS via the cap unit.',
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine cw={L.cw} y={L.baselineY} color={FG} dashed alpha={0.12} />
						<HLine cw={L.cw} y={L.baselineY - L.capHeight} label='cap height' />
						<VBracket x={L.charX - 18} y1={L.baselineY - L.capHeight} y2={L.baselineY} right={false} />
					</>
				),
			},
			{
				id: 'ascender',
				name: 'ascender',
				sample: 'hd',
				fontSize: 140,
				def: 'The upward stroke of a lowercase letter extending above the x-height, as in b, d, h, k, l. In most typefaces the ascender line sits at or slightly above the cap height.',
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine cw={L.cw} y={L.baselineY} color={FG} dashed alpha={0.12} />
						<HLine cw={L.cw} y={L.baselineY - L.xHeight} color={FG} label='x-height' dashed alpha={0.25} />
						<HLine cw={L.cw} y={L.baselineY - L.ascHeight} label='ascender' />
						<VBracket x={L.charX - 18} y1={L.baselineY - L.ascHeight} y2={L.baselineY - L.xHeight} right={false} />
					</>
				),
			},
			{
				id: 'descender',
				name: 'descender',
				sample: 'pg',
				fontSize: 140,
				def: 'The downward stroke of a lowercase letter extending below the baseline, as in p, q, g, j, y. Descender depth varies widely and directly affects minimum comfortable line-height.',
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine cw={L.cw} y={L.baselineY} color={FG} dashed alpha={0.12} />
						<HLine cw={L.cw} y={L.baselineY + L.descDepth} label='descender' />
						<VBracket x={L.charX - 18} y1={L.baselineY} y2={L.baselineY + L.descDepth} right={false} />
					</>
				),
			},
			{
				id: 'font-ascent',
				name: 'font ascent',
				sample: 'A',
				fontSize: 150,
				def: "The maximum ascent declared in the font's OS/2 table (sTypoAscender). Used by the browser to compute line box height. May exceed any individual glyph's actual ink to reserve space for all possible characters.",
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine
							cw={L.cw}
							y={L.baselineY - L.capHeight}
							color={FG}
							label='cap height'
							side='left'
							dashed
							alpha={0.25}
						/>
						<HLine cw={L.cw} y={L.baselineY - L.fontAscent} label='font ascent' />
						<VBracket
							x={L.cw - 22}
							y1={L.baselineY - L.fontAscent}
							y2={L.baselineY - L.capHeight}
							label='gap'
							right={false}
						/>
					</>
				),
			},
			{
				id: 'font-descent',
				name: 'font descent',
				sample: 'p',
				fontSize: 150,
				def: "The maximum descent declared in the font tables (sTypoDescent). Together with font ascent it defines the em-relative line box. Often deeper than any glyph's actual descender.",
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<HLine cw={L.cw} y={L.baselineY} color={FG} dashed alpha={0.12} />
						<HLine
							cw={L.cw}
							y={L.baselineY + L.descDepth}
							color={FG}
							label='ink descent'
							side='left'
							dashed
							alpha={0.25}
						/>
						<HLine cw={L.cw} y={L.baselineY + L.fontDescent} label='font descent' />
						{L.fontDescent - L.descDepth > 2 && (
							<VBracket
								x={L.cw - 22}
								y1={L.baselineY + L.descDepth}
								y2={L.baselineY + L.fontDescent}
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
				def: 'Rounded or pointed glyphs (O, o, A, V) extend slightly beyond the baseline and cap height to compensate for optical illusion. Without overshoot, round letters appear shorter than flat-topped ones.',
				draw: (L) => {
					const capY = L.baselineY - measure('H', L.fs).actualBoundingBoxAscent
					const oTopY = L.baselineY - measure('O', L.fs).actualBoundingBoxAscent
					const over = capY - oTopY
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<HLine cw={L.cw} y={capY} color={FG} label='cap height (H)' side='left' dashed alpha={0.35} />
							{over > 4 ? (
								<>
									<HLine cw={L.cw} y={oTopY} label='O overshoot' />
									<VBracket x={L.cw - 22} y1={oTopY} y2={capY} label='overshoot' right={false} />
								</>
							) : (
								<>
									<HLine cw={L.cw} y={oTopY} />
									{over > 1 && <Label text={`O overshoot (+${over.toFixed(1)}px)`} x={L.cw - 8} y={oTopY - 5} />}
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
				def: 'The total horizontal distance the cursor advances after placing a glyph. Includes ink width plus side bearings on both sides. CSS letter-spacing and word-spacing operate on this value.',
				draw: (L) => {
					const y = Math.min(L.baselineY + L.fontDescent + 22, L.ch - 26)
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<VLine x={L.charX} ch={L.ch} dashed alpha={0.25} />
							<VLine x={L.charX + L.advance} ch={L.ch} dashed alpha={0.25} />
							<HBracket x1={L.charX} x2={L.charX + L.advance} y={y} label='advance width' above={false} />
						</>
					)
				},
			},
			{
				id: 'lsb',
				name: 'left sidebearing',
				sample: 'H',
				fontSize: 150,
				def: "The horizontal space from the glyph's origin to its leftmost ink edge. Controls visual rhythm on the left side. Negative values allow ink to extend beyond the origin point.",
				draw: (L) => {
					const y = Math.min(L.baselineY + L.fontDescent + 14, L.ch - 26)
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<VLine x={L.charX} ch={L.ch} color={FG} label='origin' dashed alpha={0.35} />
							<VLine x={L.inkLeft} ch={L.ch} dashed alpha={0.5} />
							{Math.abs(L.inkLeft - L.charX) > 1 && (
								<HBracket x1={L.charX} x2={L.inkLeft} y={y} label='LSB' above={false} />
							)}
						</>
					)
				},
			},
			{
				id: 'rsb',
				name: 'right sidebearing',
				sample: 'H',
				fontSize: 150,
				def: "The space from a glyph's rightmost ink edge to its advance point. Together with LSB, RSB determines the white space surrounding each character and controls visual rhythm.",
				draw: (L) => {
					const rsbEnd = L.charX + L.advance
					const y = Math.min(L.baselineY + L.fontDescent + 14, L.ch - 26)
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<VLine x={L.inkRight} ch={L.ch} dashed alpha={0.5} />
							<VLine x={rsbEnd} ch={L.ch} color={FG} label='advance' dashed alpha={0.35} />
							{rsbEnd - L.inkRight > 1 && <HBracket x1={L.inkRight} x2={rsbEnd} y={y} label='RSB' above={false} />}
						</>
					)
				},
			},
			{
				id: 'inkwidth',
				name: 'ink width',
				sample: 'H',
				fontSize: 150,
				def: "The actual horizontal extent of a glyph's visible ink, from leftmost to rightmost pixel. Does not include side bearings. Useful for optical centering or tight layout calculations.",
				draw: (L) => {
					const y = Math.min(L.baselineY + L.fontDescent + 14, L.ch - 26)
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<VLine x={L.inkLeft} ch={L.ch} dashed alpha={0.4} />
							<VLine x={L.inkRight} ch={L.ch} dashed alpha={0.4} />
							<HBracket x1={L.inkLeft} x2={L.inkRight} y={y} label='ink width' above={false} />
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
				def: 'The design space in which each glyph is drawn. Historically the height of a capital "M". In digital type it\'s a conceptual square equal to the font-size, subdivided into UPM units.',
				draw: (L) => {
					const [t, b] = [L.baselineY - L.fontAscent, L.baselineY + L.fontDescent]
					return (
						<>
							<Rect x1={L.charX} y1={t} x2={L.charX + L.advance} y2={b} fill fillOpacity={0.07} />
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<Label text='em square' x={L.charX + L.advance / 2} y={t - 7} align='center' />
						</>
					)
				},
			},
			{
				id: 'inkbounds',
				name: 'ink bounds',
				sample: 'A',
				fontSize: 150,
				def: "The tightest rectangle containing a glyph's actual rendered pixels. Known as actualBoundingBox in the Canvas API. Varies per character—unlike font bounds which are constant declared values.",
				draw: (L) => (
					<>
						<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
						<Rect x1={L.inkLeft} y1={L.inkTop} x2={L.inkRight} y2={L.inkBottom} fill />
						<Label text='ink bounds' x={L.inkLeft} y={L.inkTop - 7} align='left' />
					</>
				),
			},
			{
				id: 'fontbounds',
				name: 'font bounds',
				sample: 'A',
				fontSize: 150,
				def: 'The rectangle defined by declared font metrics: (ascent + descent) × advance width. May be much larger than the actual ink. CSS layout operates on font bounds—this is what line-height and the box model use.',
				draw: (L) => {
					const [ft, fb] = [L.baselineY - L.fontAscent, L.baselineY + L.fontDescent]
					return (
						<>
							<Rect x1={L.charX} y1={ft} x2={L.charX + L.advance} y2={fb} fill fillOpacity={0.07} />
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<Rect x1={L.inkLeft} y1={L.inkTop} x2={L.inkRight} y2={L.inkBottom} color={FG} strokeWidth={1} dashed />
							<Label
								text='ink'
								x={L.inkRight + 4}
								y={(L.inkTop + L.inkBottom) / 2}
								color={FG}
								align='left'
								alpha={0.4}
							/>
							<Label text='font bounds' x={L.charX + L.advance - 4} y={ft - 7} />
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
				def: "Extra vertical space added between lines of text, beyond the font's ascent + descent. Named for the lead strips typesetters placed between rows of metal type. In CSS it's part of line-height.",
				draw: (L1, L2) => {
					if (!L2) return null
					const [gapTop, gapBot] = [L1.baselineY + L1.fontDescent, L2.baselineY - L2.fontAscent]
					return (
						<>
							<Char text={L1.sample} fs={L1.fs} x={L1.charX} baseline={L1.baselineY} />
							<Char text={L2.sample} fs={L2.fs} x={L2.charX} baseline={L2.baselineY} />
							<HLine cw={L1.cw} y={gapTop} dashed label='font descent' side='right' />
							<HLine cw={L1.cw} y={gapBot} dashed label='font ascent' side='left' />
							{gapBot > gapTop + 1 && (
								<>
									<rect x={0} y={gapTop} width={L1.cw} height={gapBot - gapTop} fill={ACCENT} opacity={0.14} />
									<VBracket x={L1.cw - 18} y1={gapTop} y2={gapBot} label='leading' right={false} />
								</>
							)}
							<HLine cw={L1.cw} y={L1.baselineY} color={FG} dashed alpha={0.18} />
							<HLine cw={L1.cw} y={L2.baselineY} color={FG} dashed alpha={0.18} />
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
				def: 'The total vertical distance from one baseline to the next. Equals font ascent + font descent + leading. In CSS the line-height property sets this; extra space distributes equally above and below as half-leading.',
				draw: (L1, L2) => {
					if (!L2) return null
					return (
						<>
							<Char text={L1.sample} fs={L1.fs} x={L1.charX} baseline={L1.baselineY} />
							<Char text={L2.sample} fs={L2.fs} x={L2.charX} baseline={L2.baselineY} />
							<HLine cw={L1.cw} y={L1.baselineY} color={FG} label='baseline 1' dashed alpha={0.4} />
							<HLine cw={L1.cw} y={L2.baselineY} color={FG} label='baseline 2' dashed alpha={0.4} />
							<VBracket x={L1.cw - 18} y1={L1.baselineY} y2={L2.baselineY} label='line-height' right={false} />
						</>
					)
				},
			},
			{
				id: 'tracking',
				name: 'tracking',
				sample: 'HELLO',
				fontSize: 64,
				def: 'Uniform horizontal spacing applied equally between all glyphs in a text run. Called letter-spacing in CSS. Unlike kerning, tracking is a constant additive value—not glyph-pair-specific.',
				draw: (L) => {
					const chars = 'HELLO'.split('')
					_mx.font = L.fs
					const widths = chars.map((c) => _mx.measureText(c).width)
					const track = (L.trackingEm ?? 0.1) * L.fontSize
					let x = (L.cw - widths.reduce((a, b) => a + b, 0) - track * (chars.length - 1)) / 2
					return (
						<>
							{chars.map((ch, i) => {
								const cx = x
								x += widths[i] + track
								return (
									<g key={`${ch}-${Math.round(cx)}`}>
										<text x={cx} y={L.baselineY} style={{ font: L.fs }} fill={FG} dominantBaseline='alphabetic'>
											{ch}
										</text>
										{i < chars.length - 1 && track > 0 && (
											<rect
												x={cx + widths[i]}
												y={L.baselineY - L.xHeight}
												width={track}
												height={L.xHeight}
												fill={ACCENT}
												opacity={0.22}
											/>
										)}
									</g>
								)
							})}
							<Label text='tracking gaps' x={L.cw / 2} y={L.baselineY + L.fontDescent + 20} align='center' />
						</>
					)
				},
			},
			{
				id: 'kerning',
				name: 'kerning',
				sample: 'AV',
				fontSize: 130,
				def: "Optical spacing adjustment between specific glyph pairs, encoded in the font's GPOS or kern table. The AV pair is a classic example: without kerning there's a visible gap that kerning tightens for visual balance.",
				draw: (L) => {
					const aW = measure('A', L.fs).width
					const kern = aW + measure('V', L.fs).width - measure('AV', L.fs).width
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							{kern > 0.5 ? (
								<>
									<rect
										x={L.charX + aW - kern}
										y={L.baselineY - L.capHeight}
										width={kern}
										height={L.capHeight + L.descDepth}
										fill={ACCENT}
										opacity={0.22}
									/>
									<HBracket
										x1={L.charX + aW - kern}
										x2={L.charX + aW}
										y={L.baselineY + L.fontDescent + 12}
										label={`kern −${kern.toFixed(1)}px`}
										above={false}
									/>
								</>
							) : (
								<>
									<VLine x={L.charX + aW} ch={L.ch} color={FG} label='A/V junction' dashed alpha={0.35} />
									<Label
										text='no kern pair in this font'
										x={L.cw / 2}
										y={L.baselineY + L.fontDescent + 22}
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
				def: 'The enclosed or partially enclosed negative space within a glyph. The fully enclosed hole in O or D is a closed counter; the open concavity in c or u is an open counter. Counter size shapes perceived weight.',
				draw: (L) => {
					const cx = L.charX + L.advance / 2
					const cy = L.baselineY - L.capHeight * 0.5
					const r = L.xHeight * 0.34
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<circle cx={cx} cy={cy} r={r} fill={ACCENT} opacity={0.2} />
							<circle cx={cx} cy={cy} r={r} stroke={ACCENT} strokeWidth={1.5} fill='none' opacity={0.7} />
							<Label text='counter' x={L.cw - 10} y={cy - r - 8} />
							<line
								x1={L.cw - 60}
								y1={cy - r - 5}
								x2={cx + r + 2}
								y2={cy - r * 0.5}
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
				def: "The primary vertical or near-vertical stroke of a letter—the two upright strokes in H, or the single stroke in I. Stem width is a primary variable in determining a typeface's perceived weight.",
				draw: (L) => {
					// Pixel-scan at 20% cap height — above baseline serifs, below crossbar
					const oc = document.createElement('canvas')
					oc.width = 400
					oc.height = 400
					const ox = oc.getContext('2d')!
					ox.font = L.fs
					ox.fillStyle = '#fff'
					ox.textBaseline = 'alphabetic'
					ox.fillText('H', 0, 300)
					const row = ox.getImageData(0, Math.round(300 - L.capHeight * 0.2), 400, 1).data
					let start = -1
					let stemSeg: [number, number] | null = null
					for (let x = 0; x < 400; x++) {
						const ink = row[x * 4 + 3] > 128
						if (ink && start < 0) start = x
						if (!ink && start >= 0) {
							stemSeg = [start, x - 1]
							break
						}
					}
					if (!stemSeg) return null
					const [sl, sw] = [L.charX + stemSeg[0], stemSeg[1] - stemSeg[0] + 1]
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<rect x={sl} y={L.baselineY - L.capHeight} width={sw} height={L.capHeight} fill={ACCENT} opacity={0.22} />
							<HBracket x1={sl} x2={sl + sw} y={Math.max(L.baselineY - L.capHeight - 14, 34)} label='stem' />
						</>
					)
				},
			},
			{
				id: 'bowl',
				name: 'bowl',
				sample: 'b',
				fontSize: 150,
				def: 'The curved closed stroke forming the rounded part of letters like b, d, o, p, q. Bowl size and shape create the distinctive silhouette of a typeface and affect its texture at small sizes.',
				draw: (L) => {
					const oc = document.createElement('canvas')
					oc.width = 400
					oc.height = 400
					const ox = oc.getContext('2d')!
					ox.font = L.fs
					ox.fillStyle = '#fff'
					ox.textBaseline = 'alphabetic'
					ox.fillText('b', 0, 300)

					// Horizontal scan at mid x-height: find stem → gap → bowl start
					const row = ox.getImageData(0, Math.round(300 - L.xHeight * 0.5), 400, 1).data
					let phase = 0 // 0=before stem, 1=in stem, 2=in gap, 3=found bowl
					let bowlStart = -1
					for (let x = 0; x < 400 && phase < 3; x++) {
						const ink = row[x * 4 + 3] > 128
						if (phase === 0 && ink) phase = 1
						else if (phase === 1 && !ink) phase = 2
						else if (phase === 2 && ink) {
							bowlStart = x
							phase = 3
						}
					}
					if (bowlStart < 0) return null

					// Vertical scan at bowl midpoint to find top/bottom of bowl ink
					const bowlRight = Math.round(L.inkRight - L.charX)
					const col = ox.getImageData(Math.round((bowlStart + bowlRight) / 2), 0, 1, 400).data
					let bowlTop = -1,
						bowlBot = 300
					for (let y = 0; y < 400; y++) {
						if (col[y * 4 + 3] > 128) {
							if (bowlTop < 0) bowlTop = y
							bowlBot = y
						}
					}
					if (bowlTop < 0) return null

					// Convert offscreen canvas coords (baseline=300) to SVG coords
					const bx = L.charX + bowlStart
					const bw = L.inkRight - bx
					const bTop = L.baselineY + (bowlTop - 300)
					const bH = bowlBot - bowlTop + 1

					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<rect x={bx} y={bTop} width={bw} height={bH} fill={ACCENT} opacity={0.22} />
							<HBracket x1={bx} x2={bx + bw} y={Math.max(bTop - 14, 26)} label='bowl' />
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
				def: 'The extra space above and below inline text produced by the gap between line-height and the em square, split equally top and bottom. This phantom padding is why CSS text appears to have mysterious vertical spacing.',
				draw: (L) => {
					const half = L.fontSize * 0.125
					const topHL = L.baselineY - L.fontAscent - half
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<rect x={0} y={topHL} width={L.cw} height={half} fill={ACCENT} opacity={0.14} />
							<rect x={0} y={L.baselineY + L.fontDescent} width={L.cw} height={half} fill={ACCENT} opacity={0.14} />
							<HLine cw={L.cw} y={L.baselineY - L.fontAscent} color={FG} label='font ascent' dashed alpha={0.3} />
							<HLine
								cw={L.cw}
								y={L.baselineY + L.fontDescent}
								color={FG}
								label='font descent'
								side='left'
								dashed
								alpha={0.3}
							/>
							<VBracket x={10} y1={topHL} y2={L.baselineY - L.fontAscent} label='½ lead' right />
							<VBracket
								x={10}
								y1={L.baselineY + L.fontDescent}
								y2={L.baselineY + L.fontDescent + half}
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
				def: 'A CSS property (text-box: trim-both) that removes half-leading from the top and bottom of a text block. Allows containers to size tightly to cap height or x-height, enabling precise spacing without magic-number padding.',
				draw: (L) => {
					const half = L.fontSize * 0.125
					const [normT, normB] = [L.baselineY - L.fontAscent - half, L.baselineY + L.fontDescent + half]
					const trim = L.textBoxTrim ?? 'both'
					const trimT = trim === 'end' ? normT : L.baselineY - L.capHeight
					const trimB = trim === 'start' ? normB : L.baselineY + L.descDepth
					return (
						<>
							<Char text={L.sample} fs={L.fs} x={L.charX} baseline={L.baselineY} />
							<Rect
								x1={L.charX - 8}
								y1={normT}
								x2={L.charX + L.advance + 8}
								y2={normB}
								color={FG}
								strokeWidth={1}
								dashed
							/>
							<Label
								text='default'
								x={L.charX - 10}
								y={normT - 7}
								color={FG}
								align='left'
								alpha={trim === 'none' ? 0.7 : 0.35}
							/>
							{trim !== 'none' && (
								<>
									<Rect
										x1={L.charX - 8}
										y1={trimT}
										x2={L.inkRight + 8}
										y2={trimB}
										fill
										fillOpacity={0.08}
										strokeWidth={1.5}
									/>
									<Label text={`trim-${trim}`} x={L.inkRight + 12} y={trimT - 7} align='left' />
								</>
							)}
						</>
					)
				},
			},
		],
	},
]

// ── Idle diagram ───────────────────────────────────────────────────────────────
function Idle({ cw, ch, font, fontWeight }: { cw: number; ch: number; font: string; fontWeight: number }) {
	const L = computeLayout('Ag', 140, font, fontWeight, cw, ch)
	const lines: [number, string][] = [
		[L.baselineY, 'baseline'],
		[L.baselineY - L.xHeight, 'x-height'],
		[L.baselineY - L.capHeight, 'cap height'],
		[L.baselineY - L.fontAscent, 'ascent'],
		[L.baselineY + L.fontDescent, 'descent'],
		[L.baselineY + L.descDepth, 'descender'],
	]
	return (
		<>
			<Char text='Ag' fs={L.fs} x={L.charX} baseline={L.baselineY} color={FG} alpha={0.08} />
			{lines.map(([y, label]) => (
				<g key={label}>
					<line x1={0} y1={y} x2={cw} y2={y} stroke={FG} strokeWidth={1} strokeDasharray='3 6' opacity={0.08} />
					<text x={cw - 8} y={y - 3} fill={FG} opacity={0.12} fontSize={10} fontFamily={MONO} textAnchor='end'>
						{label}
					</text>
				</g>
			))}
		</>
	)
}

// ── Hero geometry ─────────────────────────────────────────────────────────────
// Every annotation on the hero is derived by rasterizing a single glyph to a
// detached canvas and scanning it for ink transitions, so the callouts follow
// whichever font is selected instead of being pinned to one measured typeface.
//
// Highlights are never drawn as approximate shapes. Each one re-renders the
// word in ACCENT and clips it to a measured region, so the colour lands exactly
// on the letterform; counters — which are holes, not ink — invert that and mask
// the word out of a filled rect instead.
//
// `heroGeometry` is referentially transparent: the canvases it allocates are
// never attached to the document and no module state is touched, so the same
// font always yields the same coordinates and it memoizes safely on `font`.

const HERO_W = 900
const HERO_H = 480
const HERO_WEIGHT = 700
const HERO_L1 = Math.round(HERO_H * 0.4)
const HERO_L2 = Math.round(HERO_H * 0.83)
const LINE_1 = 'Anatomy' // A=0 n=1 a=2 t=3 o=4 m=5 y=6
const LINE_2 = 'of Type' // o=0 f=1 ' '=2 T=3 y=4 p=5 e=6
const SCAN = 400 // offscreen scan canvas, px square
const SCAN_BASELINE = 300 // where the glyph sits inside that canvas
const INK = 128 // alpha above which a pixel counts as ink

type Point = { x: number; y: number }
type Box = { x: number; y: number; width: number; height: number }
type Span = [start: number, end: number]

type Raster = {
	ink: (x: number, y: number) => boolean
	advance: number
}

// Draw one glyph in isolation and expose an ink predicate over its pixels.
// A single getImageData readback backs every scan below.
function rasterize(char: string, fs: string): Raster {
	const canvas = document.createElement('canvas')
	canvas.width = SCAN
	canvas.height = SCAN
	const ctx = canvas.getContext('2d')!
	ctx.font = fs
	ctx.fillStyle = '#fff'
	ctx.textBaseline = 'alphabetic'
	ctx.fillText(char, 0, SCAN_BASELINE)
	const { data } = ctx.getImageData(0, 0, SCAN, SCAN)
	return {
		ink: (x, y) => x >= 0 && x < SCAN && y >= 0 && y < SCAN && data[(y * SCAN + x) * 4 + 3] > INK,
		advance: ctx.measureText(char).width,
	}
}

// Contiguous ink spans along one row.
function rowSpans({ ink }: Raster, y: number, limit = SCAN): Span[] {
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

// Contiguous ink spans down one column.
function colSpans({ ink }: Raster, x: number): Span[] {
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

// Topmost ink row within a horizontal slice of the glyph.
function topRow(raster: Raster, x0 = 0, x1 = SCAN) {
	for (let y = 0; y < SCAN; y++) for (let x = x0; x < x1; x++) if (raster.ink(x, y)) return y
	return -1
}

// Bottommost ink row of the glyph.
function bottomRow(raster: Raster) {
	for (let y = SCAN - 1; y >= 0; y--) for (let x = 0; x < SCAN; x++) if (raster.ink(x, y)) return y
	return -1
}

// Outermost ink on all four sides.
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
	const vertical = colSpans(raster, probeX)
	if (vertical.length < 2) return null
	const top = vertical[0][1] + 1
	const bottom = vertical[1][0] - 1
	if (bottom < top) return null

	const midY = Math.round((top + bottom) / 2)
	const horizontal = rowSpans(raster, midY)
	if (horizontal.length < 2) return null
	const left = horizontal[0][1] + 1
	const right = horizontal[horizontal.length - 1][0] - 1
	if (right < left) return null

	return { top, bottom, left, right, midY }
}

// Apex of an arch or shoulder. Columns whose ink starts within `BAND` of the
// glyph's highest point form crests; the left stem's crest is dropped so
// `index` counts arches only.
function archApex(raster: Raster, index: number): Point | null {
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
	const arches = crests.filter(([s, e]) => (s + e) / 2 > width * 0.2)
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
	const inner: Array<{ left: number; right: number; y: number }> = []
	let merge = -1
	for (let y = top; y < SCAN; y++) {
		const spans = rowSpans(raster, y)
		if (spans.length >= 2) inner.push({ left: spans[0][1], right: spans[1][0], y })
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
	const carries = widthOf(probe[0]) >= widthOf(probe[1]) ? 'left' : 'right'

	// The seam runs along the *carrying* arm's inner edge. Always tracing the right
	// arm's edge instead only works when the right arm is the carrier: that edge
	// drifts left as it descends, which grows the highlight for a right-carrier but
	// eats into it for a left-carrier, notching the hairline's tip out of the tail.
	const seam: Point[] = inner.map((row) => ({ x: carries === 'left' ? row.left : row.right, y: row.y }))

	// The carrying arm's own span, so a callout can sit on the stroke. Averaging
	// the seam against an arm's outer edge lands short of it whenever the gap is
	// wider than the stroke — which is most of the way down.
	const sample = seam[Math.round(seam.length * 0.4)]
	const arm = rowSpans(raster, sample.y)[carries === 'left' ? 0 : 1]

	// Below the junction no scan can separate the strokes. Carry the seam one
	// stroke-width further on its own slope, enough to avoid a flat horizontal
	// slice across the diagonal, then stop: projecting it all the way down
	// instead follows a straight line while the tail curves away from it, and
	// shears the terminal off the end of the stroke.
	const recent = seam.slice(-8)
	const slope = (recent[recent.length - 1].x - recent[0].x) / Math.max(1, recent.length - 1)
	const last = seam[seam.length - 1]
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
function apertureGap(raster: Raster, xHeight: number): Point | null {
	const outside = outsideMask(raster)
	let best: Point | null = null
	let widest = 0
	for (let y = Math.round(SCAN_BASELINE - xHeight); y < SCAN_BASELINE; y++) {
		const spans = rowSpans(raster, y)
		for (let i = 1; i < spans.length; i++) {
			const from = spans[i - 1][1] + 1
			const to = spans[i][0] - 1
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
function crossbarTerminal(raster: Raster, xHeight: number): Point | null {
	const top = topRow(raster)
	if (top < 0) return null
	const floor = Math.round(SCAN_BASELINE - xHeight * 0.35)

	let best: Point | null = null
	for (let y = top; y <= floor; y++) {
		const spans = rowSpans(raster, y)
		if (!spans.length) continue
		const right = spans[spans.length - 1][1]
		if (!best || right > best.x) best = { x: right, y }
	}
	return best
}

function heroGeometry(font: string) {
	const fs = px(Math.round((HERO_FONT_SIZE * HERO_H) / BASE_CH), font, HERO_WEIGHT)

	// Local measuring context — heroGeometry must not disturb the shared one.
	const measurer = document.createElement('canvas').getContext('2d')!
	measurer.font = fs
	const capHeight = measurer.measureText('H').actualBoundingBoxAscent
	const xHeight = measurer.measureText('x').actualBoundingBoxAscent
	const ascent = measurer.measureText('f').actualBoundingBoxAscent
	const descent = measurer.measureText('p').actualBoundingBoxDescent

	// Kerning-aware per-character positions within a centred word.
	const charPos = (word: string) => {
		const x0 = (HERO_W - measurer.measureText(word).width) / 2
		return word.split('').map((char, i) => ({
			char,
			x: x0 + measurer.measureText(word.slice(0, i)).width,
			w: measurer.measureText(word.slice(0, i + 1)).width - measurer.measureText(word.slice(0, i)).width,
		}))
	}
	const anatomy = charPos(LINE_1)
	const ofType = charPos(LINE_2)
	const anatomyX0 = anatomy[0].x
	const ofTypeX0 = ofType[0].x

	// Canvas rows sit `SCAN_BASELINE` above their own origin; shift onto a text baseline.
	const onLine1 = (canvasY: number) => HERO_L1 + canvasY - SCAN_BASELINE
	const onLine2 = (canvasY: number) => HERO_L2 + canvasY - SCAN_BASELINE

	const capital = rasterize('A', fs)
	const enn = rasterize('n', fs)
	const ay = rasterize('a', fs)
	const tee = rasterize('t', fs)
	const oh = rasterize('o', fs)
	const emm = rasterize('m', fs)
	const why = rasterize('y', fs)
	const eff = rasterize('f', fs)
	const pee = rasterize('p', fs)

	// ── Crossbar of 'A' ───────────────────────────────────────────────────────
	// The centre column carries ink only where the crossbar crosses the counter.
	const capWidth = Math.round(capital.advance)
	const centreX = Math.round(capWidth * 0.48)
	const centreSpans = colSpans(capital, centreX).filter(
		([s]) => s > SCAN_BASELINE - capHeight * 0.75 && s < SCAN_BASELINE - capHeight * 0.1,
	)
	const barTop = centreSpans.length ? centreSpans[0][0] : Math.round(SCAN_BASELINE - capHeight * 0.44)
	const barBottom = centreSpans.length ? centreSpans[0][1] : Math.round(SCAN_BASELINE - capHeight * 0.36)

	// Sample the inner edges of both diagonals above the crossbar, then
	// extrapolate down their slope to get the trapezoid corners. Clipping the
	// glyph to that trapezoid isolates the bar without touching the legs.
	const legGap = (y: number): Span | null => {
		const spans = rowSpans(capital, y, capWidth + 4)
		return spans.length >= 2 ? [spans[0][1], spans[1][0]] : null
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

	// ── Counter of 'o' ────────────────────────────────────────────────────────
	// A hole, not ink: the box below is filled with ACCENT and the word is
	// masked back out of it, so what remains is precisely the enclosed void.
	const ohVoid = enclosedVoid(oh, Math.round(oh.advance * 0.5))
	const counterBox: Box = ohVoid
		? {
				x: anatomy[4].x + ohVoid.left,
				y: onLine1(ohVoid.top),
				width: ohVoid.right - ohVoid.left + 1,
				height: ohVoid.bottom - ohVoid.top + 1,
			}
		: {
				x: anatomy[4].x + oh.advance * 0.28,
				y: HERO_L1 - xHeight * 0.78,
				width: oh.advance * 0.44,
				height: xHeight * 0.56,
			}

	// ── Bowl of 'p' ───────────────────────────────────────────────────────────
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
				x: ofType[5].x + bowlLeft,
				y: onLine2(bowlTop) - 2,
				width: peeBounds.right - bowlLeft + 3,
				height: HERO_L2 - onLine2(bowlTop) + 3,
			}
		: { x: ofType[5].x, y: HERO_L2 - xHeight, width: ofType[5].w, height: xHeight }

	// ── Ascender of 'f' and descender of 'y' ──────────────────────────────────
	// Both are *parts* of a glyph, so each clip is a half-plane cut at the
	// x-height or the baseline rather than the whole character.
	const effBounds = inkBounds(eff)
	const ascenderBox: Box = {
		x: ofType[1].x + (effBounds ? effBounds.left - 3 : 0),
		y: 0,
		width: effBounds ? effBounds.right - effBounds.left + 7 : ofType[1].w,
		height: HERO_L2 - xHeight,
	}
	// Stopped at the next character's origin: 'y' overhangs its advance, and
	// without the clamp the box reaches far enough right to tint the 'p' stem.
	const whyBounds = inkBounds(why)
	const descenderLeft = ofType[4].x + (whyBounds ? whyBounds.left - 3 : 0)
	const descenderBox: Box = {
		x: descenderLeft,
		y: HERO_L2,
		width: Math.min(ofType[5].x, ofType[4].x + (whyBounds ? whyBounds.right + 4 : ofType[4].w)) - descenderLeft,
		height: HERO_H - HERO_L2,
	}
	// The descender's own ink, so its callout lands on the 'y' and not the 'p'.
	const whyTail = rowSpans(why, Math.round(SCAN_BASELINE + descent * 0.55))[0]
	const descenderDot: Point = {
		x: ofType[4].x + (whyTail ? (whyTail[0] + whyTail[1]) / 2 : why.advance * 0.4),
		y: HERO_L2 + descent * 0.55,
	}

	// ── The 'y' as two strokes, on line 1 ─────────────────────────────────────
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
					const glyphX = anatomy[6].x
					// Never left of the 'y' own advance origin. In a monospaced face its ink
					// starts within a pixel or two of that origin, so a bare margin reaches
					// back into the preceding 'm' and tints its serif.
					const left = glyphX + Math.max(0, whyLine1Bounds.left - 2)
					const right = glyphX + whyLine1Bounds.right + 2
					const topY = onLine1(arms.top) - 6
					const bottomY = onLine1(whyLine1Bounds.bottom) + 4
					const seamTopX = glyphX + arms.seam[0].x
					const seamEndY = onLine1(arms.seam[arms.seam.length - 1].y)
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
		? { x: anatomy[6].x + (arms.arm[0] + arms.arm[1]) / 2, y: onLine1(arms.sample.y) }
		: { x: anatomy[6].x + why.advance * 0.8, y: HERO_L1 - xHeight * 0.5 }

	// ── Remaining callout anchors ─────────────────────────────────────────────
	const capApex = topRow(capital, 0, capWidth)
	const capApexSpans = rowSpans(capital, capApex, capWidth)
	const uppercase: Point = capApexSpans.length
		? { x: anatomyX0 + (capApexSpans[0][0] + capApexSpans[capApexSpans.length - 1][1]) / 2, y: onLine1(capApex) }
		: { x: anatomy[0].x + anatomy[0].w * 0.5, y: HERO_L1 - capHeight }

	const nArch = archApex(enn, 0)
	const lowercase: Point = nArch
		? { x: anatomy[1].x + nArch.x, y: onLine1(nArch.y) }
		: { x: anatomy[1].x + anatomy[1].w * 0.6, y: HERO_L1 - xHeight }

	const mArch = archApex(emm, 0)
	const shoulder: Point = mArch
		? { x: anatomy[5].x + mArch.x, y: onLine1(mArch.y) }
		: { x: anatomy[5].x + anatomy[5].w * 0.4, y: HERO_L1 - xHeight }

	const gap = apertureGap(ay, xHeight)
	const aperture: Point = gap
		? { x: anatomy[2].x + gap.x, y: onLine1(gap.y) }
		: { x: anatomy[2].x + anatomy[2].w * 0.6, y: HERO_L1 - xHeight * 0.6 }

	const tip = crossbarTerminal(tee, xHeight)
	const terminal: Point = tip
		? { x: anatomy[3].x + tip.x, y: onLine1(tip.y) }
		: { x: anatomy[3].x + anatomy[3].w, y: HERO_L1 - xHeight }
	// A terminal is the free end of a stroke, so highlight a run of the crossbar
	// roughly as long as it is thick. A bare dot gave no sense of what it named.
	const crossbarColumn = tip
		? colSpans(tee, Math.max(0, tip.x - 5)).find(([s, e]) => tip.y >= s - 2 && tip.y <= e + 2)
		: undefined
	const terminalBox: Box | null = tip
		? {
				x: anatomy[3].x + tip.x - (crossbarColumn ? (crossbarColumn[1] - crossbarColumn[0] + 1) * 1.8 : 16),
				y: onLine1(crossbarColumn ? crossbarColumn[0] - 2 : tip.y - 8),
				width: (crossbarColumn ? (crossbarColumn[1] - crossbarColumn[0] + 1) * 1.8 : 16) + 4,
				height: crossbarColumn ? crossbarColumn[1] - crossbarColumn[0] + 5 : 16,
			}
		: null

	const effTop = topRow(eff)
	const effSpans = rowSpans(eff, effTop)
	const ascender: Point = effSpans.length
		? { x: ofType[1].x + (effSpans[0][0] + effSpans[effSpans.length - 1][1]) / 2, y: onLine2(effTop) }
		: { x: ofType[1].x + ofType[1].w * 0.5, y: HERO_L2 - ascent }

	return {
		fs,
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
		stem: { x: ofType[3].x + ofType[3].w * 0.5, y: HERO_L2 - capHeight * 0.48 },
		// Clear of whichever is wider — the default margin, or the second line
		// itself, which in a monospaced face runs far enough right to reach it.
		bracketX: Math.max(HERO_W - 160, ofTypeX0 + measurer.measureText(LINE_2).width + 14),
		// Top of the bowl's arc rather than its right edge, so the leader runs
		// straight up into open space instead of across the 'e'.
		bowl: { x: bowlBox.x + bowlBox.width * 0.5, y: bowlBox.y + 3 },
		descenderDot,
		guideYs: [
			...new Set([
				HERO_L1 - capHeight,
				HERO_L1 - xHeight,
				HERO_L1,
				HERO_L2 - capHeight,
				HERO_L2 - xHeight,
				HERO_L2,
				HERO_L2 + descent,
			]),
		],
	}
}

// ── Anatomy Hero ──────────────────────────────────────────────────────────────
function AnatomyHero({ font }: { font: string }) {
	const G = useMemo(() => heroGeometry(font), [font])
	const { anatomy, capHeight, xHeight, ascent, descent } = G

	// The two words, drawn at a given colour, as the base layer.
	const line1 = (fill: string) => (
		<text x={G.anatomyX0} y={HERO_L1} style={{ font: G.fs }} dominantBaseline='alphabetic' fill={fill}>
			{LINE_1}
		</text>
	)
	const line2 = (fill: string) => (
		<text x={G.ofTypeX0} y={HERO_L2} style={{ font: G.fs }} dominantBaseline='alphabetic' fill={fill}>
			{LINE_2}
		</text>
	)

	// Each highlight redraws a *single* glyph in ACCENT and clips it to a measured
	// region, which is what keeps the colour on the letterform. Redrawing the whole
	// word instead lets a clip tint whichever neighbour happens to reach into it —
	// Courier Bold's 'm' overflows its own advance far enough to catch the 'y'
	// stroke clip and pick up a blue serif. `charPos` positions include the run's
	// kerning, so a glyph drawn on its own lands exactly over its base-layer twin.
	const glyph = (char: string, x: number, baseline: number, fill: string) => (
		<text x={x} y={baseline} style={{ font: G.fs }} dominantBaseline='alphabetic' fill={fill}>
			{char}
		</text>
	)

	const callout = (text: string, dot: Point, lx: number, ly: number, anchor: 'start' | 'middle' | 'end' = 'middle') => (
		<g key={text}>
			{/* Ringed in the page colour so a dot stays legible whether it lands on
			    a plain letterform or inside one of the ACCENT highlights. */}
			<circle cx={dot.x} cy={dot.y} r={3.5} fill={ACCENT} stroke={BG} strokeWidth={1.5} />
			<line x1={dot.x} y1={dot.y} x2={lx} y2={ly} stroke={ACCENT} strokeWidth={1} opacity={0.55} />
			<text
				x={lx}
				y={ly}
				fill={FG}
				fontSize={12}
				fontFamily={MONO}
				textAnchor={anchor}
				dominantBaseline={ly <= dot.y ? 'auto' : 'hanging'}
				opacity={0.7}
			>
				{text}
			</text>
		</g>
	)

	const ABOVE1 = HERO_L1 - capHeight - 30
	const BELOW1 = HERO_L1 + 30
	const BELOW2 = HERO_L2 + descent + 22
	const BRACKET_X = G.bracketX

	// Labels in the top row are anchored to the feature they point at, which in a
	// monospaced face packs them close enough to touch. Nudge each one right of
	// its predecessor; the leader line keeps the association readable.
	const LABEL_GAP = 84
	const counterX = G.counterBox.x + G.counterBox.width / 2
	const topRowX = [G.uppercase.x, G.lowercase.x, counterX, G.shoulder.x]
	for (let i = 1; i < topRowX.length; i++) topRowX[i] = Math.max(topRowX[i], topRowX[i - 1] + LABEL_GAP)
	const edge = (chars: typeof anatomy, i: number) => chars[i].x + chars[i].w

	return (
		<svg
			viewBox={`0 0 ${HERO_W} ${HERO_H}`}
			width='100%'
			style={{ display: 'block' }}
			aria-label='Anatomy of Type — letterforms annotated with their anatomical feature names'
		>
			<defs>
				<clipPath id='hero-crossbar'>
					<polygon points={G.crossbar.clip} />
				</clipPath>
				<clipPath id='hero-stroke'>
					<polygon points={G.strokeClip} />
				</clipPath>
				<clipPath id='hero-bowl'>
					<rect {...G.bowlBox} />
				</clipPath>
				{G.terminalBox && (
					<clipPath id='hero-terminal'>
						<rect {...G.terminalBox} />
					</clipPath>
				)}
				<clipPath id='hero-ascender'>
					<rect {...G.ascenderBox} />
				</clipPath>
				<clipPath id='hero-descender'>
					<rect {...G.descenderBox} />
				</clipPath>
				{/* White where the counter box is, black where the glyph puts ink down —
				    so filling the box through this mask paints only the enclosed void. */}
				<mask id='hero-counter' maskUnits='userSpaceOnUse' x={0} y={0} width={HERO_W} height={HERO_H}>
					<rect {...G.counterBox} fill='white' />
					{glyph('o', G.anatomy[4].x, HERO_L1, 'black')}
				</mask>
			</defs>

			{G.guideYs.map((y) => (
				<line
					key={y}
					x1={0}
					y1={y}
					x2={HERO_W}
					y2={y}
					stroke={FG}
					strokeWidth={1}
					strokeDasharray='4 8'
					opacity={0.1}
				/>
			))}

			{/* Both words in full, then one clipped single-glyph ACCENT overlay per feature. */}
			{line1(FG)}
			{line2(FG)}

			<g clipPath='url(#hero-crossbar)'>{glyph('A', G.anatomy[0].x, HERO_L1, ACCENT)}</g>
			{G.strokeClip && <g clipPath='url(#hero-stroke)'>{glyph('y', G.anatomy[6].x, HERO_L1, ACCENT)}</g>}
			{G.terminalBox && <g clipPath='url(#hero-terminal)'>{glyph('t', G.anatomy[3].x, HERO_L1, ACCENT)}</g>}
			<g clipPath='url(#hero-bowl)'>{glyph('p', G.ofType[5].x, HERO_L2, ACCENT)}</g>
			<g clipPath='url(#hero-ascender)'>{glyph('f', G.ofType[1].x, HERO_L2, ACCENT)}</g>
			<g clipPath='url(#hero-descender)'>{glyph('y', G.ofType[4].x, HERO_L2, ACCENT)}</g>
			<rect {...G.counterBox} fill={ACCENT} mask='url(#hero-counter)' />

			{/* ── Labels — above line 1 ── */}
			{callout('uppercase', G.uppercase, topRowX[0], ABOVE1)}
			{callout('lowercase', G.lowercase, topRowX[1], ABOVE1)}
			{callout('counter', { x: counterX, y: G.counterBox.y + G.counterBox.height / 2 }, topRowX[2], ABOVE1)}
			{callout('shoulder', G.shoulder, topRowX[3], ABOVE1)}

			{/* ── Labels — below line 1 ── */}
			{callout('cross bar', G.crossbar.dot, G.crossbar.dot.x - 14, BELOW1, 'end')}
			{callout('aperture', G.aperture, anatomy[2].x + anatomy[2].w * 0.5 + 30, BELOW1, 'start')}
			{callout('terminal', G.terminal, anatomy[3].x + anatomy[3].w * 0.5 + 44, BELOW1, 'start')}
			{callout('stroke', G.stroke, edge(anatomy, 6) + 6, BELOW1, 'start')}

			{/* ── Labels — line 2 ── */}
			{callout('ascender', G.ascender, G.ofTypeX0 - 8, HERO_L2 - ascent + 14, 'end')}
			{callout('stem', G.stem, G.stem.x - 34, BELOW2, 'end')}
			{/* Routed up into the empty band between the two lines — to the right
			    the 'e' would sit on top of the label. */}
			{callout('bowl', G.bowl, G.bowl.x, HERO_L2 - capHeight - 16)}
			{callout('descender', G.descenderDot, G.descenderDot.x + 10, BELOW2, 'start')}
			{callout('baseline', { x: G.ofTypeX0 + 2, y: HERO_L2 }, G.ofTypeX0 - 6, HERO_L2 + 18, 'end')}

			{/* Right-side brackets. The two spans share a baseline, so nesting them
			    at one x drew them on top of each other: the x-height bracket is
			    inset instead, and each label sits beside the part of its own span
			    the other doesn't cover — keeping them capHeight/2 apart in any font. */}
			<g stroke={FG} strokeWidth={1} fill={FG} opacity={0.65}>
				<path d={`M${BRACKET_X},${HERO_L2 - capHeight}h8v${capHeight}h-8`} fill='none' />
				<text
					x={BRACKET_X + 46}
					y={HERO_L2 - (capHeight + xHeight) / 2}
					fontSize={11}
					fontFamily={MONO}
					dominantBaseline='middle'
				>
					cap height
				</text>
				<path d={`M${BRACKET_X + 20},${HERO_L2 - xHeight}h8v${xHeight}h-8`} fill='none' strokeDasharray='2 3' />
				<text x={BRACKET_X + 46} y={HERO_L2 - xHeight / 2} fontSize={11} fontFamily={MONO} dominantBaseline='middle'>
					x-height
				</text>
			</g>
		</svg>
	)
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function findTerm(id: string) {
	for (const g of GROUPS) for (const t of g.terms) if (t.id === id) return t
	return null
}

function renderTerm(
	term: Term,
	font: string,
	fontWeight: number,
	cw: number,
	ch: number,
	lineHeightRatio?: number,
	trackingEm?: number,
	textBoxTrim?: TextBoxTrim,
) {
	if (term.multiLine) {
		const [L1, L2] = multiLayout(term.sample, term.fontSize, font, fontWeight, cw, ch, lineHeightRatio)
		return term.draw(L1, L2)
	}
	const L = computeLayout(term.sample, term.fontSize, font, fontWeight, cw, ch)
	if (term.id === 'tracking') return term.draw({ ...L, trackingEm })
	if (term.id === 'textboxtrim') return term.draw({ ...L, textBoxTrim })
	return term.draw(L)
}

// ── App ────────────────────────────────────────────────────────────────────────
function App() {
	const panelRef = useRef<HTMLDivElement>(null)
	const [font, setFont] = useState('serif')
	const [pinned, setPinned] = useState<string | null>(null)
	const [hovered, setHovered] = useState<string | null>(null)
	const [dims, setDims] = useState({ cw: 330, ch: 400, mob: false })
	const { cw, ch, mob } = dims
	const [fontWeightSize, setFontWeightSize] = useState<FontWeightSize>('normal')
	const [leadingSize, setLeadingSize] = useState<LeadingSize>('md')
	const [trackingSize, setTrackingSize] = useState<TrackingSize>('widest')
	const [textBoxTrim, setTextBoxTrim] = useState<TextBoxTrim>('both')

	const fontWeight = WEIGHT_OPTIONS.find((o) => o.value === fontWeightSize)!.weight
	const leadingRatio = LEADING_OPTIONS.find((o) => o.value === leadingSize)!.ratio
	const trackingEm = TRACKING_OPTIONS.find((o) => o.value === trackingSize)!.em

	const activeId = pinned ?? hovered
	const activeTerm = activeId ? findTerm(activeId) : null

	useEffect(() => {
		const panel = panelRef.current!
		let rafId: number | null = null
		const obs = new ResizeObserver(() => {
			if (rafId !== null) cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(() => {
				rafId = null
				const isMob = getComputedStyle(panel).getPropertyValue('--mobile').trim() === '1'
				const s = getComputedStyle(panel)
				const w = Math.round(panel.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight))
				if (w) setDims({ cw: w, ch: isMob ? Math.round(w * 0.48) : BASE_CH, mob: isMob })
			})
		})
		obs.observe(panel)
		return () => {
			obs.disconnect()
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setPinned(null)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	useEffect(() => {
		setLeadingSize('md')
		setTrackingSize('widest')
		setTextBoxTrim('both')
	}, [activeId])

	return (
		<ThemeProvider>
			<div className='full-bleed-container min-h-screen bg-base-100 text-base-content'>
				<div className='content-root'>
					<div className='border-b border-base-300 overflow-hidden'>
						<AnatomyHero font={font} />
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
					<div className={`main-grid${mob ? ' mobile' : ''}`}>
						<div ref={panelRef} className='diagram-panel sticky top-6' style={mob ? { width: '100%' } : undefined}>
							<div className='rounded-box border border-base-300 bg-base-200 overflow-hidden'>
								<div className='border-b border-base-300'>
									<div className='flex items-center px-4 py-2 border-b border-base-300/50'>
										<div className='join'>
											{(['serif', 'sans', 'mono'] as const).map((f) => (
												<button
													key={f}
													type='button'
													className={`join-item btn btn-xs${font === f ? ' btn-active' : ''}`}
													onClick={() => setFont(f)}
												>
													{f[0].toUpperCase() + f.slice(1)}
												</button>
											))}
										</div>
									</div>
									<div className='flex items-center px-4 py-2'>
										<RadioGroup
											variant='btn'
											value={fontWeightSize}
											onChange={(e) => setFontWeightSize(e.target.value as FontWeightSize)}
											options={[...WEIGHT_OPTIONS]}
											className='join'
											classNames={{ item: 'join-item btn-xs' }}
										/>
									</div>
								</div>
								<svg
									viewBox={`0 0 ${cw} ${ch}`}
									width={cw}
									height={ch}
									style={{ display: 'block' }}
									aria-label={activeTerm?.name ?? 'Typography metrics diagram'}
								>
									{activeTerm ? (
										renderTerm(
											activeTerm,
											font,
											fontWeight,
											cw,
											ch,
											activeTerm.multiLine ? leadingRatio : undefined,
											trackingEm,
											textBoxTrim,
										)
									) : (
										<Idle cw={cw} ch={ch} font={font} fontWeight={fontWeight} />
									)}
								</svg>
								<div className='flex items-center justify-between px-4 py-2.5 border-t border-base-300 min-h-10'>
									<span className='font-mono text-xs text-base-content/50'>{activeTerm?.name ?? ''}</span>
									{(activeId === 'leading' || activeId === 'lineheight') && (
										<RadioGroup
											variant='btn'
											value={leadingSize}
											onChange={(e) => setLeadingSize(e.target.value as LeadingSize)}
											options={[...LEADING_OPTIONS]}
											className='join'
											classNames={{ item: 'join-item btn-xs' }}
										/>
									)}
									{activeId === 'tracking' && (
										<RadioGroup
											variant='btn'
											value={trackingSize}
											onChange={(e) => setTrackingSize(e.target.value as TrackingSize)}
											options={[...TRACKING_OPTIONS]}
											className='join'
											classNames={{ item: 'join-item btn-xs' }}
										/>
									)}
									{activeId === 'textboxtrim' && (
										<RadioGroup
											variant='btn'
											value={textBoxTrim}
											onChange={(e) => setTextBoxTrim(e.target.value as TextBoxTrim)}
											options={[...TEXT_BOX_OPTIONS]}
											className='join'
											classNames={{ item: 'join-item btn-xs' }}
										/>
									)}
								</div>
							</div>
							{!mob && (
								<p className='pin-hint text-center font-mono text-xs text-base-content/25 mt-2'>
									Click to pin · <kbd className='kbd kbd-xs'>Esc</kbd> to unpin
								</p>
							)}
						</div>
						<div className={mob ? 'pt-5 px-4' : ''}>
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
											onClick={() => setPinned((p) => (p === term.id ? null : term.id))}
										>
											<p className='font-mono text-sm font-medium mb-1'>{term.name}</p>
											<p className='text-xs text-base-content/60 leading-relaxed'>{term.def}</p>
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
