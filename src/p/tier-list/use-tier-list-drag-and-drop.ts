import type {
	Active,
	CollisionDetection,
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
	Over,
	UniqueIdentifier,
} from 'https://esm.sh/@dnd-kit/core'
import {
	closestCenter,
	getFirstCollision,
	MeasuringStrategy,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import { useRef, useState } from 'https://esm.sh/react'
import type { Item, Tier, TierList } from './schema'
import { BANK_ID } from './schema'
import { useTierList } from './tier-list-context'
import { unassignedItemsOf } from './tier-list-ops'

// Whether the dragged item sits past the over item (next wrap line, or right of its midpoint)
// Whether the dragged item sits past the over item (next wrap line, or right of its midpoint)
const isAfterOverItem = (active: Active, over: Over) => {
	const { translated } = active.rect.current
	if (!translated) return false
	const centerX = translated.left + translated.width / 2
	const centerY = translated.top + translated.height / 2
	if (centerY > over.rect.top + over.rect.height) return true
	if (centerY < over.rect.top) return false
	return centerX > over.rect.left + over.rect.width / 2
}

const isTierId = (list: TierList, id: UniqueIdentifier) => list.tiers.some((tier) => tier.id === id)

const isContainerId = (list: TierList, id: UniqueIdentifier) => id === BANK_ID || isTierId(list, id)

const getContainerItemIds = (list: TierList, containerId: string) =>
	containerId === BANK_ID
		? unassignedItemsOf(list).map((item) => item.id)
		: (list.tiers.find((tier) => tier.id === containerId)?.itemIds ?? [])

const findContainerId = (list: TierList, id: UniqueIdentifier) => {
	if (isContainerId(list, id)) return String(id)
	const tier = list.tiers.find((candidate) => candidate.itemIds.includes(String(id)))
	if (tier) return tier.id
	return list.items.some((item) => item.id === id) ? BANK_ID : undefined
}

export const useTierListDragAndDrop = () => {
	const { tierList, handleItemMove, handleItemReorder, handleTierDrop } = useTierList()
	const [activeItem, setActiveItem] = useState<Item | null>(null)
	const [activeTier, setActiveTier] = useState<Tier | null>(null)
	const lastOverIdRef = useRef<UniqueIdentifier | null>(null)
	const recentlyMovedToNewContainerRef = useRef(false)

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
	)

	// Adapted from dnd-kit's MultipleContainers example: tiers sort against tiers only;
	// items prefer what's under the pointer, and pointing at a container's empty space
	// snaps to the closest item inside it so the whole row is a drop target.
	const collisionDetection: CollisionDetection = (args) => {
		if (isTierId(tierList, args.active.id))
			return closestCenter({
				...args,
				droppableContainers: args.droppableContainers.filter((container) => isTierId(tierList, container.id)),
			})

		const pointerCollisions = pointerWithin(args)
		const collisions = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
		let overId = getFirstCollision(collisions, 'id')

		if (overId == null) {
			// When an item just moved containers, layouts are mid-shuffle; reuse the last
			// known target instead of flickering to "no target"
			if (recentlyMovedToNewContainerRef.current) lastOverIdRef.current = args.active.id
			return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : []
		}

		if (isContainerId(tierList, overId)) {
			const containerItemIds = getContainerItemIds(tierList, String(overId))

			if (containerItemIds.length > 0) {
				const closestItem = closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(container) => container.id !== overId && containerItemIds.includes(String(container.id)),
					),
				})[0]
				if (closestItem) overId = closestItem.id
			}
		}

		lastOverIdRef.current = overId
		return [{ id: overId }]
	}

	const handleDragStart = (event: DragStartEvent) => {
		const activeId = event.active.id
		const item = tierList.items.find((candidate) => candidate.id === activeId)

		if (item) {
			setActiveItem(item)
			setActiveTier(null)
			return
		}

		const tier = tierList.tiers.find((candidate) => candidate.id === activeId)

		if (!tier) return

		setActiveTier(tier)
		setActiveItem(null)
	}

	// Move items between containers while dragging so the drop lands where the preview shows
	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event
		if (!over || isTierId(tierList, active.id)) return

		const activeContainer = findContainerId(tierList, active.id)
		const overContainer = findContainerId(tierList, over.id)
		if (!activeContainer || !overContainer || activeContainer === overContainer) return

		const overItemIds = getContainerItemIds(tierList, overContainer)
		const overIndex = overItemIds.indexOf(String(over.id))
		const newIndex = overIndex === -1 ? overItemIds.length : overIndex + (isAfterOverItem(active, over) ? 1 : 0)

		recentlyMovedToNewContainerRef.current = true
		handleItemMove(String(active.id), overContainer, newIndex)
		// Hold the flag through the post-move re-render so collision detection can
		// fall back to the last target while layouts are mid-shuffle
		requestAnimationFrame(() => {
			recentlyMovedToNewContainerRef.current = false
		})
	}

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		setActiveItem(null)
		setActiveTier(null)
		if (!over) return

		if (isTierId(tierList, active.id)) return void handleTierDrop(active.id, over.id)

		// Cross-container moves already happened in onDragOver; only same-container reorders remain
		const containerId = findContainerId(tierList, active.id)
		const overIsItem = tierList.items.some((item) => item.id === over.id)
		if (!containerId || !overIsItem || over.id === active.id) return
		if (findContainerId(tierList, over.id) === containerId)
			handleItemReorder(containerId, String(active.id), String(over.id))
	}

	return {
		activeItem,
		activeTier,
		dndContextProps: {
			sensors,
			collisionDetection,
			measuring: { droppable: { strategy: MeasuringStrategy.Always } },
			onDragStart: handleDragStart,
			onDragOver: handleDragOver,
			onDragEnd: handleDragEnd,
		},
	}
}
