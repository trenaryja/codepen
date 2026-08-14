import {
	type Active,
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	getFirstCollision,
	MeasuringStrategy,
	type Over,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	type UniqueIdentifier,
	useDroppable,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import {
	ColorPicker,
	ConfirmButton,
	cn,
	isDark,
	Modal,
	TextArea,
	ThemePicker,
	ThemeProvider,
	Toaster,
	toast,
} from 'https://esm.sh/@trenaryja/ui'
import React, {
	type CSSProperties,
	createContext,
	type ReactElement,
	type ReactNode,
	useContext,
	useRef,
	useState,
} from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import {
	LuCircle,
	LuDownload,
	LuPlus,
	LuSettings,
	LuSquare,
	LuSquircle,
	LuTrash2,
	LuUpload,
} from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'

// ── Schema ────────────────────────────────────────────────────────────────────

const imageUrlSchema = z.union([z.url(), z.string().startsWith('data:image/')])

const tierSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	color: z.string().optional(),
	imageUrl: imageUrlSchema.optional(),
	itemIds: z.array(z.string()).default([]),
})
type Tier = z.infer<typeof tierSchema>

const itemSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	color: z.string().optional(),
	imageUrl: imageUrlSchema.optional(),
})
type Item = z.infer<typeof itemSchema>

const settingsSchema = z.object({
	showLabels: z.boolean().default(true),
	showImages: z.boolean().default(true),
	itemShape: z.enum(['square', 'circle', 'rounded']).default('rounded'),
})
type TierListSettings = z.infer<typeof settingsSchema>

const CURRENT_VERSION = 1

// Migration chain: unversioned legacy exports → v1. Future versions append steps here.
const migrate = (data: unknown) => {
	if (!R.isPlainObject(data) || 'version' in data) return data
	// Legacy exports always carried settings.showImages=false while images rendered unconditionally —
	// flip it so migrated files keep looking the way they did
	const settings = R.isPlainObject(data.settings) ? { ...data.settings, showImages: true } : undefined
	return { ...data, settings, version: 1 }
}

const tierListSchema = z.preprocess(
	migrate,
	z
		.object({
			version: z.literal(CURRENT_VERSION),
			title: z.string().min(1),
			tiers: z.array(tierSchema).min(1),
			items: z.array(itemSchema),
			settings: settingsSchema.default({ showLabels: true, showImages: true, itemShape: 'rounded' }),
		})
		.superRefine((data, ctx) => {
			const tierIds = R.map(data.tiers, R.prop('id'))
			if (new Set(tierIds).size !== tierIds.length)
				ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'Tier IDs must be unique' })

			const itemIds = R.map(data.items, R.prop('id'))
			if (new Set(itemIds).size !== itemIds.length)
				ctx.addIssue({ code: 'custom', path: ['items'], message: 'Item IDs must be unique' })

			const itemIdSet = new Set(itemIds)
			data.tiers.forEach((tier, tierIndex) => {
				const missing = tier.itemIds.filter((id) => !itemIdSet.has(id))
				if (missing.length)
					ctx.addIssue({
						code: 'custom',
						path: ['tiers', tierIndex, 'itemIds'],
						message: `Unknown item id(s): ${missing.join(', ')}`,
					})
			})

			const multiAssigned = R.pipe(
				data.tiers,
				R.flatMap((tier) => tier.itemIds),
				R.countBy((id) => id),
				(counts) => R.entries(counts),
				R.filter(([, count]) => count > 1),
				R.map(([id]) => id),
			)
			if (multiAssigned.length)
				ctx.addIssue({
					code: 'custom',
					path: ['tiers'],
					message: `Items assigned to multiple tiers: ${multiAssigned.join(', ')}`,
				})
		}),
)
type TierList = z.infer<typeof tierListSchema>

// Not `crypto.randomUUID` — that one is secure-context only, so a plain-http preview
// (phone hitting this over the LAN) would throw here at module scope and render nothing
const randomId = () =>
	Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')

