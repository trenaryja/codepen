import type { ColumnVisibilityState, ReactTable } from 'https://esm.sh/@tanstack/react-table'
import { Button, Input, ThemePicker } from 'https://esm.sh/@trenaryja/ui'
import React, { useRef } from 'https://esm.sh/react'
import {
	LuBrain,
	LuChevronDown,
	LuChevronUp,
	LuCircleAlert,
	LuColumns3,
	LuCornerDownLeft,
	LuSparkles,
	LuX,
} from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { Virtualizer } from 'https://esm.sh/virtua'
import type { ModelState, Rejection } from './engine'
import { MODELS } from './engine'
import type { FilterValue, Filters, Mon } from './fields'
import { FIELDS, FIELD_BY_ID } from './fields'
import { FilterPanel, summarize } from './filter-controls'
import type { Timing } from './hooks'
import { HeaderFilter, LoadOverlay, features } from './table'

export type ModelNoticeProps = {
	modelState: ModelState
	modelError: string
	size: string
}

/** The one-line status under the prompt: what loading the model buys you, or why it didn't load. */
export const ModelNotice = ({ modelState, modelError, size }: ModelNoticeProps) => {
	if (modelState === 'idle')
		return (
			<p className='px-3 pb-2 text-[11px] opacity-50'>
				The table below works right now — filter and sort it however you like. Loading the model ({size}, cached after
				the first visit) adds natural-language search on top, running entirely in this tab.
			</p>
		)
	if (modelState !== 'error') return null
	return (
		<p className='text-error px-3 pb-2 text-[11px]'>
			Couldn't load the model: {modelError}.{' '}
			{/* ~700 MB of weights: a dropped connection is likelier than absent WebGPU. Only blame WebGPU when it is. */}
			{'gpu' in navigator
				? 'Try again — the weights download can drop partway.'
				: 'This pen needs WebGPU, which this browser does not support.'}
		</p>
	)
}

export type PromptHeaderProps = {
	prompt: string
	setPrompt: (value: string) => void
	onRun: () => void
	running: boolean
	modelId: string
	onSelectModel: (id: string) => void
	modelState: ModelState
	modelError: string
	onEnable: () => void
	rejection: Rejection | null
	onDismissRejection: () => void
}

export const PromptHeader = ({
	prompt,
	setPrompt,
	onRun,
	running,
	modelId,
	onSelectModel,
	modelState,
	modelError,
	onEnable,
	rejection,
	onDismissRejection,
}: PromptHeaderProps) => {
	const selectedModel = MODELS.find((model) => model.id === modelId) ?? MODELS[1]

	return (
		<header className='border-base-content/10 bg-base-200/60 shrink-0 border-b'>
			<div className='flex items-center gap-2 px-3 py-2'>
				<span className='flex shrink-0 items-center gap-1.5 text-sm font-semibold'>
					<LuSparkles size={15} className='text-primary' /> Pokédex
				</span>

				<div className='relative min-w-0 flex-1'>
					<Input
						className='input input-sm w-full pr-20'
						placeholder={
							modelState === 'ready'
								? 'Describe what you want — "tanky water types from the first two gens"'
								: 'Enable natural-language search to type a request…'
						}
						value={prompt}
						disabled={modelState !== 'ready' || running}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') onRun()
						}}
					/>
					<span className='absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 text-[10px] opacity-40'>
						{running ? <span className='loading loading-spinner loading-xs' /> : <LuCornerDownLeft size={11} />}
					</span>
				</div>

				<div className='flex shrink-0 items-center gap-2'>
					<select
						className='select select-sm select-bordered w-40'
						value={modelId}
						disabled={modelState === 'loading' || running}
						onChange={(event) => onSelectModel(event.target.value)}
					>
						{MODELS.map((model) => (
							<option key={model.id} value={model.id}>
								{modelState === 'ready' ? model.label : `${model.label} · ${model.size}`}
							</option>
						))}
					</select>
					{modelState !== 'ready' && (
						<Button className='btn-sm btn-primary' disabled={modelState === 'loading'} onClick={onEnable}>
							<LuBrain size={14} />
							{modelState === 'loading' ? 'Loading…' : 'Enable AI search'}
						</Button>
					)}
				</div>

				<ThemePicker variant='modal' />
			</div>

			{modelState === 'loading' && <LoadOverlay label={selectedModel.label} size={selectedModel.size} />}

			<ModelNotice modelState={modelState} modelError={modelError} size={selectedModel.size} />

			{rejection && (
				<div className='alert alert-warning mx-3 mb-2 px-3 py-1.5 text-xs'>
					<LuCircleAlert size={14} />
					<span>{rejection.message}</span>
					<button type='button' className='btn btn-ghost btn-xs' onClick={onDismissRejection}>
						<LuX size={12} />
					</button>
				</div>
			)}
		</header>
	)
}

