import React from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import { Char, HBracket, HLine, Label, Rect, VBracket, VLine } from './diagram-parts'
import { ACCENT, columnSpans, FG, measure, rasterize, rowSpans, SCAN_BASELINE } from './font-metrics'
import type { Group } from './glossary-types'

export const TYPOGRAPHY_GROUPS: Group[] = [
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
					const chars = sample.split('').map((char) => ({ char, width: measure(char, font).width }))
					const totalWidth = R.sumBy(chars, (x) => x.width) + track * (chars.length - 1)
					const glyphs: { char: string; x: number; width: number }[] = []
					let cursorX = (panelWidth - totalWidth) / 2

					for (const { char, width } of chars) {
						glyphs.push({ char, x: cursorX, width })
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