const defaultTierList: TierList = tierListSchema.parse({
	title: 'My Tier List',
	tiers: [
		{ id: randomId(), label: 'S', color: '#f0b100' },
		{ id: randomId(), label: 'A', color: '#fb2c36' },
		{ id: randomId(), label: 'B', color: '#ff6900' },
		{ id: randomId(), label: 'C', color: '#00c950' },
		{ id: randomId(), label: 'D', color: '#2b7fff' },
		{ id: randomId(), label: 'F', color: '#ad46ff' },
	],
	items: [
		{ id: randomId(), label: 'Example 1' },
		{ id: randomId(), label: 'Example 2' },
		{ id: randomId(), label: 'Example 3' },
		{ id: randomId(), label: 'Example 4' },
		{ id: randomId(), label: 'Example 5' },
		{ id: randomId(), label: 'Example 6' },
		{ id: randomId(), label: 'Example 7' },
		{ id: randomId(), label: 'Example 8' },
	],
})

// ── State ─────────────────────────────────────────────────────────────────────

const BANK_ID = 'option-bank'
const STORAGE_KEY = 'tier-list'

const deserializeTierList = (value: string | undefined) => {
	try {
		const result = tierListSchema.safeParse(JSON.parse(value ?? ''))
		return result.success ? result.data : defaultTierList
	} catch {
		return defaultTierList
	}
}

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

const useTierList = () => {
	const ctx = useContext(TierListContext)
	if (!ctx) throw new Error('useTierList must be used within a TierListProvider')
	return ctx
}

