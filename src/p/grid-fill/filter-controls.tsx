import {
	autoUpdate,
	flip,
	FloatingPortal,
	offset,
	shift,
	useDismiss,
	useFloating,
	useFocus,
	useHover,
	useInteractions,
	useRole,
} from 'https://esm.sh/@floating-ui/react'
import type { ReactNode } from 'https://esm.sh/react'
import React, { useState } from 'https://esm.sh/react'
import { OP_SYMBOL, TAGS } from './constants'
import { Stepper } from './migrate-to-ui'
import { type Constraint, parseSize, type TagId } from './recipes'

export type TagChipProps = {
	id: 'favorite' | TagId
	icon?: ReactNode
	active?: boolean
	onToggle?: () => void
	count?: number
}

export const TagChip = ({ id, icon, active, onToggle, count }: TagChipProps) => {
	const [open, setOpen] = useState(false)
	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		placement: 'top',
		middleware: [offset(6), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	})
	const setReference = (node: Element | null) => refs.setReference(node)
	const setFloating = (node: HTMLElement | null) => refs.setFloating(node)
	const hover = useHover(context, { mouseOnly: true, delay: { open: 120, close: 0 } })
	const focus = useFocus(context)
	const dismiss = useDismiss(context)
	const role = useRole(context, { role: 'tooltip' })
	const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role])
	const { label, description } = TAGS[id]
	const disabled = !!onToggle && !active && count === 0
	const cursor = disabled ? 'cursor-not-allowed' : onToggle ? 'cursor-pointer' : 'cursor-help'
	const className = `badge badge-sm gap-1 ${active ? 'badge-primary' : 'badge-ghost'} ${cursor} ${disabled ? 'opacity-40' : ''}`
	const inner = (
		<>
			{icon}
			{label}
			{count !== undefined && (
				<span className={`badge badge-xs tabular-nums transition-opacity ${count > 0 ? 'opacity-60' : 'opacity-0'}`}>
					{count}
				</span>
			)}
		</>
	)
	return (
		<>
			{onToggle ? (
				<button
					ref={setReference}
					type='button'
					aria-disabled={disabled}
					{...getReferenceProps({ onClick: disabled ? undefined : onToggle })}
					className={className}
				>
					{inner}
				</button>
			) : (
				<span ref={setReference} {...getReferenceProps()} className={className}>
					{inner}
				</span>
			)}
			{open && (
				<FloatingPortal>
					<div
						ref={setFloating}
						style={floatingStyles}
						{...getFloatingProps()}
						className='bg-base-300 text-base-content pointer-events-none z-50 max-w-xs rounded-md p-2 text-xs shadow-lg'
					>
						{description}
					</div>
				</FloatingPortal>
			)}
		</>
	)
}

export type SizeCellProps = {
	size: string
	constraint: Constraint | null
	filteredCount: number
	onSetOp: (op: Constraint['op'] | null) => void
	onUpdateN: (n: number) => void
	W: number
	H: number
}

export const SizeCell = ({ size, constraint, filteredCount, onSetOp, onUpdateN, W, H }: SizeCellProps) => {
	const [w, h] = parseSize(size)
	const impossible = filteredCount === 0 && !constraint
	return (
		<div
			className={`rounded-btn flex flex-col items-center gap-1.5 border p-2 text-center transition-opacity ${
				impossible
					? 'border-base-300 bg-base-100 pointer-events-none opacity-30'
					: constraint
						? 'border-primary bg-primary/10'
						: 'border-base-300 bg-base-100 hover:bg-base-200'
			}`}
		>
			<span className='font-mono text-xs font-semibold'>{size}</span>
			<div className='join'>
				{(['=', '>=', 'exclude'] as const).map((op) => (
					<button
						key={op}
						type='button'
						className={`btn btn-xs join-item px-1.5 ${constraint?.op === op ? 'btn-primary' : ''}`}
						onClick={() => onSetOp(constraint?.op === op ? null : op)}
					>
						{OP_SYMBOL[op]}
					</button>
				))}
			</div>
			<div className={constraint && constraint.op !== 'exclude' ? '' : 'invisible'}>
				<Stepper
					value={constraint?.n ?? 1}
					max={Math.floor((W * H) / (w * h))}
					onChange={onUpdateN}
					classNames={{ button: 'btn-xs' }}
				/>
			</div>
		</div>
	)
}
