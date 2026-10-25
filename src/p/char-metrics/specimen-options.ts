import type { ChangeEvent } from 'https://esm.sh/react'

export const FONT_WEIGHTS = { thin: 100, light: 300, normal: 400, bold: 700, black: 900 } as const
export type FontWeightSize = keyof typeof FONT_WEIGHTS

export const TRACKING_EMS = { tighter: -0.05, tight: -0.025, normal: 0, wide: 0.025, wider: 0.05, widest: 0.1 } as const
export type TrackingSize = keyof typeof TRACKING_EMS

export const TEXT_BOX_TRIMS = ['none', 'start', 'end', 'both'] as const
export type TextBoxTrim = (typeof TEXT_BOX_TRIMS)[number]

// ratio: 0 is a sentinel meaning lineHeight = fontAscent + fontDescent (zero extra leading, lines touch)
export const LEADING_RATIOS = { none: 0, xs: 1.25, sm: 1.375, md: 1.5, lg: 1.75, xl: 2 } as const
export type LeadingSize = keyof typeof LEADING_RATIOS

/** RadioGroup options labelled by their values, with the change event's string narrowed back to one of them. */
export const radioProps = <Value extends string>(values: readonly Value[], select: (value: Value) => void) => ({
	options: values.map((value) => ({ value, label: value })),
	onChange: (event: ChangeEvent<HTMLInputElement>) => {
		const value = values.find((x) => x === event.target.value)
		if (value !== undefined) select(value)
	},
})