export type TableGridProps = {
	table: ReactTable<typeof features, Mon>
	filters: Filters
	setFilter: (id: string, value: FilterValue | undefined) => void
}

export const TableGrid = ({ table, filters, setFilter }: TableGridProps) => {
	const scrollRef = useRef<HTMLDivElement>(null)
	const headers = table.getHeaderGroups()[0]?.headers ?? []
	const columns = headers
		.map((header) => {
			const field = FIELD_BY_ID[header.column.id]
			return field && { header, field }
		})
		.filter(R.isTruthy)
	const gridTemplate = columns.map(({ field }) => `${field.width}px`).join(' ')

	return (
		<div ref={scrollRef} className='flex-1 overflow-auto'>
			<div style={{ width: gridTemplate ? 'max-content' : '100%', minWidth: '100%' }}>
				<div
					className='bg-base-200 border-base-content/15 sticky top-0 z-20 grid border-b text-xs font-semibold'
					style={{ gridTemplateColumns: gridTemplate }}
				>
					{columns.map(({ header, field }) => {
						const sorted = header.column.getIsSorted()
						return (
							<div key={header.id} className='flex min-w-0 items-center gap-1 px-2 py-1.5'>
								<button
									type='button'
									className={`truncate text-left ${header.column.getCanSort() ? 'hover:text-primary cursor-pointer' : 'cursor-default'}`}
									onClick={header.column.getToggleSortingHandler()}
								>
									<table.FlexRender header={header} />
								</button>
								{sorted === 'asc' && <LuChevronUp size={11} className='text-primary shrink-0' />}
								{sorted === 'desc' && <LuChevronDown size={11} className='text-primary shrink-0' />}
								<span className='flex-1' />
								<HeaderFilter field={field} value={filters[header.column.id]} setFilter={setFilter} />
							</div>
						)
					})}
				</div>

				<Virtualizer scrollRef={scrollRef} data={table.getRowModel().rows} itemSize={40} bufferSize={12 * 40}>
					{(row) => (
						<div
							key={row.id}
							className='border-base-content/5 hover:bg-base-200/60 grid h-10 items-center border-b text-xs'
							style={{ gridTemplateColumns: gridTemplate }}
						>
							{row.getVisibleCells().map((visibleCell) => (
								<div key={visibleCell.id} className='min-w-0 truncate px-2'>
									<table.FlexRender cell={visibleCell} />
								</div>
							))}
						</div>
					)}
				</Virtualizer>
			</div>
		</div>
	)
}

export type PokedexBodyProps = TableGridProps & {
	rows: Mon[]
	loadError: string | null
	touched: Set<string>
	onReset: () => void
}