const TierListProvider = ({ children }: { children: ReactNode }) => {
	const [tierList, setTierList] = useLocalStorage<TierList>({
		key: STORAGE_KEY,
		defaultValue: defaultTierList,
		deserialize: deserializeTierList,
	})
	const [editingItemId, setEditingItemId] = useState<string | null>(null)
	const editingItem = tierList.items.find((item) => item.id === editingItemId)

	const setSettings = (settings: TierListSettings) => setTierList((prev) => ({ ...prev, settings }))

	const handleTierUpdate = (updated: Tier) =>
		setTierList((prev) => ({ ...prev, tiers: prev.tiers.map((t) => (t.id === updated.id ? updated : t)) }))

	const handleTierInsert = (index: number, initial: Partial<Tier> = {}) => {
		const newTier: Tier = {
			id: initial.id ?? randomId(),
			label: initial.label ?? 'X',
			color: initial.color,
			itemIds: initial.itemIds ?? [],
			imageUrl: initial.imageUrl,
		}
		setTierList((prev) => ({ ...prev, tiers: [...prev.tiers.slice(0, index), newTier, ...prev.tiers.slice(index)] }))
		return newTier
	}

	const handleTierDelete = (tierId: string) =>
		setTierList((prev) =>
			prev.tiers.length > 1 ? { ...prev, tiers: prev.tiers.filter((t) => t.id !== tierId) } : prev,
		)

	const handleTierDrop = (activeId: UniqueIdentifier, overId?: UniqueIdentifier) => {
		if (!overId) return
		setTierList((prev) => {
			const fromIndex = prev.tiers.findIndex((t) => t.id === String(activeId))
			const toIndex = prev.tiers.findIndex((t) => t.id === String(overId))
			if (fromIndex === -1 || toIndex === -1) return prev
			return { ...prev, tiers: arrayMove(prev.tiers, fromIndex, toIndex) }
		})
	}

	const handleItemMove = (itemId: string, containerId: string, index?: number) => {
		setTierList((prev) => {
			const item = prev.items.find((i) => i.id === itemId)
			if (!item) return prev

			const tiersWithoutItem = prev.tiers.map((t) => ({ ...t, itemIds: t.itemIds.filter((id) => id !== itemId) }))

			if (containerId === BANK_ID) {
				// Bank order is derived from the items array; insert before the bank item at `index`
				const assigned = new Set(tiersWithoutItem.flatMap((t) => t.itemIds))
				const bankItems = prev.items.filter((i) => !assigned.has(i.id) && i.id !== itemId)
				const insertBefore = index != null ? bankItems[index] : undefined
				const remaining = prev.items.filter((i) => i.id !== itemId)
				const insertAt = insertBefore ? remaining.findIndex((i) => i.id === insertBefore.id) : remaining.length
				return {
					...prev,
					tiers: tiersWithoutItem,
					items: [...remaining.slice(0, insertAt), item, ...remaining.slice(insertAt)],
				}
			}

			const tiers = tiersWithoutItem.map((t) => {
				if (t.id !== containerId) return t
				const insertAt = index != null ? Math.min(index, t.itemIds.length) : t.itemIds.length
				return { ...t, itemIds: [...t.itemIds.slice(0, insertAt), itemId, ...t.itemIds.slice(insertAt)] }
			})
			return { ...prev, tiers }
		})
	}

	const handleItemReorder = (containerId: string, itemId: string, overItemId: string) => {
		setTierList((prev) => {
			if (containerId === BANK_ID) {
				const fromIndex = prev.items.findIndex((i) => i.id === itemId)
				const toIndex = prev.items.findIndex((i) => i.id === overItemId)
				if (fromIndex === -1 || toIndex === -1) return prev
				return { ...prev, items: arrayMove(prev.items, fromIndex, toIndex) }
			}
			const tiers = prev.tiers.map((t) => {
				if (t.id !== containerId) return t
				const fromIndex = t.itemIds.indexOf(itemId)
				const toIndex = t.itemIds.indexOf(overItemId)
				if (fromIndex === -1 || toIndex === -1) return t
				return { ...t, itemIds: arrayMove(t.itemIds, fromIndex, toIndex) }
			})
			return { ...prev, tiers }
		})
	}

	const handleItemInsert = () => {
		const newItem: Item = { id: randomId(), label: 'New Item' }
		setTierList((prev) => ({ ...prev, items: [...prev.items, newItem] }))
		return newItem
	}

	const handleItemUpdate = (updated: Item) =>
		setTierList((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) }))

	const handleItemDelete = (itemId: string) =>
		setTierList((prev) => ({
			...prev,
			items: prev.items.filter((i) => i.id !== itemId),
			tiers: prev.tiers.map((t) => ({ ...t, itemIds: t.itemIds.filter((id) => id !== itemId) })),
		}))

	const handleImport = (imported: TierList) => setTierList(imported)

	const handleTitleUpdate = (title: string) => setTierList((prev) => ({ ...prev, title }))

	const getItemsForTier = (tierId: string) => {
		const tier = tierList.tiers.find((t) => t.id === String(tierId))
		if (!tier) return []
		return tier.itemIds
			.map((itemId) => tierList.items.find((it) => it.id === itemId))
			.filter((it): it is Item => it !== undefined)
	}

	const getUnassignedItems = () => {
		const assigned = new Set(tierList.tiers.flatMap((x) => x.itemIds))
		return tierList.items.filter((x) => !assigned.has(x.id))
	}

	return (
		<TierListContext.Provider
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
				handleImport,
				handleTitleUpdate,
				getItemsForTier,
				getUnassignedItems,
			}}
		>
			{children}
		</TierListContext.Provider>
	)
}

// ── Shared bits ───────────────────────────────────────────────────────────────

const shapeClasses = {
	square: 'rounded-none',
	circle: 'rounded-full',
	rounded: 'rounded-box',
} satisfies Record<TierListSettings['itemShape'], string>

const contrastTheme = (color: string | undefined) =>
	R.isDefined(color) ? (isDark(color) ? 'dark' : 'light') : undefined

type ImageUrlFieldProps = {
	id: string
	value: string | undefined
	onChange: (value: string | undefined) => void
}

