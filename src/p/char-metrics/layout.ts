import { BASE_HEIGHT, cssFont, measure } from './font-metrics'
import type { TextBoxTrim } from './specimen-options'

export type Layout = {
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
export type Specimen = {
	family: string
	fontWeight: number
	width: number
	height: number
	lineHeightRatio?: number
	trackingEm?: number
	textBoxTrim?: TextBoxTrim
}

// One specimen plus the text a single diagram measures.
export type LayoutRequest = Specimen & {
	sample: string
	fontSize: number
}

export function computeLayout({ sample, fontSize, family, fontWeight, width, height }: LayoutRequest): Layout {
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

export function multiLayout(request: LayoutRequest): [Layout, Layout] {
	const { fontSize, height, lineHeightRatio } = request
	const lineHeightFor = (layout: Layout) =>
		lineHeightRatio === 0
			? layout.fontAscent + layout.fontDescent
			: lineHeightRatio == null
				? layout.fontAscent + layout.fontDescent + layout.fontSize * 0.22
				: lineHeightRatio * layout.fontSize

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
