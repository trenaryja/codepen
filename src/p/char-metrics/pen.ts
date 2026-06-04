// ── Constants ──────────────────────────────────────────────────────────────────
let CW = 330
let CH = 400
const DPR = Math.min(window.devicePixelRatio || 1, 2)

const FONTS: Record<string, string> = {
	serif: 'Georgia, "Times New Roman", serif',
	sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
	mono: '"Courier New", Courier, monospace',
}

// Theme colors — read from CSS vars before each redraw
let ACCENT = ''
let CHAR_FG = ''
let CANVAS_BG = ''

function refreshColors() {
	const cs = getComputedStyle(document.documentElement)
	ACCENT = cs.getPropertyValue('--color-primary').trim()
	CHAR_FG = cs.getPropertyValue('--color-base-content').trim()
	CANVAS_BG = cs.getPropertyValue('--color-base-200').trim()
}

// ── State ──────────────────────────────────────────────────────────────────────
const S = { fontKey: 'serif', hovered: null as string | null, pinned: null as string | null }
const activeId = () => S.pinned ?? S.hovered

// ── Canvas setup ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('diagram') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function syncLayout() {
	const mobile = isMobile()
	document.querySelector('.main-grid')?.classList.toggle('mobile', mobile)
	document.querySelector('.pin-hint')?.classList.toggle('mobile', mobile)
	document.getElementById('glossary')?.classList.toggle('mobile', mobile)
	// sticky positioning prevents flex stretch — force full width explicitly
	;(canvas.closest('.diagram-panel') as HTMLElement).style.width = mobile ? '100%' : ''
}