const ImageUrlField = ({ id, value, onChange }: ImageUrlFieldProps) => (
	<div className='grid gap-2'>
		<input
			id={id}
			type='text'
			value={value ?? ''}
			onChange={(e) => onChange(e.target.value || undefined)}
			placeholder='https://… or data:image/…'
			className='input w-full'
		/>
		{value && imageUrlSchema.safeParse(value).success && (
			<img src={value} alt='Preview' className='size-20 object-cover rounded-box' />
		)}
		{value && !imageUrlSchema.safeParse(value).success && (
			<p className='text-error text-sm'>Must be a URL or a data:image/… string</p>
		)}
	</div>
)

// ── Tier editing ──────────────────────────────────────────────────────────────

type EditTierRowFormProps = {
	tier: Tier
	close: () => void
}

const EditTierRowForm = ({ tier, close }: EditTierRowFormProps) => {
	const { tierList, handleTierUpdate, handleTierDelete } = useTierList()
	const [label, setLabel] = useState(tier.label)
	const [color, setColor] = useState(tier.color)
	const [imageUrl, setImageUrl] = useState(tier.imageUrl)

	const isValid = !!label.trim() && (!imageUrl || imageUrlSchema.safeParse(imageUrl).success)

	const handleSave = () => {
		handleTierUpdate({ ...tier, label: label.trim(), color, imageUrl })
		close()
		toast.success('Tier updated')
	}

	return (
		<div className='grid grid-cols-[auto_1fr] gap-4 items-center'>
			<h3 className='font-bold text-lg col-span-full'>Edit Tier</h3>

			<label htmlFor='tier-label'>Label</label>
			<input
				id='tier-label'
				type='text'
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				placeholder='Tier label'
				className='input w-full'
			/>

			<span className='self-start'>Color</span>
			<ColorPicker value={color} onChange={setColor} format='hex' />

			<label htmlFor='tier-image' className='self-start'>
				Image
			</label>
			<ImageUrlField id='tier-image' value={imageUrl} onChange={setImageUrl} />

			<div className='flex justify-between col-span-full gap-2'>
				<ConfirmButton
					className='btn btn-error btn-outline'
					disabled={tierList.tiers.length === 1}
					onConfirm={() => {
						handleTierDelete(tier.id)
						close()
						toast.success('Tier deleted')
					}}
				>
					<LuTrash2 /> Delete
				</ConfirmButton>
				<div className='flex gap-2'>
					<button type='button' className='btn' onClick={close}>
						Cancel
					</button>
					<button type='button' className='btn btn-primary' disabled={!isValid} onClick={handleSave}>
						Save
					</button>
				</div>
			</div>
		</div>
	)
}

type EditTierRowDialogProps = {
	tier: Tier
	trigger: ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>
}

const EditTierRowDialog = ({ tier, trigger }: EditTierRowDialogProps) => {
	const [open, setOpen] = useState(false)
	return (
		<Modal open={open} onOpenChange={setOpen} trigger={trigger}>
			{/* Mount the form only while open so each edit starts from the tier's current values */}
			{open && <EditTierRowForm tier={tier} close={() => setOpen(false)} />}
		</Modal>
	)
}

// ── Item editing ──────────────────────────────────────────────────────────────

type EditTierItemFormProps = {
	item: Item
	close: () => void
}

const EditTierItemForm = ({ item, close }: EditTierItemFormProps) => {
	const { handleItemUpdate, handleItemDelete } = useTierList()
	const [label, setLabel] = useState(item.label)
	const [color, setColor] = useState(item.color)
	const [imageUrl, setImageUrl] = useState(item.imageUrl)

	const isValid = !!label.trim() && (!imageUrl || imageUrlSchema.safeParse(imageUrl).success)

	const handleSave = () => {
		handleItemUpdate({ ...item, label: label.trim(), color, imageUrl })
		close()
		toast.success('Item updated')
	}

	return (
		<div className='grid grid-cols-[auto_1fr] gap-4 items-center'>
			<h3 className='font-bold text-lg col-span-full'>Edit Item</h3>

			<label htmlFor='item-label'>Label</label>
			<input
				id='item-label'
				type='text'
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				placeholder='Item label'
				className='input w-full'
			/>

			<span className='self-start'>Color</span>
			<ColorPicker value={color} onChange={setColor} format='hex' />

			<label htmlFor='item-image' className='self-start'>
				Image
			</label>
			<ImageUrlField id='item-image' value={imageUrl} onChange={setImageUrl} />

			<div className='flex justify-between col-span-full gap-2'>
				<ConfirmButton
					className='btn btn-error btn-outline'
					onConfirm={() => {
						handleItemDelete(item.id)
						close()
						toast.success('Item deleted')
					}}
				>
					<LuTrash2 /> Delete
				</ConfirmButton>
				<div className='flex gap-2'>
					<button type='button' className='btn' onClick={close}>
						Cancel
					</button>
					<button type='button' className='btn btn-primary' disabled={!isValid} onClick={handleSave}>
						Save
					</button>
				</div>
			</div>
		</div>
	)
}

