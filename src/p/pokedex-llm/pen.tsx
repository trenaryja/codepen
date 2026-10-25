import type { ColumnVisibilityState, SortingState } from 'https://esm.sh/@tanstack/react-table'
import { useTable } from 'https://esm.sh/@tanstack/react-table'
import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'
import type { Rejection } from './engine'
import { streamFilters } from './engine'
import type { FilterValue, Filters } from './fields'
import { DEFAULT_COLUMNS, FIELD_BY_ID } from './fields'
import { sanitizeFilters, sanitizeSorting } from './filters'
import { useEngine, usePokedexRows } from './hooks'
import { JsonDrawer, PokedexBody, PromptHeader, StatusBar } from './panels'
import { COLUMNS, features } from './table'

const Root = () => {
	const { rows, loadError } = usePokedexRows()
	const [filters, setFilters] = useState<Filters>({})
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(
		R.mapValues(FIELD_BY_ID, (field) => DEFAULT_COLUMNS.has(field.id)),
	)

	const [prompt, setPrompt] = useState('')
	const [running, setRunning] = useState(false)
	const [streamText, setStreamText] = useState('')
	const [touched, setTouched] = useState<Set<string>>(() => new Set())
	const [rejection, setRejection] = useState<Rejection | null>(null)
	const [showJson, setShowJson] = useState(false)

	const columnFilters = R.entries(filters).map(([id, value]) => ({ id, value }))

	const table = useTable({
		features,
		data: rows,
		columns: COLUMNS,
		state: { columnFilters, sorting, columnVisibility },
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
	})

	const { engineRef, runIdRef, modelId, modelState, modelError, timing, setTiming, loadModel, selectModel } =
		useEngine()

	const setFilter = (id: string, value: FilterValue | undefined) =>
		setFilters((current) => (value === undefined ? R.omit(current, [id]) : { ...current, [id]: value }))

	const toggleColumn = (id: string) => setColumnVisibility((current) => ({ ...current, [id]: !(current[id] ?? true) }))

	const resetAll = () => {
		setFilters({})
		setSorting([])
		setTouched(new Set())
		setRejection(null)
	}

	// Every accepted partial replaces the whole table state, so a response that never reaches `query`
	// or `sort` clears them instead of leaving the previous prompt's. `ok` streams after `thinking`,
	// and until it lands neither branch is chosen — applying then would wipe the table on a rejection.
	const applyPartial = (parsed: Record<string, unknown>) => {
		if (parsed.ok !== true) return
		const fields = Array.isArray(parsed.fields) ? parsed.fields.filter((id) => typeof id === 'string') : []
		setTouched(new Set(fields))
		setFilters(sanitizeFilters(parsed.query))
		setSorting(sanitizeSorting(parsed.sort))
	}

	const run = () => {
		const engine = engineRef.current
		if (!engine || !prompt.trim() || running) return
		const runId = runIdRef.current
		const isStale = () => runId !== runIdRef.current
		setRunning(true)
		setRejection(null)
		setStreamText('')

		const onProgress = (text: string, parsed: Record<string, unknown> | null) => {
			if (isStale()) return
			setStreamText(text)
			if (parsed) applyPartial(parsed)
		}

		void streamFilters(engine, prompt.trim(), onProgress).then((result) => {
			// This run exclusively owns `running`, so clearing it above the staleness check is what stops
			// a stream off a swapped-out engine leaving the prompt disabled forever.
			setRunning(false)
			if (isStale()) return
			if (result.ok) {
				if (result.rejection) setRejection(result.rejection)
				setTiming((current) => ({ ...current, decode: result.decodeMs, tokensPerSecond: result.tokensPerSecond }))
			} else setRejection({ reason: 'error', message: result.message })
		})
	}

	return (
		<ThemeProvider>
			<div className='bg-base-100 flex h-screen w-screen flex-col overflow-hidden'>
				<PromptHeader
					prompt={prompt}
					setPrompt={setPrompt}
					onRun={run}
					running={running}
					modelId={modelId}
					onSelectModel={selectModel}
					modelState={modelState}
					modelError={modelError}
					onEnable={() => loadModel(modelId)}
					rejection={rejection}
					onDismissRejection={() => setRejection(null)}
				/>

				<PokedexBody
					rows={rows}
					loadError={loadError}
					table={table}
					filters={filters}
					setFilter={setFilter}
					touched={touched}
					onReset={resetAll}
				/>

				{showJson && <JsonDrawer streamText={streamText} onClose={() => setShowJson(false)} />}

				<StatusBar
					filteredRows={table.getRowModel().rows.length}
					totalRows={rows.length}
					columnVisibility={columnVisibility}
					onToggleColumn={toggleColumn}
					filters={filters}
					setFilter={setFilter}
					timing={timing}
					onToggleJson={() => setShowJson((current) => !current)}
				/>
			</div>
		</ThemeProvider>
	)
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(<Root />)
