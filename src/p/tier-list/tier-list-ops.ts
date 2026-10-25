import type { UniqueIdentifier } from 'https://esm.sh/@dnd-kit/core'
import { arrayMove } from 'https://esm.sh/@dnd-kit/sortable'
import type { Item, Tier, TierList } from './schema'
import { BANK_ID } from './schema'

type ItemPlacement = { itemId: string; containerId: string; index?: number }

type ItemReorder = { containerId: string; itemId: string; overItemId: string }

// Pure derivations and state transitions over a TierList. Keeping them at module scope
// leaves the provider as wiring only, and lets the drag layer reuse the same derivations.
export const unassignedItemsOf = (list: TierList) => {
	const assigned = new Set(list.tiers.flatMap((tier) => tier.itemIds))
	return list.items.filter((item) => !assigned.has(item.id))
}

export const tierItemsOf = (list: TierList, tierId: string) => {
	const tier = list.tiers.find((candidate) => candidate.id === tierId)
	if (!tier) return []
	return tier.itemIds
		.map((itemId) => list.items.find((item) => item.id === itemId))
		.filter((item): item is Item => item !== undefined)
}

export const withTierUpdated = (list: TierList, updated: Tier) => ({
	...list,
	tiers: list.tiers.map((tier) => (tier.id === updated.id ? updated : tier)),
})

export const withTierInserted = (list: TierList, index: number, inserted: Tier) => ({
	...list,
	tiers: [...list.tiers.slice(0, index), inserted, ...list.tiers.slice(index)],
})

// The last row is never removable — a tier list with no rows has nothing to drop onto
export const withTierDeleted = (list: TierList, tierId: string) =>
	list.tiers.length > 1 ? { ...list, tiers: list.tiers.filter((tier) => tier.id !== tierId) } : list

export const withTiersReordered = (list: TierList, activeId: UniqueIdentifier, overId: UniqueIdentifier) => {
	const fromIndex = list.tiers.findIndex((tier) => tier.id === String(activeId))
	const toIndex = list.tiers.findIndex((tier) => tier.id === String(overId))
	if (fromIndex === -1 || toIndex === -1) return list
	return { ...list, tiers: arrayMove(list.tiers, fromIndex, toIndex) }
}

export const withItemMoved = (list: TierList, { itemId, containerId, index }: ItemPlacement) => {
	const moved = list.items.find((candidate) => candidate.id === itemId)
	if (!moved) return list

	const tiersWithoutItem = list.tiers.map((tier) => ({
		...tier,
		itemIds: tier.itemIds.filter((id) => id !== itemId),
	}))

	if (containerId === BANK_ID) {
		// Bank order is derived from the items array; insert before the bank item at `index`
		const assigned = new Set(tiersWithoutItem.flatMap((tier) => tier.itemIds))
		const bankItems = list.items.filter((candidate) => !assigned.has(candidate.id) && candidate.id !== itemId)
		const insertBefore = index == null ? undefined : bankItems[index]
		const remaining = list.items.filter((candidate) => candidate.id !== itemId)
		const insertAt = insertBefore
			? remaining.findIndex((candidate) => candidate.id === insertBefore.id)
			: remaining.length
		return {
			...list,
			tiers: tiersWithoutItem,
			items: [...remaining.slice(0, insertAt), moved, ...remaining.slice(insertAt)],
		}
	}

	const tiers = tiersWithoutItem.map((tier) => {
		if (tier.id !== containerId) return tier
		const insertAt = index == null ? tier.itemIds.length : Math.min(index, tier.itemIds.length)
		return { ...tier, itemIds: [...tier.itemIds.slice(0, insertAt), itemId, ...tier.itemIds.slice(insertAt)] }
	})
	return { ...list, tiers }
}

export const withItemReordered = (list: TierList, { containerId, itemId, overItemId }: ItemReorder) => {
	if (containerId === BANK_ID) {
		const fromIndex = list.items.findIndex((item) => item.id === itemId)
		const toIndex = list.items.findIndex((item) => item.id === overItemId)
		if (fromIndex === -1 || toIndex === -1) return list
		return { ...list, items: arrayMove(list.items, fromIndex, toIndex) }
	}

	const tiers = list.tiers.map((tier) => {
		if (tier.id !== containerId) return tier
		const fromIndex = tier.itemIds.indexOf(itemId)
		const toIndex = tier.itemIds.indexOf(overItemId)
		if (fromIndex === -1 || toIndex === -1) return tier
		return { ...tier, itemIds: arrayMove(tier.itemIds, fromIndex, toIndex) }
	})
	return { ...list, tiers }
}

export const withItemUpdated = (list: TierList, updated: Item) => ({
	...list,
	items: list.items.map((item) => (item.id === updated.id ? updated : item)),
})

export const withItemDeleted = (list: TierList, itemId: string) => ({
	...list,
	items: list.items.filter((item) => item.id !== itemId),
	tiers: list.tiers.map((tier) => ({ ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) })),
})
