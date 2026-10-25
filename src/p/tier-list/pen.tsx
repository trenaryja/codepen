import { DndContext, DragOverlay, useDroppable } from 'https://esm.sh/@dnd-kit/core'
import { rectSortingStrategy, SortableContext } from 'https://esm.sh/@dnd-kit/sortable'
import { cn, ThemePicker, ThemeProvider, Toaster } from 'https://esm.sh/@trenaryja/ui'
import React from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuPlus } from 'https://esm.sh/react-icons/lu'
import { BANK_ID } from './schema'
import { EditSettingsDialog, ExportButton, ImportDialog } from './settings-dialogs'
import { TierListProvider, useTierList } from './tier-list-context'
import { EditTierItemDialog, shapeClasses, TierItem, TierRow } from './tier-row'
import { useTierListDragAndDrop } from './use-tier-list-drag-and-drop'

const TierListHeader = () => {
	const { tierList, handleTitleUpdate } = useTierList()
	return (
		<div className='flex items-center gap-2'>
			<input
				className='input grow font-bold'
				value={tierList.title}
				onChange={(event) => handleTitleUpdate(event.target.value)}
			/>
			<ThemePicker />
			<EditSettingsDialog />
			<ExportButton />
			<ImportDialog />
		</div>
	)
}

const TierRowList = () => {
	const { tierList } = useTierList()
	return (
		<SortableContext items={tierList.tiers.map((tier) => tier.id)} strategy={rectSortingStrategy}>
			<div className='border-collapse'>
				{tierList.tiers.map((tier) => (
					<TierRow key={tier.id} tier={tier} />
				))}
			</div>
		</SortableContext>
	)
}

const ItemBank = () => {
	const { settings, getUnassignedItems, handleItemInsert, setEditingItemId } = useTierList()
	const { setNodeRef } = useDroppable({ id: BANK_ID })
	const unassignedItems = getUnassignedItems()
	return (
		<SortableContext items={unassignedItems.map((item) => item.id)} strategy={rectSortingStrategy}>
			<div ref={setNodeRef} className='rounded-box flex flex-wrap gap-2 border border-dashed border-current/25 p-4'>
				{unassignedItems.map((item) => (
					<TierItem key={item.id} item={item} />
				))}
				<button
					type='button'
					onClick={() => setEditingItemId(handleItemInsert().id)}
					className={cn(
						'btn btn-ghost grid place-items-center border border-dashed border-current/25',
						shapeClasses[settings.itemShape],
						'size-16 sm:size-20',
					)}
				>
					<LuPlus />
				</button>
			</div>
		</SortableContext>
	)
}

const Index = () => {
	const { activeItem, activeTier, dndContextProps } = useTierListDragAndDrop()

	return (
		<div className='full-bleed-container min-h-screen content-start gap-y-6 p-4'>
			<TierListHeader />

			<DndContext {...dndContextProps}>
				<TierRowList />
				<ItemBank />

				<DragOverlay>
					{activeTier ? (
						<TierRow tier={activeTier} isOverlay />
					) : activeItem ? (
						<TierItem item={activeItem} isOverlay />
					) : null}
				</DragOverlay>
			</DndContext>

			<EditTierItemDialog />
		</div>
	)
}

const Root = () => (
	<ThemeProvider>
		<TierListProvider>
			<Index />
			<Toaster />
		</TierListProvider>
	</ThemeProvider>
)

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(<Root />)
