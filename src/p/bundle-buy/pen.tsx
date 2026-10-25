import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import { Button, Field, Input, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuChevronDown, LuChevronUp } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { AllCombinationsTable, PerUnitBreakdown, SolutionDisplay, ValueDecomposition } from './analysis'
import { BundleEditor, ItemEditor, NeedsInput } from './editors'
import { LearnSection } from './learn-section'
import { ScenarioManager } from './scenario-manager'
import { EMPTY_SCENARIO, PRESET_SCENARIOS, USB_C_SCENARIO } from './scenarios'
import { deriveImpliedValues, hydrate, solve } from './solver'
import type { Need, Scenario } from './types'

function Root() {
	const [scenarios, setScenarios] = useLocalStorage<Scenario[]>({
		key: 'bundle-buy-scenarios',
		defaultValue: [USB_C_SCENARIO, ...PRESET_SCENARIOS.map(hydrate)],
	})
	const [activeId, setActiveId] = useLocalStorage({
		key: 'bundle-buy-active',
		defaultValue: USB_C_SCENARIO.id,
	})
	const [needs, setNeeds] = useState<Need>({})
	const [configOpen, setConfigOpen] = useState(false)
	const [seededScenarioId, setSeededScenarioId] = useState<string | null>(null)

	const scenario = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
	if (!scenario) return null

	// Re-seed needs during render when the active scenario changes or its items stop matching
	if (seededScenarioId !== scenario.id || Object.keys(needs).every((k) => scenario.items.every((i) => i.id !== k))) {
		if (seededScenarioId !== scenario.id) setSeededScenarioId(scenario.id)
		const defaultNeeds: Need = {}
		for (const item of scenario.items) defaultNeeds[item.id] = needs[item.id] ?? 0
		if (JSON.stringify(defaultNeeds) !== JSON.stringify(needs)) setNeeds(defaultNeeds)
	}

	const updateScenario = (patch: Partial<Scenario>) =>
		setScenarios((previous) => previous.map((s) => (s.id === scenario.id ? { ...s, ...patch } : s)))

	const hasNeeds = Object.values(needs).some((n) => n > 0)
	const solution = hasNeeds ? solve(scenario.bundles, scenario.items, needs) : null
	const impliedValues = deriveImpliedValues(scenario.bundles, scenario.items)

	return (
		<ThemeProvider>
			<main className='full-bleed-container min-h-screen p-4 sm:p-8'>
				<div className='mx-auto max-w-4xl space-y-8'>
					<div className='flex flex-wrap items-start justify-between gap-4'>
						<div>
							<h1 className='text-3xl font-bold'>Bundle Buy</h1>
							<p className='mt-1 text-sm opacity-60'>Find the cheapest way to buy what you need from bundle options</p>
						</div>
						<ThemePicker variant='modal' />
					</div>

					<ScenarioManager
						scenarios={scenarios}
						activeId={scenario.id}
						activeScenario={scenario}
						onSelect={(id) => setActiveId(id)}
						onDelete={(id) => {
							const remaining = scenarios.filter((s) => s.id !== id)
							setScenarios(remaining)
							if (activeId === id && remaining[0]) setActiveId(remaining[0].id)
						}}
						onNew={() => {
							const s = { ...EMPTY_SCENARIO, id: R.randomString(21) }
							setScenarios((previous) => [...previous, s])
							setActiveId(s.id)
							setConfigOpen(true)
						}}
						onDuplicate={() => {
							const s = { ...scenario, id: R.randomString(21), name: `${scenario.name} (copy)` }
							setScenarios((previous) => [...previous, s])
							setActiveId(s.id)
						}}
						onRestoreDefaults={() => {
							const defaults = [USB_C_SCENARIO, ...PRESET_SCENARIOS.map(hydrate)]
							setScenarios(defaults)
							setActiveId(USB_C_SCENARIO.id)
						}}
					/>

					<Field label='Scenario Name'>
						<Input
							value={scenario.name}
							onChange={(e) => updateScenario({ name: e.target.value })}
							className='text-lg font-semibold'
						/>
					</Field>

					<div>
						<Button
							className={`btn-sm gap-1 ${configOpen ? 'btn-active' : 'btn-ghost'}`}
							onClick={() => setConfigOpen(!configOpen)}
						>
							{configOpen ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
							Configure Items & Bundles
						</Button>
					</div>

					{configOpen && (
						<div className='surface space-y-6 p-6'>
							<ItemEditor items={scenario.items} onChange={(items) => updateScenario({ items })} />
							<div className='divider' />
							<BundleEditor
								bundles={scenario.bundles}
								items={scenario.items}
								onChange={(bundles) => updateScenario({ bundles })}
							/>
						</div>
					)}

					{scenario.items.length > 0 && (
						<div className='surface space-y-8 p-6'>
							<NeedsInput items={scenario.items} needs={needs} onChange={setNeeds} />
							<SolutionDisplay solution={solution} bundles={scenario.bundles} items={scenario.items} needs={needs} />
							<AllCombinationsTable
								bundles={scenario.bundles}
								items={scenario.items}
								needs={needs}
								solution={solution}
							/>
						</div>
					)}

					<PerUnitBreakdown bundles={scenario.bundles} items={scenario.items} />
					<ValueDecomposition bundles={scenario.bundles} items={scenario.items} impliedValues={impliedValues} />
					<LearnSection items={scenario.items} bundles={scenario.bundles} />
				</div>
			</main>
		</ThemeProvider>
	)
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(<Root />)
