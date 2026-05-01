// Local implementations of utilities/components that belong in @trenaryja/ui.
// When migrating, delete each block and update the import in pen.tsx to pull from the package.

import type { Placement } from 'https://esm.sh/@trenaryja/ui'
import { cn } from 'https://esm.sh/@trenaryja/ui/utils'
import type { ReactNode } from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'

// TODO: import { colorMix } from '@trenaryja/ui/utils'
export const colorMix = (from: string, to: string, ratio: number) =>
	`color-mix(in oklab, ${from} ${R.clamp(ratio, { min: 0, max: 100 })}%, ${to})`

// TODO: import { interpolateColors } from '@trenaryja/ui/utils'
export const interpolateColors = (t: number, stops: string[]) => {
	if (stops.length === 1) return stops[0]
	const lastIndex = stops.length - 1
	const scaled = R.clamp(t, { min: 0, max: 1 }) * lastIndex
	const segment = Math.min(Math.floor(scaled), lastIndex - 1)
	return colorMix(stops[segment], stops[segment + 1], Math.round((1 - (scaled - segment)) * 100))
}

// TODO: import { EdgeBadges } from '@trenaryja/ui'
const EDGE_PLACEMENT_CLASSES: Record<Placement, string> = {
	'top-start': 'top-0 left-2 -translate-y-1/2',
	'top-center': 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
	'top-end': 'top-0 right-2 -translate-y-1/2',
	'bottom-start': 'bottom-0 left-2 translate-y-1/2',
	'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
	'bottom-end': 'bottom-0 right-2 translate-y-1/2',
	'left-start': 'left-0 top-2 -translate-x-1/2',
	'left-center': 'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
	'left-end': 'left-0 bottom-2 -translate-x-1/2',
	'right-start': 'right-0 top-2 translate-x-1/2',
	'right-center': 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
	'right-end': 'right-0 bottom-2 translate-x-1/2',
}

export const EdgeBadges = ({ children, placement }: { children: ReactNode; placement: Placement }) => (
	<div className={`absolute flex gap-1 z-10 ${EDGE_PLACEMENT_CLASSES[placement]}`}>{children}</div>
)

// TODO: import { Stepper } from '@trenaryja/ui'
type StepperClassNames = {
	button?: string
	decrement?: string
	value?: string
	increment?: string
}

export type StepperProps = {
	value: number
	min?: number
	max: number
	onChange: (n: number) => void
	className?: string
	classNames?: StepperClassNames
}

export const Stepper = ({ value, min = 1, max, onChange, className, classNames }: StepperProps) => (
	<div className={cn('join', className)}>
		<button
			type='button'
			className={cn('btn join-item', classNames?.button, classNames?.decrement)}
			onClick={() => onChange(Math.max(min, value - 1))}
			disabled={value <= min}
		>
			-
		</button>
		<span className={cn('btn btn-ghost join-item pointer-events-none tabular-nums', classNames?.button, classNames?.value)}>{value}</span>
		<button
			type='button'
			className={cn('btn join-item', classNames?.button, classNames?.increment)}
			onClick={() => onChange(Math.min(max, value + 1))}
			disabled={value >= max}
		>
			+
		</button>
	</div>
)
