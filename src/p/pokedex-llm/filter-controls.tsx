import { Button, Input } from 'https://esm.sh/@trenaryja/ui'
import React from 'https://esm.sh/react'
import { LuFilter, LuRotateCcw, LuX } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import type { Field, FilterValue, Filters } from './fields'
import { FIELDS, LEVELS, listOf, rangeOf, textOf } from './fields'
import { RANGE_STATS } from './rows'

export type ControlProps = {
	field: Field
	value: FilterValue | undefined
	onChange: (value: FilterValue | undefined) => void
	compact?: boolean
}

export const EnumControl = ({ field, value, onChange }: ControlProps) => {
	const selected = listOf(value)
	const values = field.kind === 'enum' ? field.values : []

	const toggle = (entry: string) => {
		const next = selected.includes(entry) ? selected.filter((own) => own !== entry) : [...selected, entry]
		onChange(next.length ? next : undefined)
	}

	return (
		<div className='flex flex-wrap gap-1'>
			{values.map((entry) => {
				const on = selected.includes(entry)
				return (
					<button
						type='button'
						key={entry}
						onClick={() => toggle(entry)}
						className={`badge badge-sm cursor-pointer transition-all ${on ? 'border-none text-white/95' : 'badge-ghost opacity-60 hover:opacity-100'}`}
						style={on && field.id === 'type' ? { backgroundColor: `var(--type-${entry.toLowerCase()})` } : undefined}
					>
						{entry}
					</button>
				)
			})}
		</div>
	)
}

export const RangeControl = ({ field, value, onChange }: ControlProps) => {
	const stat = RANGE_STATS[field.id]
	const range = rangeOf(value)
	const level = 'level' in range ? range.level : null
	const bounds: { min?: number; max?: number } = 'level' in range ? {} : range
	const bound = (which: 'max' | 'min') => (
		<Input
			type='number'
			className='input input-xs w-full'
			placeholder={String(stat?.[which] ?? '')}
			value={bounds[which] ?? ''}
			onChange={(event) => {
				const next = { ...bounds, [which]: event.target.value === '' ? undefined : Number(event.target.value) }
				onChange(next.min == null && next.max == null ? undefined : next)
			}}
		/>
	)
	return (
		<div className='flex flex-col gap-1.5'>
			<div className='flex flex-wrap gap-1'>
				{LEVELS.map((entry) => (
					<button
						type='button'
						key={entry}
						onClick={() => onChange(level === entry ? undefined : { level: entry })}
						className={`badge badge-sm cursor-pointer ${level === entry ? 'badge-primary' : 'badge-ghost opacity-60 hover:opacity-100'}`}
					>
						{entry.replace('_', ' ')}
					</button>
				))}
			</div>
			<div className='flex items-center gap-1'>
				{bound('min')}
				<span className='text-xs opacity-40'>to</span>
				{bound('max')}
			</div>
		</div>
	)
}

export const BoolControl = ({ value, onChange }: ControlProps) => (
	<div className='join'>
		{R.entries({ Any: undefined, Yes: true, No: false }).map(([label, entry]) => (
			<button
				type='button'
				key={label}
				onClick={() => onChange(entry)}
				className={`btn btn-xs join-item ${value === entry ? 'btn-primary' : 'btn-ghost'}`}
			>
				{label}
			</button>
		))}
	</div>
)

export const TextControl = ({ field, value, onChange }: ControlProps) => (
	<Input
		className='input input-xs w-full'
		placeholder={`Search ${field.label.toLowerCase()}…`}
		value={textOf(value)}
		onChange={(event) => onChange(event.target.value || undefined)}
	/>
)

export const FilterControl = (props: ControlProps) => {
	if (props.field.kind === 'enum') return <EnumControl {...props} />
	if (props.field.kind === 'range') return <RangeControl {...props} />
	if (props.field.kind === 'bool') return <BoolControl {...props} />
	return <TextControl {...props} />
}

/** One-line summary of an active filter, for header badges and the panel. */
export const summarize = (field: Field, value: FilterValue): string => {
	if (field.kind === 'enum') return listOf(value).join(', ')
	if (field.kind === 'range') {
		const range = rangeOf(value)
		if ('level' in range) return range.level.replace('_', ' ')
		const { min, max } = range
		if (min != null && max != null) return `${min}–${max}`
		return min == null ? `≤ ${max}` : `≥ ${min}`
	}
	if (field.kind === 'bool') return value ? 'yes' : 'no'
	return `“${textOf(value)}”`
}

export const FilterPanel = ({
	filters,
	setFilter,
	touched,
	onReset,
}: {
	filters: Filters
	setFilter: (id: string, value: FilterValue | undefined) => void
	touched: Set<string>
	onReset: () => void
}) => (
	<aside className='border-base-content/10 bg-base-200/40 flex w-72 shrink-0 flex-col border-r'>
		<div className='border-base-content/10 flex items-center justify-between border-b px-3 py-2'>
			<span className='flex items-center gap-1.5 text-sm font-semibold'>
				<LuFilter size={13} /> Filters
			</span>
			<Button className='btn-xs btn-ghost' onClick={onReset} disabled={R.isEmpty(filters)}>
				<LuRotateCcw size={12} /> Reset
			</Button>
		</div>
		<div className='flex flex-1 flex-col gap-3 overflow-y-auto p-3'>
			{FIELDS.map((field) => {
				const active = filters[field.id] !== undefined
				return (
					<div
						key={field.id}
						className={`-m-0.5 flex flex-col gap-1.5 p-1.5 ${touched.has(field.id) ? 'llm-touched' : ''}`}
					>
						<div className='flex items-center justify-between gap-2'>
							<span className={`text-xs font-medium ${active ? '' : 'opacity-55'}`}>{field.label}</span>
							{active && (
								<button
									type='button'
									className='btn btn-ghost btn-xs h-4 min-h-0 px-1 opacity-50 hover:opacity-100'
									onClick={() => setFilter(field.id, undefined)}
								>
									<LuX size={11} />
								</button>
							)}
						</div>
						<FilterControl field={field} value={filters[field.id]} onChange={(value) => setFilter(field.id, value)} />
					</div>
				)
			})}
		</div>
	</aside>
)