/** The filter panel and whichever of the three table states applies. */
export const PokedexBody = ({ rows, loadError, touched, onReset, ...grid }: PokedexBodyProps) => (
	<div className='flex min-h-0 flex-1'>
		<FilterPanel filters={grid.filters} setFilter={grid.setFilter} touched={touched} onReset={onReset} />

		<main className='flex min-w-0 flex-1 flex-col'>
			{loadError ? (
				<div className='text-error grid flex-1 place-items-center text-sm'>Failed to load Pokédex: {loadError}</div>
			) : rows.length === 0 ? (
				<div className='grid flex-1 place-items-center gap-2'>
					<span className='loading loading-spinner loading-lg' />
				</div>
			) : (
				<TableGrid {...grid} />
			)}
		</main>
	</div>
)

export const JsonDrawer = ({ streamText, onClose }: { streamText: string; onClose: () => void }) => (
	<div className='border-base-content/10 bg-base-300/40 flex h-56 shrink-0 flex-col border-t'>
		<div className='border-base-content/10 flex items-center justify-between border-b px-3 py-1.5'>
			<span className='text-xs font-semibold opacity-70'>Model output</span>
			<button type='button' className='btn btn-ghost btn-xs' onClick={onClose}>
				<LuX size={12} />
			</button>
		</div>
		<pre className='flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap'>
			{streamText || <span className='opacity-40'>Run a natural-language search to see what the model emits.</span>}
		</pre>
	</div>
)

export type StatusBarProps = {
	filteredRows: number
	totalRows: number
	columnVisibility: ColumnVisibilityState
	onToggleColumn: (id: string) => void
	filters: Filters
	setFilter: (id: string, value: FilterValue | undefined) => void
	timing: Timing
	onToggleJson: () => void
}

export const StatusBar = ({
	filteredRows,
	totalRows,
	columnVisibility,
	onToggleColumn,
	filters,
	setFilter,
	timing,
	onToggleJson,
}: StatusBarProps) => (
	<footer className='border-base-content/10 bg-base-200/60 flex shrink-0 items-center gap-3 border-t px-3 py-1 text-[11px]'>
		<span className='tabular-nums'>
			<strong>{filteredRows.toLocaleString()}</strong>
			<span className='opacity-50'> / {totalRows.toLocaleString()} Pokémon</span>
		</span>
		{!R.isEmpty(filters) && (
			<span className='flex min-w-0 flex-wrap items-center gap-1'>
				{R.entries(filters).map(([id, value]) => {
					const field = FIELD_BY_ID[id]
					return (
						field && (
							<span key={id} className='badge badge-xs badge-primary badge-soft gap-1'>
								{field.label}: {summarize(field, value)}
								<button type='button' onClick={() => setFilter(id, undefined)}>
									<LuX size={9} />
								</button>
							</span>
						)
					)
				})}
			</span>
		)}
		<span className='flex-1' />
		{timing.load != null && <span className='opacity-45'>model {(timing.load / 1000).toFixed(1)}s</span>}
		{timing.decode != null && <span className='opacity-45'>decode {(timing.decode / 1000).toFixed(2)}s</span>}
		{timing.tokensPerSecond != null && <span className='opacity-45'>{timing.tokensPerSecond.toFixed(0)} tok/s</span>}
		<details className='dropdown dropdown-top dropdown-end'>
			<summary className='btn btn-ghost btn-xs'>
				<LuColumns3 size={12} /> Columns
			</summary>
			<div className='dropdown-content rounded-box bg-base-100 border-base-content/10 z-30 mb-1 max-h-80 w-52 overflow-y-auto border p-2 shadow-xl'>
				{FIELDS.map((field) => (
					<label
						key={field.id}
						className='hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded px-1 py-0.5'
					>
						<input
							type='checkbox'
							className='checkbox checkbox-xs'
							checked={columnVisibility[field.id] ?? true}
							onChange={() => onToggleColumn(field.id)}
						/>
						<span className='text-xs'>{field.label}</span>
					</label>
				))}
			</div>
		</details>
		<button type='button' className='btn btn-ghost btn-xs' onClick={onToggleJson}>
			<LuBrain size={12} /> JSON
		</button>
	</footer>
)
