import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { parseAsString, useQueryState } from 'https://esm.sh/nuqs'
import { NuqsAdapter } from 'https://esm.sh/nuqs/adapters/react'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { useFavorites } from './favorites'
import { FilterDrawer } from './filter-drawer'
import { ControlBar, PlateSvg } from './plate'
import { RecipeList } from './recipe-list'
import {
	availableSizes,
	type Constraint,
	emptyFilters,
	type Filters,
	matchesFilter,
	parseInitialDims,
	restoredKey,
	sortRecipes,
	type TagId,
} from './recipes'
import { solve } from './solver'

const Root = () => {
	const [compactId, setCompactId] = useQueryState('id', parseAsString)
	const [W, setW] = useState(() => parseInitialDims(compactId)?.W ?? 6)
	const [H, setH] = useState(() => parseInitialDims(compactId)?.H ?? 5)
	const recipes = sortRecipes(solve({ W, H }))
	// W and H are themselves restored from compactId, so the first render already solves the linked grid
	const [selectedKey, setSelectedKey] = useState<string | null>(
		() => (compactId ? restoredKey(compactId, recipes) : null) ?? recipes[0]?.key ?? null,
	)
	const [filters, setFilters] = useState<Filters>(emptyFilters)
	const { favorites, toggleFavorite } = useFavorites()

	// Resizing the grid resolves a whole new recipe list: reselect the first, drop now-impossible sizes
	const gridKey = `${W}x${H}`
	const [prevGridKey, setPrevGridKey] = useState(gridKey)
	const gridChanged = prevGridKey !== gridKey

	if (gridChanged) {
		setPrevGridKey(gridKey)
		setSelectedKey(recipes[0]?.key ?? null)
		const valid = new Set(availableSizes(W, H))
		setFilters((f) => ({ ...f, constraints: f.constraints.filter((c) => valid.has(c.size)) }))
	}

	const filteredRecipes = recipes.filter((r) => matchesFilter(r, filters, favorites))
	const filteredIndex = selectedKey ? filteredRecipes.findIndex((r) => r.key === selectedKey) : -1
	const selectedRecipe = filteredRecipes[filteredIndex] ?? null
	const filtersActive = filters.tags.size > 0 || filters.favoriteOnly || filters.constraints.length > 0

	// Deselect during render when filtering removes the selected recipe. Skipped on a grid change:
	// selectedKey still belongs to the old grid, so it never matches, and clearing it would undo the reselect above.
	if (!gridChanged && selectedKey && filteredIndex === -1) setSelectedKey(null)

	const toggleTag = (id: TagId) =>
		setFilters((f) => {
			const tags = new Set(f.tags)
			if (tags.has(id)) tags.delete(id)
			else tags.add(id)
			return { ...f, tags }
		})

	const clearAll = () => setFilters(emptyFilters())

	const setSizeConstraint = (size: string, op: Constraint['op'] | null) =>
		setFilters((f) => {
			if (!op) return { ...f, constraints: f.constraints.filter((c) => c.size !== size) }
			if (f.constraints.some((c) => c.size === size))
				return {
					...f,
					constraints: f.constraints.map((c) =>
						c.size === size ? { ...c, op, n: op === 'exclude' ? 0 : Math.max(1, c.n) } : c,
					),
				}
			return { ...f, constraints: [...f.constraints, { size, op, n: op === 'exclude' ? 0 : 1 }] }
		})

	const updateSizeN = (size: string, n: number) =>
		setFilters((f) => ({ ...f, constraints: f.constraints.map((c) => (c.size === size ? { ...c, n } : c)) }))

	return (
		<ThemeProvider>
			<div className='drawer drawer-end min-h-screen'>
				<input id='filter-drawer' type='checkbox' className='drawer-toggle' />

				<div className='drawer-content'>
					<main className='grid w-full grid-cols-1 gap-4 p-4 md:h-dvh md:grid-cols-2 md:grid-rows-1 md:overflow-hidden'>
						<PlateSvg layout={selectedRecipe?.layout ?? []} W={W} H={H} />

						<nav className='grid h-dvh max-h-full grid-rows-[auto_minmax(0,1fr)] gap-4 pb-4'>
							<ControlBar
								W={W}
								H={H}
								onWidthChange={(value) => {
									setW(value)
									void setCompactId(null)
								}}
								onDepthChange={(value) => {
									setH(value)
									void setCompactId(null)
								}}
								recipe={selectedRecipe}
								filtersActive={filtersActive}
							/>
							<RecipeList
								filteredRecipes={filteredRecipes}
								totalCount={recipes.length}
								selectedKey={selectedKey}
								filteredIndex={filteredIndex}
								onSelect={(key, encoded) => {
									setSelectedKey(key)
									void setCompactId(encoded)
								}}
								filtersActive={filtersActive}
								onClearAll={clearAll}
								filters={filters}
								favorites={favorites}
								toggleFavorite={toggleFavorite}
								W={W}
								H={H}
							/>
						</nav>
					</main>
				</div>

				<FilterDrawer
					filters={filters}
					filteredRecipes={filteredRecipes}
					favorites={favorites}
					onToggleFavoriteOnly={() => setFilters((f) => ({ ...f, favoriteOnly: !f.favoriteOnly }))}
					onToggleTag={toggleTag}
					onSetSizeConstraint={setSizeConstraint}
					onUpdateSizeCount={updateSizeN}
					W={W}
					H={H}
				/>
			</div>
		</ThemeProvider>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(
	<NuqsAdapter>
		<Root />
	</NuqsAdapter>,
)
