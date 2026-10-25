import React from 'https://esm.sh/react'
import { Char, HBracket, HLine, Label, Rect, VBracket, VLine } from './diagram-parts'
import { FG, measure } from './font-metrics'
import type { Group } from './glossary-types'

export const METRIC_GROUPS: Group[] = [
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
]