function resizeCanvas() {
	// Sync layout classes first so the flex/grid is correct before measuring
	syncLayout()
	// Collapse canvas to 1px so the canvas.width attribute doesn't inflate the panel measurement
	canvas.style.width = '1px'
	canvas.style.height = '1px'
	const panel = canvas.closest('.diagram-panel') as HTMLElement
	const style = getComputedStyle(panel)
	const availW = Math.round(panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
	if (!availW) return
	CW = availW
	CH = isMobile() ? Math.round(CW * 0.48) : 400
	canvas.width = CW * DPR
	canvas.height = CH * DPR
	canvas.style.width = `${CW}px`
	canvas.style.height = `${CH}px`
	ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
	redraw()
}

// ── Measurement canvas ─────────────────────────────────────────────────────────
const _mc = document.createElement('canvas')
const _mx = _mc.getContext('2d')!

function measure(text: string, fs: string) {
	_mx.font = fs
	return _mx.measureText(text)
}
function fstr(size: number) {
	return `${size}px ${FONTS[S.fontKey]}`
}

// ── Drawing helpers ────────────────────────────────────────────────────────────

type HLineOpts = { dashed?: boolean; side?: 'left' | 'right'; alpha?: number }
type VLineOpts = { dashed?: boolean; alpha?: number }
type BracketOpts = { above?: boolean; tick?: number }
type VBracketOpts = { right?: boolean; tick?: number }
type BoxOpts = { fill?: boolean; fillAlpha?: number; lw?: number }
type CharOpts = { alpha?: number; color?: string | null }
type LabelOpts = { align?: CanvasTextAlign; alpha?: number }

function hline(
	y: number,
	color: string,
	label: string | null,
	{ dashed = false, side = 'right', alpha = 1 }: HLineOpts = {},
) {
	ctx.save()
	ctx.globalAlpha = alpha
	ctx.strokeStyle = color
	ctx.lineWidth = 1.5
	if (dashed) ctx.setLineDash([4, 5])
	ctx.beginPath()
	ctx.moveTo(0, y)
	ctx.lineTo(CW, y)
	ctx.stroke()
	ctx.setLineDash([])
	if (label) {
		ctx.font = `10.5px 'DM Mono', monospace`
		ctx.fillStyle = color
		ctx.textAlign = side === 'right' ? 'right' : 'left'
		ctx.fillText(label, side === 'right' ? CW - 8 : 8, y - 4)
	}
	ctx.restore()
}

function vline(x: number, color: string, label: string | null, { dashed = false, alpha = 1 }: VLineOpts = {}) {
	ctx.save()
	ctx.globalAlpha = alpha
	ctx.strokeStyle = color
	ctx.lineWidth = 1.5
	if (dashed) ctx.setLineDash([4, 5])
	ctx.beginPath()
	ctx.moveTo(x, 0)
	ctx.lineTo(x, CH)
	ctx.stroke()
	ctx.setLineDash([])
	if (label) {
		ctx.font = `10px 'DM Mono', monospace`
		ctx.fillStyle = color
		ctx.textAlign = 'center'
		ctx.fillText(label, x, 12)
	}
	ctx.restore()
}

function hbracket(
	x1: number,
	x2: number,
	y: number,
	color: string,
	label: string | null,
	{ above = true, tick = 8 }: BracketOpts = {},
) {
	const d = above ? -1 : 1
	ctx.save()
	ctx.strokeStyle = color
	ctx.lineWidth = 1.5
	ctx.beginPath()
	ctx.moveTo(x1, y - d * tick)
	ctx.lineTo(x1, y + d * tick)
	ctx.moveTo(x1, y)
	ctx.lineTo(x2, y)
	ctx.moveTo(x2, y - d * tick)
	ctx.lineTo(x2, y + d * tick)
	ctx.stroke()
	if (label) {
		ctx.font = `10.5px 'DM Mono', monospace`
		ctx.fillStyle = color
		ctx.textAlign = 'center'
		ctx.fillText(label, (x1 + x2) / 2, y + d * (tick + 14))
	}
	ctx.restore()
}

function vbracket(
	x: number,
	y1: number,
	y2: number,
	color: string,
	label: string | null,
	{ right = true, tick = 7 }: VBracketOpts = {},
) {
	const d = right ? 1 : -1
	ctx.save()
	ctx.strokeStyle = color
	ctx.lineWidth = 1.5
	ctx.beginPath()
	ctx.moveTo(x - d * tick, y1)
	ctx.lineTo(x + d * tick, y1)
	ctx.moveTo(x, y1)
	ctx.lineTo(x, y2)
	ctx.moveTo(x - d * tick, y2)
	ctx.lineTo(x + d * tick, y2)
	ctx.stroke()
	if (label) {
		ctx.font = `10.5px 'DM Mono', monospace`
		ctx.fillStyle = color
		ctx.textAlign = right ? 'left' : 'right'
		ctx.fillText(label, x + d * (tick + 4), (y1 + y2) / 2 + 4)
	}
	ctx.restore()
}

function box(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	color: string,
	{ fill = false, fillAlpha = 0.1, lw = 1.5 }: BoxOpts = {},
) {
	ctx.save()
	ctx.strokeStyle = color
	ctx.lineWidth = lw
	if (fill) {
		ctx.fillStyle = color
		ctx.globalAlpha = fillAlpha
		ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
		ctx.globalAlpha = 1
	}
	ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
	ctx.restore()
}

function drawChar(text: string, fs: string, x: number, by: number, { alpha = 1, color = null }: CharOpts = {}) {
	ctx.save()
	ctx.font = fs
	ctx.fillStyle = color ?? CHAR_FG
	ctx.globalAlpha = alpha
	ctx.textAlign = 'left'
	ctx.textBaseline = 'alphabetic'
	ctx.fillText(text, x, by)
	ctx.restore()
}

function canvasLabel(
	text: string,
	x: number,
	y: number,
	color: string,
	{ align = 'right' as CanvasTextAlign, alpha = 1 }: LabelOpts = {},
) {
	ctx.save()
	ctx.font = `10.5px 'DM Mono', monospace`
	ctx.fillStyle = color
	ctx.textAlign = align
	ctx.globalAlpha = alpha
	ctx.fillText(text, x, y)
	ctx.restore()
}

// ── Layout computation ─────────────────────────────────────────────────────────

const isMobile = () => getComputedStyle(canvas.closest('.diagram-panel')!).getPropertyValue('--mobile').trim() === '1'
const mobileFontScale = () => (isMobile() ? 0.58 : 1)

interface Layout {
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
	color: string
}

function layout(sample: string, fontSize: number): Layout {
	const fs = fstr(Math.round(fontSize * mobileFontScale()))
	const sm = measure(sample, fs)
	const mH = measure('H', fs)
	const mx = measure('x', fs)
	const mp = measure('p', fs)
	const mhd = measure('hd', fs)

	const fontAscent = sm.fontBoundingBoxAscent
	const fontDescent = sm.fontBoundingBoxDescent
	const capHeight = mH.actualBoundingBoxAscent
	const xHeight = mx.actualBoundingBoxAscent
	const descDepth = mp.actualBoundingBoxDescent
	const ascHeight = mhd.actualBoundingBoxAscent
	const advance = sm.width
	const charX = (CW - advance) / 2
	const baselineY = (CH - fontAscent - fontDescent) / 2 + fontAscent

	return {
		fs,
		fontSize,
		fontAscent,
		fontDescent,
		capHeight,
		xHeight,
		descDepth,
		ascHeight,
		advance,
		charX,
		inkLeft: charX - sm.actualBoundingBoxLeft,
		inkRight: charX + sm.actualBoundingBoxRight,
		inkTop: baselineY - sm.actualBoundingBoxAscent,
		inkBottom: baselineY + sm.actualBoundingBoxDescent,
		baselineY,
		sample,
		color: ACCENT,
	}
}

function multiLayout(sample: string, fontSize: number): [Layout, Layout] {
	const fs = fstr(Math.round(fontSize * mobileFontScale()))
	const sm = measure(sample, fs)
	const mH = measure('H', fs)
	const mx = measure('x', fs)
	const mp = measure('p', fs)

	const fontAscent = sm.fontBoundingBoxAscent
	const fontDescent = sm.fontBoundingBoxDescent
	const capHeight = mH.actualBoundingBoxAscent
	const xHeight = mx.actualBoundingBoxAscent
	const descDepth = mp.actualBoundingBoxDescent
	const advance = sm.width
	const charX = (CW - advance) / 2
	const lineGap = fontSize * 0.22
	const lineH = fontAscent + fontDescent + lineGap
	const totalH = lineH + fontAscent + fontDescent
	const padTop = (CH - totalH) / 2
	const by1 = padTop + fontAscent
	const by2 = by1 + lineH

	const common = {
		fs,
		fontSize,
		fontAscent,
		fontDescent,
		capHeight,
		xHeight,
		descDepth,
		advance,
		charX,
		lineGap,
		lineH,
		sample,
		color: ACCENT,
		ascHeight: 0,
		inkLeft: 0,
		inkRight: 0,
		inkTop: 0,
		inkBottom: 0,
	}
	return [
		{ ...common, baselineY: by1 },
		{ ...common, baselineY: by2 },
	]
}

// ── Term definitions ───────────────────────────────────────────────────────────

interface Term {
	id: string
	name: string
	sample: string
	fontSize: number
	multiLine?: boolean
	def: string
	draw(this: Term, L: Layout, L2?: Layout): void
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
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY, L.color, 'baseline')
				},
			},
			{
				id: 'xheight',
				name: 'x-height',
				sample: 'xag',
				fontSize: 140,
				def: 'The height of lowercase letters without ascenders or descenders, typically measured on "x". A larger x-height relative to cap height improves readability at small sizes.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.12 })
					hline(L.baselineY - L.xHeight, L.color, 'x-height')
					vbracket(L.charX - 18, L.baselineY - L.xHeight, L.baselineY, L.color, null, { right: false })
				},
			},
			{
				id: 'capheight',
				name: 'cap height',
				sample: 'Hx',
				fontSize: 140,
				def: 'The height of uppercase flat letters (H, I, E) measured from the baseline. Usually slightly shorter than the ascender line. Exposed in CSS via the cap unit.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.12 })
					hline(L.baselineY - L.capHeight, L.color, 'cap height')
					vbracket(L.charX - 18, L.baselineY - L.capHeight, L.baselineY, L.color, null, { right: false })
				},
			},
			{
				id: 'ascender',
				name: 'ascender',
				sample: 'hd',
				fontSize: 140,
				def: 'The upward stroke of a lowercase letter extending above the x-height, as in b, d, h, k, l. In most typefaces the ascender line sits at or slightly above the cap height.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.12 })
					hline(L.baselineY - L.xHeight, CHAR_FG, 'x-height', { dashed: true, alpha: 0.25 })
					hline(L.baselineY - L.ascHeight, L.color, 'ascender')
					vbracket(L.charX - 18, L.baselineY - L.ascHeight, L.baselineY - L.xHeight, L.color, null, { right: false })
				},
			},
			{
				id: 'descender',
				name: 'descender',
				sample: 'pg',
				fontSize: 140,
				def: 'The downward stroke of a lowercase letter extending below the baseline, as in p, q, g, j, y. Descender depth varies widely and directly affects minimum comfortable line-height.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.12 })
					hline(L.baselineY + L.descDepth, L.color, 'descender')
					vbracket(L.charX - 18, L.baselineY, L.baselineY + L.descDepth, L.color, null, { right: false })
				},
			},
			{
				id: 'font-ascent',
				name: 'font ascent',
				sample: 'A',
				fontSize: 150,
				def: "The maximum ascent declared in the font's OS/2 table (sTypoAscender). Used by the browser to compute line box height. May exceed any individual glyph's actual ink to reserve space for all possible characters.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY - L.capHeight, CHAR_FG, 'cap height', { dashed: true, alpha: 0.25, side: 'left' })
					hline(L.baselineY - L.fontAscent, L.color, 'font ascent')
					vbracket(CW - 22, L.baselineY - L.fontAscent, L.baselineY - L.capHeight, L.color, 'gap', { right: false })
				},
			},
			{
				id: 'font-descent',
				name: 'font descent',
				sample: 'p',
				fontSize: 150,
				def: "The maximum descent declared in the font tables (sTypoDescent). Together with font ascent it defines the em-relative line box. Often deeper than any glyph's actual descender.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					hline(L.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.12 })
					hline(L.baselineY + L.descDepth, CHAR_FG, 'ink descent', { dashed: true, alpha: 0.25, side: 'left' })
					hline(L.baselineY + L.fontDescent, L.color, 'font descent')
					if (L.fontDescent - L.descDepth > 2)
						vbracket(CW - 22, L.baselineY + L.descDepth, L.baselineY + L.fontDescent, L.color, 'gap', { right: false })
				},
			},
			{
				id: 'overshoot',
				name: 'overshoot',
				sample: 'OH',
				fontSize: 140,
				def: 'Rounded or pointed glyphs (O, o, A, V) extend slightly beyond the baseline and cap height to compensate for optical illusion. Without overshoot, round letters appear shorter than flat-topped ones.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const oM = measure('O', L.fs)
					const hM = measure('H', L.fs)
					const capY = L.baselineY - hM.actualBoundingBoxAscent
					const oTopY = L.baselineY - oM.actualBoundingBoxAscent
					const overshootPx = capY - oTopY
					hline(capY, CHAR_FG, 'cap height (H)', { dashed: true, alpha: 0.35, side: 'left' })
					if (overshootPx > 4) {
						hline(oTopY, L.color, 'O overshoot')
						vbracket(CW - 22, oTopY, capY, L.color, 'overshoot', { right: false })
					} else {
						hline(oTopY, L.color, null)
						if (overshootPx > 1) canvasLabel(`O overshoot (+${overshootPx.toFixed(1)}px)`, CW - 8, oTopY - 5, L.color)
					}
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
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const y = Math.min(L.baselineY + L.fontDescent + 22, CH - 26)
					hbracket(L.charX, L.charX + L.advance, y, L.color, 'advance width', { above: false })
					vline(L.charX, L.color, null, { dashed: true, alpha: 0.25 })
					vline(L.charX + L.advance, L.color, null, { dashed: true, alpha: 0.25 })
				},
			},
			{
				id: 'lsb',
				name: 'left sidebearing',
				sample: 'H',
				fontSize: 150,
				def: "The horizontal space from the glyph's origin to its leftmost ink edge. Controls visual rhythm on the left side. Negative values allow ink to extend beyond the origin point.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const lsbW = L.inkLeft - L.charX
					const lsbBracketY = Math.min(L.baselineY + L.fontDescent + 14, CH - 26)
					if (Math.abs(lsbW) > 1) hbracket(L.charX, L.inkLeft, lsbBracketY, L.color, 'LSB', { above: false })
					vline(L.charX, CHAR_FG, 'origin', { dashed: true, alpha: 0.35 })
					vline(L.inkLeft, L.color, null, { dashed: true, alpha: 0.5 })
				},
			},
			{
				id: 'rsb',
				name: 'right sidebearing',
				sample: 'H',
				fontSize: 150,
				def: "The space from a glyph's rightmost ink edge to its advance point. Together with LSB, RSB determines the white space surrounding each character and controls visual rhythm.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const rsbEnd = L.charX + L.advance
					const rsbBracketY = Math.min(L.baselineY + L.fontDescent + 14, CH - 26)
					if (rsbEnd - L.inkRight > 1) hbracket(L.inkRight, rsbEnd, rsbBracketY, L.color, 'RSB', { above: false })
					vline(L.inkRight, L.color, null, { dashed: true, alpha: 0.5 })
					vline(rsbEnd, CHAR_FG, 'advance', { dashed: true, alpha: 0.35 })
				},
			},
			{
				id: 'inkwidth',
				name: 'ink width',
				sample: 'H',
				fontSize: 150,
				def: "The actual horizontal extent of a glyph's visible ink, from leftmost to rightmost pixel. Does not include side bearings. Useful for optical centering or tight layout calculations.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const inkBracketY = Math.min(L.baselineY + L.fontDescent + 14, CH - 26)
					hbracket(L.inkLeft, L.inkRight, inkBracketY, L.color, 'ink width', { above: false })
					vline(L.inkLeft, L.color, null, { dashed: true, alpha: 0.4 })
					vline(L.inkRight, L.color, null, { dashed: true, alpha: 0.4 })
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
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const t = L.baselineY - L.fontAscent
					const b = L.baselineY + L.fontDescent
					box(L.charX, t, L.charX + L.advance, b, L.color, { fill: true, fillAlpha: 0.07 })
					canvasLabel('em square', L.charX + L.advance / 2, t - 7, L.color, { align: 'center' })
				},
			},
			{
				id: 'inkbounds',
				name: 'ink bounds',
				sample: 'A',
				fontSize: 150,
				def: "The tightest rectangle containing a glyph's actual rendered pixels. Known as actualBoundingBox in the Canvas API. Varies per character—unlike font bounds which are constant declared values.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					box(L.inkLeft, L.inkTop, L.inkRight, L.inkBottom, L.color, { fill: true })
					canvasLabel('ink bounds', L.inkLeft, L.inkTop - 7, L.color, { align: 'left' })
				},
			},
			{
				id: 'fontbounds',
				name: 'font bounds',
				sample: 'A',
				fontSize: 150,
				def: 'The rectangle defined by declared font metrics: (ascent + descent) × advance width. May be much larger than the actual ink. CSS layout operates on font bounds—this is what line-height and the box model use.',
				draw(L) {
					const ft = L.baselineY - L.fontAscent
					const fb = L.baselineY + L.fontDescent
					box(L.charX, ft, L.charX + L.advance, fb, L.color, { fill: true, fillAlpha: 0.07 })
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					ctx.save()
					ctx.strokeStyle = CHAR_FG
					ctx.lineWidth = 1
					ctx.globalAlpha = 0.2
					ctx.setLineDash([3, 4])
					ctx.strokeRect(L.inkLeft, L.inkTop, L.inkRight - L.inkLeft, L.inkBottom - L.inkTop)
					ctx.restore()
					canvasLabel('ink', L.inkRight + 4, (L.inkTop + L.inkBottom) / 2, CHAR_FG, { align: 'left', alpha: 0.4 })
					canvasLabel('font bounds', L.charX + L.advance - 4, ft - 7, L.color)
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
				fontSize: 82,
				multiLine: true,
				def: "Extra vertical space added between lines of text, beyond the font's ascent + descent. Named for the lead strips typesetters placed between rows of metal type. In CSS it's part of line-height.",
				draw(L1, L2) {
					if (!L2) return
					drawChar(L1.sample, L1.fs, L1.charX, L1.baselineY)
					drawChar(L2.sample, L2.fs, L2.charX, L2.baselineY)
					const gapTop = L1.baselineY + L1.fontDescent
					const gapBot = L2.baselineY - L2.fontAscent
					if (gapBot > gapTop + 1) {
						ctx.save()
						ctx.fillStyle = L1.color
						ctx.globalAlpha = 0.14
						ctx.fillRect(0, gapTop, CW, gapBot - gapTop)
						ctx.restore()
						vbracket(CW - 18, gapTop, gapBot, L1.color, 'leading', { right: false })
					}
					hline(L1.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.18 })
					hline(L2.baselineY, CHAR_FG, null, { dashed: true, alpha: 0.18 })
				},
			},
			{
				id: 'lineheight',
				name: 'line height',
				sample: 'Ag',
				fontSize: 82,
				multiLine: true,
				def: 'The total vertical distance from one baseline to the next. Equals font ascent + font descent + leading. In CSS the line-height property sets this; extra space distributes equally above and below as half-leading.',
				draw(L1, L2) {
					if (!L2) return
					drawChar(L1.sample, L1.fs, L1.charX, L1.baselineY)
					drawChar(L2.sample, L2.fs, L2.charX, L2.baselineY)
					hline(L1.baselineY, CHAR_FG, 'baseline 1', { dashed: true, alpha: 0.4 })
					hline(L2.baselineY, CHAR_FG, 'baseline 2', { dashed: true, alpha: 0.4 })
					vbracket(CW - 18, L1.baselineY, L2.baselineY, L1.color, 'line-height', { right: false })
				},
			},
			{
				id: 'tracking',
				name: 'tracking',
				sample: 'HELLO',
				fontSize: 64,
				def: 'Uniform horizontal spacing applied equally between all glyphs in a text run. Called letter-spacing in CSS. Unlike kerning, tracking is a constant additive value—not glyph-pair-specific.',
				draw(L) {
					const chars = 'HELLO'.split('')
					const widths = chars.map((c) => measure(c, L.fs).width)
					const total = widths.reduce((a, b) => a + b, 0)
					const track = L.fontSize * 0.14
					const totalWithTrack = total + track * (chars.length - 1)
					let x = (CW - totalWithTrack) / 2
					ctx.save()
					ctx.font = L.fs
					ctx.fillStyle = CHAR_FG
					ctx.textAlign = 'left'
					ctx.textBaseline = 'alphabetic'
					chars.forEach((ch, i) => {
						ctx.fillText(ch, x, L.baselineY)
						if (i < chars.length - 1) {
							const nextX = x + widths[i]
							ctx.save()
							ctx.fillStyle = L.color
							ctx.globalAlpha = 0.22
							ctx.fillRect(nextX, L.baselineY - L.xHeight, track, L.xHeight)
							ctx.restore()
						}
						x += widths[i] + track
					})
					ctx.restore()
					canvasLabel('tracking gaps', CW / 2, L.baselineY + L.fontDescent + 20, L.color, { align: 'center' })
				},
			},
			{
				id: 'kerning',
				name: 'kerning',
				sample: 'AV',
				fontSize: 130,
				def: "Optical spacing adjustment between specific glyph pairs, encoded in the font's GPOS or kern table. The AV pair is a classic example: without kerning there's a visible gap that kerning tightens for visual balance.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const aM = measure('A', L.fs)
					const vM = measure('V', L.fs)
					const avM = measure('AV', L.fs)
					const kern = aM.width + vM.width - avM.width
					if (kern > 0.5) {
						const aEnd = L.charX + aM.width
						const vStart = aEnd - kern
						ctx.save()
						ctx.fillStyle = L.color
						ctx.globalAlpha = 0.22
						ctx.fillRect(vStart, L.baselineY - L.capHeight, kern, L.capHeight + L.descDepth)
						ctx.restore()
						hbracket(vStart, aEnd, L.baselineY + L.fontDescent + 12, L.color, `kern −${kern.toFixed(1)}px`, {
							above: false,
						})
					} else {
						vline(L.charX + aM.width, L.color, 'A/V junction', { dashed: true, alpha: 0.35 })
						canvasLabel('no kern pair in this font', CW / 2, L.baselineY + L.fontDescent + 22, L.color, {
							align: 'center',
						})
					}
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
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const cx = L.charX + L.advance / 2
					const cy = L.baselineY - L.capHeight * 0.5
					const r = L.xHeight * 0.34
					ctx.save()
					ctx.beginPath()
					ctx.arc(cx, cy, r, 0, Math.PI * 2)
					ctx.fillStyle = L.color
					ctx.globalAlpha = 0.2
					ctx.fill()
					ctx.globalAlpha = 0.7
					ctx.strokeStyle = L.color
					ctx.lineWidth = 1.5
					ctx.stroke()
					ctx.restore()
					canvasLabel('counter', CW - 10, cy - r - 8, L.color)
					ctx.save()
					ctx.strokeStyle = L.color
					ctx.lineWidth = 1
					ctx.globalAlpha = 0.5
					ctx.beginPath()
					ctx.moveTo(CW - 60, cy - r - 5)
					ctx.lineTo(cx + r + 2, cy - r * 0.5)
					ctx.stroke()
					ctx.restore()
				},
			},
			{
				id: 'stem',
				name: 'stem',
				sample: 'H',
				fontSize: 150,
				def: "The primary vertical or near-vertical stroke of a letter—the two upright strokes in H, or the single stroke in I. Stem width is a primary variable in determining a typeface's perceived weight.",
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					// Pixel-scan at 20% of cap height (above baseline serifs, below the crossbar at ~50%)
					const oc = document.createElement('canvas')
					oc.width = 400
					oc.height = 400
					const ox = oc.getContext('2d')!
					ox.font = L.fs
					ox.fillStyle = '#fff'
					ox.textBaseline = 'alphabetic'
					ox.fillText('H', 0, 300)
					const scanY = Math.round(300 - L.capHeight * 0.2)
					const row = ox.getImageData(0, scanY, 400, 1).data
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
					if (!stemSeg) return
					const stemL = L.charX + stemSeg[0]
					const stemW = stemSeg[1] - stemSeg[0] + 1
					ctx.save()
					ctx.fillStyle = L.color
					ctx.globalAlpha = 0.22
					ctx.fillRect(stemL, L.baselineY - L.capHeight, stemW, L.capHeight)
					ctx.restore()
					hbracket(stemL, stemL + stemW, Math.max(L.baselineY - L.capHeight - 14, 34), L.color, 'stem')
				},
			},
			{
				id: 'bowl',
				name: 'bowl',
				sample: 'b',
				fontSize: 150,
				def: 'The curved closed stroke forming the rounded part of letters like b, d, o, p, q. Bowl size and shape create the distinctive silhouette of a typeface and affect its texture at small sizes.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const cx = L.charX + L.advance * 0.68
					const cy = L.baselineY - L.xHeight * 0.52
					const r = L.xHeight * 0.44
					ctx.save()
					ctx.beginPath()
					ctx.arc(cx, cy, r, 0, Math.PI * 2)
					ctx.strokeStyle = L.color
					ctx.lineWidth = 2
					ctx.globalAlpha = 0.65
					ctx.stroke()
					ctx.globalAlpha = 0.1
					ctx.fillStyle = L.color
					ctx.fill()
					ctx.restore()
					canvasLabel('bowl', CW - 10, cy - r - 8, L.color)
					ctx.save()
					ctx.strokeStyle = L.color
					ctx.lineWidth = 1
					ctx.globalAlpha = 0.5
					ctx.beginPath()
					ctx.moveTo(CW - 46, cy - r - 5)
					ctx.lineTo(cx + r * 0.7, cy - r * 0.7)
					ctx.stroke()
					ctx.restore()
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
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const extra = L.fontSize * 0.25
					const half = extra / 2
					const topHL = L.baselineY - L.fontAscent - half
					const botHL = L.baselineY + L.fontDescent + half
					ctx.save()
					ctx.fillStyle = L.color
					ctx.globalAlpha = 0.14
					ctx.fillRect(0, topHL, CW, half)
					ctx.fillRect(0, L.baselineY + L.fontDescent, CW, half)
					ctx.restore()
					hline(L.baselineY - L.fontAscent, CHAR_FG, 'font ascent', { dashed: true, alpha: 0.3 })
					hline(L.baselineY + L.fontDescent, CHAR_FG, 'font descent', { dashed: true, alpha: 0.3, side: 'left' })
					vbracket(10, topHL, L.baselineY - L.fontAscent, L.color, '½ lead', { right: true })
					vbracket(10, L.baselineY + L.fontDescent, botHL, L.color, '½ lead', { right: true })
				},
			},
			{
				id: 'textboxtrim',
				name: 'text-box-trim',
				sample: 'Ag',
				fontSize: 120,
				def: 'A CSS property (text-box: trim-both) that removes half-leading from the top and bottom of a text block. Allows containers to size tightly to cap height or x-height, enabling precise spacing without magic-number padding.',
				draw(L) {
					drawChar(L.sample, L.fs, L.charX, L.baselineY)
					const extra = L.fontSize * 0.25
					const half = extra / 2
					const normT = L.baselineY - L.fontAscent - half
					const normB = L.baselineY + L.fontDescent + half
					ctx.save()
					ctx.strokeStyle = CHAR_FG
					ctx.lineWidth = 1
					ctx.globalAlpha = 0.2
					ctx.setLineDash([3, 4])
					ctx.strokeRect(L.charX - 8, normT, L.advance + 16, normB - normT)
					ctx.restore()
					canvasLabel('default', L.charX - 10, normT - 7, CHAR_FG, { align: 'left', alpha: 0.35 })
					const trimT = L.baselineY - L.capHeight
					const trimB = L.baselineY + L.descDepth
					box(L.charX - 8, trimT, L.inkRight + 8, trimB, L.color, { fill: true, fillAlpha: 0.08, lw: 1.5 })
					canvasLabel('trim-both', L.inkRight + 12, trimT - 7, L.color, { align: 'left' })
				},
			},
		],
	},
]

