import type { ColumnDef } from 'https://esm.sh/@tanstack/react-table'
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createSortedRowModel,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_text,
	tableFeatures,
} from 'https://esm.sh/@tanstack/react-table'
import React, { useSyncExternalStore } from 'https://esm.sh/react'
import { LuBrain, LuFilter } from 'https://esm.sh/react-icons/lu'
import { loadProgress } from './engine'
import type { Field, FilterValue, Mon } from './fields'
import { FIELDS } from './fields'
import { FilterControl } from './filter-controls'
import { matchField, sanitizeValue } from './filters'
import { RANGE_STATS, STAT_KEYS } from './rows'

export const TypeChip = ({ type }: { type: string }) => (
	<span
		className='badge badge-xs border-none font-semibold text-white/95'
		style={{ backgroundColor: `var(--type-${type.toLowerCase()})` }}
	>
		{type}
	</span>
)

export const StatBar = ({ value, fieldId }: { value: number; fieldId: string }) => {
	const max = RANGE_STATS[fieldId]?.max ?? 255
	return (
		<div className='flex items-center gap-1.5'>
			<span className='w-8 text-right tabular-nums'>{value}</span>
			<div className='bg-base-content/10 h-1 flex-1 overflow-hidden rounded-full'>
				<div className='bg-primary/70 h-full rounded-full' style={{ width: `${(value / max) * 100}%` }} />
			</div>
		</div>
	)
}

export const BoolCell = ({ value }: { value: boolean }) =>
	value ? <span className='badge badge-xs badge-warning'>yes</span> : <span className='opacity-25'>—</span>

/** TanStack hands cells a whole context object; every cell here only ever wants the row's `Mon`. */
export const cell =
	(render: (mon: Mon) => React.ReactNode) =>
	({ row }: { row: { original: Mon } }) =>
		render(row.original)

export const cellFor = (field: Field) => {
	if (field.id === 'name')
		return cell((mon) => (
			<div className='flex min-w-0 items-center gap-2'>
				<img src={mon.thumbnail} alt='' loading='lazy' className='size-8 shrink-0 object-contain' />
				<span className='truncate font-medium'>{mon.name}</span>
				<span className='shrink-0 text-[10px] tabular-nums opacity-30'>#{mon.id}</span>
			</div>
		))
	if (field.id === 'type')
		return cell((mon) => (
			<div className='flex gap-1'>
				{mon.types.map((type) => (
					<TypeChip key={type} type={type} />
				))}
			</div>
		))
	if (field.id === 'color')
		return cell((mon) => (
			<span className='flex items-center gap-1.5'>
				<span className='border-base-content/20 size-2.5 rounded-full border' style={{ backgroundColor: mon.color }} />
				<span className='opacity-70'>{mon.color}</span>
			</span>
		))
	if (field.kind === 'bool') return cell((mon) => <BoolCell value={field.get(mon)} />)
	if (field.kind === 'range' && Object.hasOwn(STAT_KEYS, field.id))
		return cell((mon) => <StatBar value={field.get(mon)} fieldId={field.id} />)
	if (field.kind === 'range')
		return cell((mon) => <span className='tabular-nums opacity-80'>{field.get(mon).toFixed(field.decimals ?? 0)}</span>)
	return cell((mon) => <span className='truncate opacity-70'>{field.get(mon)}</span>)
}

/** `'auto'` sorting only resolves the fns registered here; these are the ones it picks for string columns. */
export const features = tableFeatures({
	rowSortingFeature,
	columnFilteringFeature,
	columnVisibilityFeature,
	sortedRowModel: createSortedRowModel(),
	filteredRowModel: createFilteredRowModel(),
	sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

export const COLUMNS: ColumnDef<typeof features, Mon>[] = FIELDS.map((field) => ({
	id: field.id,
	header: field.label,
	accessorFn: (mon: Mon) => (field.kind === 'enum' ? field.get(mon).join(',') : field.get(mon)),
	enableSorting: field.kind !== 'enum',
	cell: cellFor(field),
	filterFn: (row, _id, value) => {
		const clean = sanitizeValue(field, value)
		return clean === undefined || matchField(field, row.original, clean)
	},
}))

export const HeaderFilter = ({
	field,
	value,
	setFilter,
}: {
	field: Field
	value: FilterValue | undefined
	setFilter: (id: string, value: FilterValue | undefined) => void
}) => (
	<details className='dropdown dropdown-end'>
		<summary
			className={`btn btn-ghost btn-xs h-5 min-h-0 px-1 ${value === undefined ? 'opacity-35 hover:opacity-100' : 'text-primary opacity-100'}`}
		>
			<LuFilter size={11} />
		</summary>
		<div className='dropdown-content rounded-box bg-base-100 border-base-content/10 z-30 mt-1 w-60 border p-3 shadow-xl'>
			<div className='mb-2 flex items-center justify-between'>
				<span className='text-xs font-semibold'>{field.label}</span>
				<button
					type='button'
					className='btn btn-ghost btn-xs h-4 min-h-0 px-1 opacity-60'
					onClick={() => setFilter(field.id, undefined)}
				>
					clear
				</button>
			</div>
			<FilterControl field={field} value={value} onChange={(next) => setFilter(field.id, next)} />
		</div>
	</details>
)

/**
 * A blocking overlay, not an inline bar. Covering the table stops stray clicks and scrolls queueing
 * up against a thread that is already behind, which is what escalates a stutter into Chrome's "Page
 * Unresponsive" dialog. No backdrop blur on purpose: it would compete for the very GPU we're waiting
 * on. Split out from `Root` so that `loadProgress` updates repaint this subtree alone — see the note
 * on `createProgressStore` for what routing them through root state actually cost.
 */
export const LoadOverlay = ({ label, size }: { label: string; size: string }) => {
	const { text, value } = useSyncExternalStore(loadProgress.subscribe, loadProgress.getSnapshot)
	return (
		<div className='bg-base-300/90 fixed inset-0 z-50 grid cursor-wait place-items-center'>
			<div className='card bg-base-100 w-[min(30rem,90vw)] shadow-xl'>
				<div className='card-body gap-3 p-5'>
					<h2 className='card-title gap-2 text-base'>
						<LuBrain size={18} /> Loading {label}
					</h2>
					<progress className='progress progress-primary w-full' value={value} max={1} />
					<p className='min-h-[2rem] text-xs opacity-70'>{text}</p>
					<p className='text-[11px] opacity-45'>{size}, cached after the first visit. Runs entirely in this tab.</p>
				</div>
			</div>
		</div>
	)
}
