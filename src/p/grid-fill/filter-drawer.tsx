import React from 'https://esm.sh/react'
import { LuHeart } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { SizeCell, TagChip } from './filter-controls'
import { type Constraint, type Filters, type Recipe, TAG_IDS, type TagId, availableSizes } from './recipes'

export type FilterDrawerProps = {
	filters: Filters
	filteredRecipes: Recipe[]
	favorites: Set<string>
	onToggleFavoriteOnly: () => void
	onToggleTag: (id: TagId) => void
	onSetSizeConstraint: (size: string, op: Constraint['op'] | null) => void
	onUpdateSizeCount: (size: string, count: number) => void
	W: number
	H: number
}

export const FilterDrawer = ({
	filters,
	filteredRecipes,
	favorites,
	onToggleFavoriteOnly,
	onToggleTag,
	onSetSizeConstraint,
	onUpdateSizeCount,
	W,
	H,
}: FilterDrawerProps) => {
	const favoriteCount = filteredRecipes.filter((r) => favorites.has(r.key)).length
	const tagCounts = new Map<TagId, number>(TAG_IDS.map((id) => [id, 0]))
	for (const recipe of filteredRecipes) for (const tag of recipe.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
	const filteredSizeCounts = new Map<string, number>()
	for (const recipe of filteredRecipes)
		for (const size of R.keys(recipe.counts)) filteredSizeCounts.set(size, (filteredSizeCounts.get(size) ?? 0) + 1)

	return (
		<div className='drawer-side z-20'>
			<label htmlFor='filter-drawer' aria-label='close filters' className='drawer-overlay' />
			<div className='bg-base-200 flex min-h-full w-sm flex-col gap-4 overflow-y-auto p-4'>
				<div className='flex items-center justify-between'>
					<span className='font-semibold'>Filters</span>
					<label htmlFor='filter-drawer' className='btn btn-sm btn-ghost btn-square'>
						✕
					</label>
				</div>
				<div className='flex flex-col gap-2'>
					<div className='flex flex-wrap justify-center gap-2'>
						<TagChip
							id='favorite'
							icon={<LuHeart className='size-3' />}
							active={filters.favoriteOnly}
							onToggle={onToggleFavoriteOnly}
							count={favoriteCount}
						/>
						{TAG_IDS.map((id) => (
							<TagChip
								key={id}
								id={id}
								active={filters.tags.has(id)}
								onToggle={() => onToggleTag(id)}
								count={tagCounts.get(id) ?? 0}
							/>
						))}
					</div>
					<div className='grid gap-2' style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
						{availableSizes(W, H).map((size) => (
							<SizeCell
								key={size}
								size={size}
								constraint={filters.constraints.find((c) => c.size === size) ?? null}
								filteredCount={filteredSizeCounts.get(size) ?? 0}
								onSetOp={(op) => onSetSizeConstraint(size, op)}
								onUpdateN={(n) => onUpdateSizeCount(size, n)}
								W={W}
								H={H}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	)
}