// ── Idle draw ──────────────────────────────────────────────────────────────────

function drawIdle() {
	const L = layout('Ag', 140)
	drawChar(L.sample, L.fs, L.charX, L.baselineY, { color: CHAR_FG, alpha: 0.08 })
	const lines: [number, string][] = [
		[L.baselineY, 'baseline'],
		[L.baselineY - L.xHeight, 'x-height'],
		[L.baselineY - L.capHeight, 'cap height'],
		[L.baselineY - L.fontAscent, 'ascent'],
		[L.baselineY + L.fontDescent, 'descent'],
		[L.baselineY + L.descDepth, 'descender'],
	]
	ctx.save()
	ctx.font = `10px 'DM Mono', monospace`
	lines.forEach(([y, label]) => {
		ctx.strokeStyle = CHAR_FG
		ctx.lineWidth = 1
		ctx.globalAlpha = 0.08
		ctx.setLineDash([3, 6])
		ctx.beginPath()
		ctx.moveTo(0, y)
		ctx.lineTo(CW, y)
		ctx.stroke()
		ctx.setLineDash([])
		ctx.fillStyle = CHAR_FG
		ctx.textAlign = 'right'
		ctx.globalAlpha = 0.12
		ctx.fillText(label, CW - 8, y - 3)
	})
	ctx.restore()
}