const EditTierItemDialog = () => {
	const { editingItem, setEditingItemId } = useTierList()
	return (
		<Modal open={!!editingItem} onOpenChange={(open) => !open && setEditingItemId(null)}>
			{editingItem && <EditTierItemForm key={editingItem.id} item={editingItem} close={() => setEditingItemId(null)} />}
		</Modal>
	)
}

// ── Tier list pieces ──────────────────────────────────────────────────────────

type TierItemProps = {
	item: Item
	isOverlay?: boolean
}

const TierItem = ({ item, isOverlay }: TierItemProps) => {
	const { settings, setEditingItemId } = useTierList()
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		backgroundColor: item.color,
		backgroundImage: settings.showImages && item.imageUrl ? `url("${item.imageUrl}")` : undefined,
	}

	return (
		<button
			type='button'
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			tabIndex={-1}
			onClick={() => setEditingItemId(item.id)}
			data-theme={contrastTheme(item.color)}
			className={cn(
				'relative btn grid place-items-center gap-1 cursor-grab touch-none overflow-hidden bg-cover bg-center',
				shapeClasses[settings.itemShape],
				isDragging && 'opacity-25',
				isOverlay && 'cursor-grabbing',
				'size-16 sm:size-20',
			)}
		>
			{settings.showLabels && <span className='text-xs'>{item.label}</span>}
		</button>
	)
}

type AddTierRowButtonProps = {
	position: 'top' | 'bottom'
} & React.ComponentProps<'button'>

const AddTierRowButton = ({ position, ...props }: AddTierRowButtonProps) => (
	<div
		className={cn(
			'absolute z-10 sm:opacity-0 sm:hover:opacity-100 transition-opacity w-1/2 left-1/4 grid place-items-center',
			position === 'top' && '-top-3 sm:-top-4',
			position === 'bottom' && '-bottom-3 sm:-bottom-4',
		)}
	>
		<button type='button' tabIndex={-1} className='btn btn-xs sm:btn-sm btn-square' {...props}>
			<LuPlus />
		</button>
	</div>
)

type TierRowProps = {
	tier: Tier
	isOverlay?: boolean
}

const TierRow = ({ tier, isOverlay }: TierRowProps) => {
	const { getItemsForTier, handleTierInsert, tierList, settings } = useTierList()
	// The row's sortable registration doubles as the droppable container for items —
	// a separate useDroppable with the same id would conflict with it
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tier.id })

	const index = tierList.tiers.findIndex((t) => t.id === tier.id)
	const items = getItemsForTier(tier.id)

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn('relative flex border-current/10 border bg-base-100', isDragging && 'opacity-25')}
		>
			<EditTierRowDialog
				tier={tier}
				trigger={
					<button
						type='button'
						{...attributes}
						{...listeners}
						style={{
							backgroundColor: tier.color,
							backgroundImage: settings.showImages && tier.imageUrl ? `url("${tier.imageUrl}")` : undefined,
							backgroundSize: 'cover',
							backgroundPosition: 'center',
						}}
						data-theme={contrastTheme(tier.color)}
						className={cn(
							'grid place-items-center cursor-grab touch-none',
							'bg-base-300 font-bold',
							isOverlay && 'cursor-grabbing',
							'aspect-square min-w-20 sm:min-w-24',
						)}
					>
						{settings.showLabels ? tier.label : null}
					</button>
				}
			/>
			<SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
				<div className='flex-1 p-2 flex flex-wrap gap-2'>
					{items.map((item) => (
						<TierItem key={item.id} item={item} />
					))}
				</div>
			</SortableContext>
			{index === 0 && <AddTierRowButton position='top' onClick={() => handleTierInsert(0)} />}
			<AddTierRowButton position='bottom' onClick={() => handleTierInsert(index + 1)} />
		</div>
	)
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

