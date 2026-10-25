import React, { Fragment, useEffect, useRef } from 'https://esm.sh/react'
import { LuHeart } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import type { CustomItemComponentProps, VirtualizerHandle } from 'https://esm.sh/virtua'
import { Virtualizer } from 'https://esm.sh/virtua'
import { TAGS } from './constants'
import { EdgeBadges } from './migrate-to-ui'
import { type Filters, type Recipe, byFamily, encodeRecipe, sortWith } from './recipes'

export const RecipeItem = ({ ref, style, children }: CustomItemComponentProps) => (
	<li ref={ref} style={style} className='flex list-none items-center gap-2 *:mt-3'>
		{children}
	</li>
)

export type RecipeListProps = {
	filteredRecipes: Recipe[]
	totalCount: number
	selectedKey: string | null
	filteredIndex: number
	onSelect: (key: string, encoded: string) => void
	filtersActive: boolean
	onClearAll: () => void
	filters: Filters
	favorites: Set<string>
	toggleFavorite: (key: string) => void
	W: number
	H: number
}

export const RecipeList = ({
	filteredRecipes,
	totalCount,
	selectedKey,
	filteredIndex,
	onSelect,
	filtersActive,
	onClearAll,
	filters,
	favorites,
	toggleFavorite,
	W,
	H,
}: RecipeListProps) => {
	const listRef = useRef<VirtualizerHandle>(null)

	useEffect(() => {
		if (filteredIndex >= 0) listRef.current?.scrollToIndex(filteredIndex, { align: 'nearest' })
		else listRef.current?.scrollTo(0)
	}, [W, H, filters, filteredIndex])

	return (
		<div className='grid grid-rows-[auto_minmax(0,1fr)] gap-2'>
			<div className='text-base-content/70 flex items-center justify-between text-sm'>
				<span>
					Showing {filteredRecipes.length} of {totalCount} recipes
				</span>
				{filtersActive && (
					<button type='button' className='btn btn-xs btn-ghost' onClick={onClearAll}>
						Clear all
					</button>
				)}
			</div>

			<div className='overflow-hidden'>
				{filteredRecipes.length === 0 ? (
					<div className='text-base-content/70 flex size-full flex-col items-center justify-center gap-3 text-sm'>
						<span>No matching recipes.</span>
						<button type='button' className='btn btn-sm' onClick={onClearAll}>
							Clear all filters
						</button>
					</div>
				) : (
					<div className='scroll-fade-y max-h-full'>
						<Virtualizer
							ref={listRef}
							as='ul'
							item={RecipeItem}
							data={filteredRecipes}
							itemSize={62}
							bufferSize={8 * 62}
						>
							{(recipe) => {
								const isSelected = recipe.key === selectedKey
								const encoded = encodeRecipe(recipe.counts, W, H)
								return (
									<Fragment key={recipe.key}>
										<button
											type='button'
											onClick={() => onSelect(recipe.key, encoded)}
											className={`surface relative flex-1 cursor-pointer p-2 transition-colors ${isSelected ? 'border-primary' : ''}`}
										>
											<EdgeBadges placement='top-start'>
												<span className='badge badge-xs badge-soft font-mono'>{encoded}</span>
											</EdgeBadges>
											<EdgeBadges placement='top-end'>
												{recipe.tags.map((tag) => (
													<span key={tag} className='badge badge-xs badge-soft'>
														{TAGS[tag].label}
													</span>
												))}
											</EdgeBadges>
											<div className='overflow-x-fade flex flex-nowrap gap-2 pt-2'>
												{sortWith(R.entries(recipe.counts), (a, b) => byFamily(a[0], b[0])).map(([size, count]) => (
													<span key={size} className='indicator badge badge-soft tabular-nums'>
														{count > 1 && (
															<span className='indicator-item badge badge-xs px-1 tabular-nums'>{count}</span>
														)}
														{size}
													</span>
												))}
											</div>
										</button>
										<button
											type='button'
											className='btn btn-ghost btn-square btn-sm shrink-0'
											onClick={() => toggleFavorite(recipe.key)}
										>
											<LuHeart
												className={favorites.has(recipe.key) ? 'fill-primary text-primary' : 'text-base-content/30'}
											/>
										</button>
									</Fragment>
								)
							}}
						</Virtualizer>
					</div>
				)}
			</div>
		</div>
	)
}