// ── Main redraw ────────────────────────────────────────────────────────────────

function redraw() {
	refreshColors()
	ctx.fillStyle = CANVAS_BG
	ctx.fillRect(0, 0, CW, CH)
	const id = activeId()
	if (!id) {
		drawIdle()
		return
	}
	const term = findTerm(id)
	if (!term) {
		drawIdle()
		return
	}
	if (term.multiLine) {
		const [L1, L2] = multiLayout(term.sample, term.fontSize)
		term.draw.call(term, L1, L2)
	} else {
		term.draw.call(term, layout(term.sample, term.fontSize))
	}
}

function findTerm(id: string) {
	for (const g of GROUPS) for (const t of g.terms) if (t.id === id) return t
	return null
}

// ── Status bar ─────────────────────────────────────────────────────────────────

const sname = document.getElementById('sname')!
function setStatus(term: Term | null) {
	sname.textContent = term ? term.name : ''
}

// ── Glossary render ────────────────────────────────────────────────────────────

function renderGlossary() {
	const root = document.getElementById('glossary')!
	root.innerHTML = ''
	GROUPS.forEach((g) => {
		const groupEl = document.createElement('div')
		groupEl.className = 'mb-11'
		const h = document.createElement('h2')
		h.className = 'font-mono text-xs tracking-[.18em] uppercase text-base-content/40 pb-3 border-b border-base-300 mb-1'
		h.textContent = g.name
		groupEl.appendChild(h)

		g.terms.forEach((term) => {
			const item = document.createElement('div')
			item.className =
				'term-item mt-1 p-3 rounded-lg border border-transparent cursor-pointer transition-colors hover:bg-base-200 hover:border-base-300'
			item.dataset.id = term.id
			item.innerHTML = `
        <p class="font-mono text-sm font-medium mb-1">${term.name}</p>
        <p class="text-xs text-base-content/60 leading-relaxed">${term.def}</p>`

			item.addEventListener('mouseenter', () => {
				if (!S.pinned) {
					S.hovered = term.id
					setStatus(term)
					redraw()
					syncActive()
				}
			})
			item.addEventListener('mouseleave', () => {
				if (!S.pinned) {
					S.hovered = null
					setStatus(null)
					redraw()
					syncActive()
				}
			})
			item.addEventListener('click', () => {
				if (S.pinned === term.id) {
					S.pinned = null
					S.hovered = null
					setStatus(null)
				} else {
					S.pinned = term.id
					S.hovered = term.id
					setStatus(term)
				}
				redraw()
				syncActive()
			})
			groupEl.appendChild(item)
		})
		root.appendChild(groupEl)
	})
}

function syncActive() {
	document.querySelectorAll('.term-item').forEach((el) => {
		const isActive = (el as HTMLElement).dataset.id === (S.pinned ?? S.hovered)
		el.classList.toggle('bg-base-200', isActive)
		el.classList.toggle('border-base-300', isActive)
	})
}

// ── Font switcher ──────────────────────────────────────────────────────────────

document.querySelectorAll('[data-font]').forEach((btn) => {
	btn.addEventListener('click', () => {
		S.fontKey = (btn as HTMLElement).dataset.font!
		document.querySelectorAll('[data-font]').forEach((b) => {
			b.classList.remove('btn-active')
		})
		btn.classList.add('btn-active')
		redraw()
	})
})

// ── Keyboard ───────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && S.pinned) {
		S.pinned = null
		S.hovered = null
		setStatus(null)
		redraw()
		syncActive()
	}
})

// ── Init ───────────────────────────────────────────────────────────────────────

new ResizeObserver(resizeCanvas).observe(document.querySelector('.content-root')!)
window.addEventListener('resize', resizeCanvas)
resizeCanvas()
renderGlossary()