const shapes = [
	{ name: 'square', Icon: LuSquare },
	{ name: 'rounded', Icon: LuSquircle },
	{ name: 'circle', Icon: LuCircle },
] as const

const EditSettingsDialog = () => {
	const { settings, setSettings } = useTierList()

	return (
		<Modal
			trigger={
				<button type='button' className='btn btn-square'>
					<LuSettings />
				</button>
			}
		>
			<h3 className='font-bold text-lg'>Display Settings</h3>

			<div className='grid gap-2 grid-cols-2 py-2'>
				<label htmlFor='show-labels'>Show Labels</label>
				<input
					type='checkbox'
					className='toggle'
					id='show-labels'
					checked={settings.showLabels}
					onChange={(e) => setSettings({ ...settings, showLabels: e.target.checked })}
				/>

				<label htmlFor='show-images'>Show Images</label>
				<input
					type='checkbox'
					className='toggle'
					id='show-images'
					checked={settings.showImages}
					onChange={(e) => setSettings({ ...settings, showImages: e.target.checked })}
				/>

				<span>Item Shape</span>
				<div className='flex gap-2'>
					{shapes.map(({ name, Icon }) => (
						<button
							type='button'
							key={name}
							className={cn('btn', settings.itemShape === name && 'btn-primary')}
							onClick={() => setSettings({ ...settings, itemShape: name })}
						>
							<Icon />
						</button>
					))}
				</div>
			</div>
		</Modal>
	)
}

