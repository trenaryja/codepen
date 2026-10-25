export const FONTS: Record<string, string> = {
	serif: 'Georgia, "Times New Roman", serif',
	sans: 'system-ui, "Helvetica Neue", Arial, sans-serif',
	mono: '"Courier New", Courier, monospace',
}
export const ACCENT = 'var(--color-primary)'
export const FG = 'var(--color-base-content)'
export const MONO = `'DM Mono', monospace`
export const BASE_HEIGHT = 400

export function cssFont(size: number, family: string, weight = 400) {
	return `${weight} ${size}px ${FONTS[family]}`
}

// One offscreen context serves every measurement: it is never rendered, and `font` is overwritten
// on the line before it is read. Closing over it rather than declaring it at module scope makes
// that scratch state private to `measure`, which is the only thing allowed to touch it.
export const measure = (() => {
	const ctx = document.createElement('canvas').getContext('2d')
	if (!ctx) throw new Error('char-metrics: canvas 2D context unavailable')

	return (text: string, font: string) => {
		ctx.font = font
		return ctx.measureText(text)
	}
})()

export const SCAN = 400 // offscreen scan canvas, px square
export const SCAN_BASELINE = 300 // where the glyph sits inside that canvas
export const INK = 128 // alpha above which a pixel counts as ink

export type Span = [start: number, end: number]

export type Raster = {
	ink: (x: number, y: number) => boolean
	advance: number
}

// Draw one glyph in isolation and expose an ink predicate over its pixels; a single
// getImageData readback backs every scan below.
export function rasterize(char: string, font: string): Raster {
	const canvas = document.createElement('canvas')
	canvas.width = SCAN
	canvas.height = SCAN
	const ctx = canvas.getContext('2d')
	if (!ctx) throw new Error('char-metrics: canvas 2D context unavailable')
	ctx.font = font
	ctx.fillStyle = '#fff'
	ctx.textBaseline = 'alphabetic'
	ctx.fillText(char, 0, SCAN_BASELINE)
	const { data } = ctx.getImageData(0, 0, SCAN, SCAN)
	return {
		ink: (x, y) => x >= 0 && x < SCAN && y >= 0 && y < SCAN && (data[(y * SCAN + x) * 4 + 3] ?? 0) > INK,
		advance: ctx.measureText(char).width,
	}
}

export function rowSpans({ ink }: Raster, y: number) {
	const spans: Span[] = []
	let start = -1

	for (let x = 0; x < SCAN; x++)
		if (ink(x, y)) {
			if (start < 0) start = x
		} else if (start >= 0) {
			spans.push([start, x - 1])
			start = -1
		}

	if (start >= 0) spans.push([start, SCAN - 1])
	return spans
}

export function columnSpans({ ink }: Raster, x: number) {
	const spans: Span[] = []
	let start = -1

	for (let y = 0; y < SCAN; y++)
		if (ink(x, y)) {
			if (start < 0) start = y
		} else if (start >= 0) {
			spans.push([start, y - 1])
			start = -1
		}

	if (start >= 0) spans.push([start, SCAN - 1])
	return spans
}
