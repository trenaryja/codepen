import type { UniqueIdentifier } from 'https://esm.sh/@dnd-kit/core'
import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import type { ReactNode } from 'https://esm.sh/react'
import React, { createContext, use, useState } from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import type { Item, Tier, TierList, TierListSettings } from './schema'
import { defaultTierList, deserializeTierList, STORAGE_KEY } from './schema'
import {
	tierItemsOf,
	unassignedItemsOf,
	withItemDeleted,
	withItemMoved,
	withItemReordered,
	withItemUpdated,
	withTierDeleted,
	withTierInserted,
	withTiersReordered,
	withTierUpdated,
} from './tier-list-ops'

type TierListContextValue = {
	tierList: TierList
	settings: TierListSettings
	setSettings: (settings: TierListSettings) => void
	editingItem: Item | undefined
	setEditingItemId: (id: string | null) => void
	handleTierUpdate: (updated: Tier) => void
	handleTierInsert: (index: number, initial?: Partial<Tier>) => Tier
	handleTierDelete: (tierId: string) => void
	handleTierDrop: (activeId: UniqueIdentifier, overId?: UniqueIdentifier) => void
	handleItemMove: (itemId: string, containerId: string, index?: number) => void
	handleItemReorder: (containerId: string, itemId: string, overItemId: string) => void
	handleItemInsert: () => Item
	handleItemUpdate: (updated: Item) => void
	handleItemDelete: (itemId: string) => void
	handleImport: (imported: TierList) => void
	handleTitleUpdate: (title: string) => void
	getItemsForTier: (tierId: string) => Item[]
	getUnassignedItems: () => Item[]
}

const TierListContext = createContext<TierListContextValue | undefined>(undefined)

export const useTierList = () => {
	const context = use(TierListContext)
	if (!context) throw new Error('useTierList must be used within a TierListProvider')
	return context
}

export const TierListProvider = ({ children }: { children: ReactNode }) => {
	const [tierList, setTierList] = useLocalStorage<TierList>({
		key: STORAGE_KEY,
		defaultValue: defaultTierList,
		deserialize: deserializeTierList,
	})
	const [editingItemId, setEditingItemId] = useState<string | null>(null)
	const editingItem = tierList.items.find((item) => item.id === editingItemId)

	const setSettings = (settings: TierListSettings) => setTierList((previous) => ({ ...previous, settings }))

	const handleTierUpdate = (updated: Tier) => setTierList((previous) => withTierUpdated(previous, updated))

	const handleTierInsert = (index: number, initial: Partial<Tier> = {}) => {
		const newTier: Tier = {
			id: initial.id ?? R.randomString(21),
			label: initial.label ?? 'X',
			color: initial.color,
			itemIds: initial.itemIds ?? [],
			imageUrl: initial.imageUrl,
		}
		setTierList((previous) => withTierInserted(previous, index, newTier))
		return newTier
	}

	const handleTierDelete = (tierId: string) => setTierList((previous) => withTierDeleted(previous, tierId))

	const handleTierDrop = (activeId: UniqueIdentifier, overId?: UniqueIdentifier) => {
		if (!overId) return
		setTierList((previous) => withTiersReordered(previous, activeId, overId))
	}

	const handleItemMove = (itemId: string, containerId: string, index?: number) =>
		setTierList((previous) => withItemMoved(previous, { itemId, containerId, index }))

	const handleItemReorder = (containerId: string, itemId: string, overItemId: string) =>
		setTierList((previous) => withItemReordered(previous, { containerId, itemId, overItemId }))

	const handleItemInsert = () => {
		const newItem: Item = { id: R.randomString(21), label: 'New Item' }
		setTierList((previous) => ({ ...previous, items: [...previous.items, newItem] }))
		return newItem
	}

	const handleItemUpdate = (updated: Item) => setTierList((previous) => withItemUpdated(previous, updated))

	const handleItemDelete = (itemId: string) => setTierList((previous) => withItemDeleted(previous, itemId))

	const handleTitleUpdate = (title: string) => setTierList((previous) => ({ ...previous, title }))

	const getItemsForTier = (tierId: string) => tierItemsOf(tierList, tierId)

	const getUnassignedItems = () => unassignedItemsOf(tierList)

	return (
		<TierListContext
			value={{
				tierList,
				settings: tierList.settings,
				setSettings,
				editingItem,
				setEditingItemId,
				handleTierUpdate,
				handleTierInsert,
				handleTierDelete,
				handleTierDrop,
				handleItemMove,
				handleItemReorder,
				handleItemInsert,
				handleItemUpdate,
				handleItemDelete,
				handleImport: setTierList,
				handleTitleUpdate,
				getItemsForTier,
				getUnassignedItems,
			}}
		>
			{children}
		</TierListContext>
	)
}