const ExportButton = () => {
	const { tierList } = useTierList()

	const handleExport = () => {
		try {
			const jsonStr = JSON.stringify(tierList, null, 2)
			const blob = new Blob([jsonStr], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `${tierList.title.replace(/\s+/g, '-').toLowerCase()}.json`
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
			toast.success('Tier list exported')
		} catch {
			toast.error('Failed to export tier list')
		}
	}

	return (
		<button type='button' className='btn btn-square' onClick={handleExport}>
			<LuDownload />
		</button>
	)
}

const importSchema = z
	.string()
	.transform((s, ctx) => {
		try {
			return JSON.parse(s)
		} catch {
			ctx.addIssue({ code: 'custom', message: 'Invalid JSON format' })
			return z.NEVER
		}
	})
	.pipe(tierListSchema)

const ImportDialog = () => {
	const { handleImport } = useTierList()
	const [jsonInput, setJsonInput] = useState('')
	const [open, setOpen] = useState(false)
	const [isDraggingFile, setIsDraggingFile] = useState(false)

	const result = importSchema.safeParse(jsonInput)
	const issues = result.error?.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)

	const processJsonInput = () => {
		if (!result.success) return
		handleImport(result.data)
		toast.success('Tier list imported')
		setJsonInput('')
		setOpen(false)
	}

	return (
		<Modal
			open={open}
			onOpenChange={setOpen}
			trigger={
				<button type='button' className='btn btn-square'>
					<LuUpload />
				</button>
			}
			className='max-w-2xl'
		>
			<h3 className='font-bold text-lg'>Import Tier List</h3>
			<p className='py-2 text-sm opacity-70'>Paste your tier list JSON below or drag and drop a JSON file.</p>

			<div className='space-y-4 mt-2'>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-drop file target wrapping the focusable textarea; keyboard users paste instead */}
				<div
					className={cn('relative', isDraggingFile && 'ring-2 ring-primary')}
					onDragOver={(e) => {
						e.preventDefault()
						setIsDraggingFile(true)
					}}
					onDragLeave={(e) => {
						e.preventDefault()
						setIsDraggingFile(false)
					}}
					onDrop={(e) => {
						e.preventDefault()
						setIsDraggingFile(false)
						const file = e.dataTransfer.files[0]
						if (file?.type !== 'application/json') return toast.error('Please drop a valid JSON file.')
						const reader = new FileReader()
						reader.onload = (event) => setJsonInput(String(event.target?.result ?? ''))
						reader.readAsText(file)
					}}
				>
					<TextArea
						value={jsonInput}
						onChange={(e) => setJsonInput(e.target.value)}
						className='font-mono text-xs w-full min-h-32 max-h-[60ch]'
					/>
					{isDraggingFile && (
						<div className='absolute inset-0 bg-primary/10 rounded-md flex items-center justify-center pointer-events-none text-primary font-medium'>
							<p>Drop JSON file here</p>
						</div>
					)}
				</div>

				{jsonInput.length > 0 && issues && (
					<div className='alert alert-error p-3 text-sm'>
						<div>
							<strong className='font-bold'>Import Errors:</strong>
							<ul className='mt-1 list-disc list-inside'>
								{issues.map((issue) => (
									<li key={issue}>{issue}</li>
								))}
							</ul>
						</div>
					</div>
				)}

				<div className='flex justify-end gap-2'>
					<button
						type='button'
						className='btn'
						onClick={() => {
							setOpen(false)
							setJsonInput('')
						}}
					>
						Cancel
					</button>
					<button type='button' className='btn btn-primary' onClick={processJsonInput} disabled={!result.success}>
						Import
					</button>
				</div>
			</div>
		</Modal>
	)
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Whether the dragged item sits past the over item (next wrap line, or right of its midpoint)
const isAfterOverItem = (active: Active, over: Over) => {
	const translated = active.rect.current.translated
	if (!translated) return false
	const centerX = translated.left + translated.width / 2
	const centerY = translated.top + translated.height / 2
	if (centerY > over.rect.top + over.rect.height) return true
	if (centerY < over.rect.top) return false
	return centerX > over.rect.left + over.rect.width / 2
}

