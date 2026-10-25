// The wire format for scenarios: what `PRESET_SCENARIOS` are authored in and what the
// AI prompt asks for back. `hydrate` turns it into the runtime shape below.
export type ScenarioImport = {
	name: string
	items: { name: string; symbol: string }[]
	bundles: { name: string; price: number; quantities: number[] }[]
}

export type Item = { id: string; displayName: string; variable: string }

export type Bundle = { id: string; name: string; price: number; quantities: Record<string, number> }

export type Scenario = { id: string; name: string; items: Item[]; bundles: Bundle[] }

export type Need = Record<string, number>

export type Solution = {
	bundleCounts: Record<string, number>
	totalCost: number
	totalItems: Record<string, number>
	surplus: Record<string, number>
}

export type ImpliedValue = { itemId: string; value: number }