const Index = () => {
	const {
		tierList,
		settings,
		handleTitleUpdate,
		handleItemMove,
		handleItemReorder,
		handleItemInsert,
		setEditingItemId,
		getUnassignedItems,
		handleTierDrop,
	} = useTierList()
	const [activeItem, setActiveItem] = useState<Item | null>(null)
	const [activeTier, setActiveTier] = useState<Tier | null>(null)
	const { setNodeRef } = useDroppable({ id: BANK_ID })
	const lastOverId = useRef<UniqueIdentifier | null>(null)
	const recentlyMovedToNewContainer = useRef(false)
	const unassignedItems = getUnassignedItems()

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
	)

	const isTierId = (id: UniqueIdentifier) => tierList.tiers.some((t) => t.id === id)
	const isContainerId = (id: UniqueIdentifier) => id === BANK_ID || isTierId(id)

	const getContainerItemIds = (containerId: string) =>
		containerId === BANK_ID
			? unassignedItems.map((item) => item.id)
			: (tierList.tiers.find((t) => t.id === containerId)?.itemIds ?? [])

	const findContainerId = (id: UniqueIdentifier) => {
		if (isContainerId(id)) return String(id)
		const tier = tierList.tiers.find((t) => t.itemIds.includes(String(id)))
		if (tier) return tier.id
		return tierList.items.some((item) => item.id === id) ? BANK_ID : undefined
	}

	// Adapted from dnd-kit's MultipleContainers example: tiers sort against tiers only;
	// items prefer what's under the pointer, and pointing at a container's empty space
	// snaps to the closest item inside it so the whole row is a drop target.
	const collisionDetection: CollisionDetection = (args) => {
		if (isTierId(args.active.id))
			return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => isTierId(c.id)) })

		const pointerCollisions = pointerWithin(args)
		const collisions = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
		let overId = getFirstCollision(collisions, 'id')

		if (overId == null) {
			// When an item just moved containers, layouts are mid-shuffle; reuse the last
			// known target instead of flickering to "no target"
			if (recentlyMovedToNewContainer.current) lastOverId.current = args.active.id
			return lastOverId.current ? [{ id: lastOverId.current }] : []
		}

		if (isContainerId(overId)) {
			const containerItemIds = getContainerItemIds(String(overId))
			if (containerItemIds.length > 0) {
				const closestItem = closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(c) => c.id !== overId && containerItemIds.includes(String(c.id)),
					),
				})[0]
				if (closestItem) overId = closestItem.id
			}
		}

		lastOverId.current = overId
		return [{ id: overId }]
	}

	const handleDragStart = (event: DragStartEvent) => {
		const activeId = event.active.id
		const item = tierList.items.find((i) => i.id === activeId)
		if (item) {
			setActiveItem(item)
			setActiveTier(null)
			return
		}

		const tier = tierList.tiers.find((t) => t.id === activeId)
		if (tier) {
			setActiveTier(tier)
			setActiveItem(null)
		}
	}

	// Move items between containers while dragging so the drop lands where the preview shows
	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event
		if (!over || isTierId(active.id)) return

		const activeContainer = findContainerId(active.id)
		const overContainer = findContainerId(over.id)
		if (!activeContainer || !overContainer || activeContainer === overContainer) return

		const overItemIds = getContainerItemIds(overContainer)
		const overIndex = overItemIds.indexOf(String(over.id))
		const newIndex = overIndex === -1 ? overItemIds.length : overIndex + (isAfterOverItem(active, over) ? 1 : 0)

		recentlyMovedToNewContainer.current = true
		handleItemMove(String(active.id), overContainer, newIndex)
		// Hold the flag through the post-move re-render so collision detection can
		// fall back to the last target while layouts are mid-shuffle
		requestAnimationFrame(() => {
			recentlyMovedToNewContainer.current = false
		})
	}

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		setActiveItem(null)
		setActiveTier(null)
		if (!over) return

		if (isTierId(active.id)) return handleTierDrop(active.id, over.id)

		// Cross-container moves already happened in onDragOver; only same-container reorders remain
		const containerId = findContainerId(active.id)
		const overIsItem = tierList.items.some((item) => item.id === over.id)
		if (!containerId || !overIsItem || over.id === active.id) return
		if (findContainerId(over.id) === containerId) handleItemReorder(containerId, String(active.id), String(over.id))
	}

	return (
		<div className='full-bleed-container min-h-screen gap-y-6 p-4 content-start'>
			<div className='flex items-center gap-2'>
				<input
					className='input font-bold grow'
					value={tierList.title}
					onChange={(e) => handleTitleUpdate(e.target.value)}
				/>
				<ThemePicker />
				<EditSettingsDialog />
				<ExportButton />
				<ImportDialog />
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<SortableContext items={tierList.tiers.map((t) => t.id)} strategy={rectSortingStrategy}>
					<div className='border-collapse'>
						{tierList.tiers.map((tier) => (
							<TierRow key={tier.id} tier={tier} />
						))}
					</div>
				</SortableContext>

				<SortableContext items={unassignedItems.map((item) => item.id)} strategy={rectSortingStrategy}>
					<div ref={setNodeRef} className='rounded-box border border-current/25 border-dashed p-4 flex flex-wrap gap-2'>
						{unassignedItems.map((item) => (
							<TierItem key={item.id} item={item} />
						))}
						<button
							type='button'
							onClick={() => setEditingItemId(handleItemInsert().id)}
							className={cn(
								'btn btn-ghost border border-current/25 border-dashed grid place-items-center',
								shapeClasses[settings.itemShape],
								'size-16 sm:size-20',
							)}
						>
							<LuPlus />
						</button>
					</div>
				</SortableContext>

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

createRoot(document.getElementById('root')!).render(<Root />)
