import {
	closestCenter,
	DndContext,
	DragOverlay,
	getFirstCollision,
	MeasuringStrategy,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	useDroppable,
	useSensor,
	useSensors,
} from 'https://esm.sh/@dnd-kit/core'
import type {
	Active,
	CollisionDetection,
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
	Over,
	UniqueIdentifier,
} from 'https://esm.sh/@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import {
	cn,
	ColorPicker,
	ConfirmButton,
	isDark,
	Modal,
	TextArea,
	ThemePicker,
	ThemeProvider,
	toast,
	Toaster,
} from 'https://esm.sh/@trenaryja/ui'
import React, { createContext, use, useRef, useState } from 'https://esm.sh/react'
import type { ReactElement, ReactNode } from 'https://esm.sh/react'
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
		.superRefine((data, context) => {
			const tierIds = R.map(data.tiers, R.prop('id'))
			if (new Set(tierIds).size !== tierIds.length)
				context.addIssue({ code: 'custom', path: ['tiers'], message: 'Tier IDs must be unique' })

			const itemIds = R.map(data.items, R.prop('id'))
			if (new Set(itemIds).size !== itemIds.length)
				context.addIssue({ code: 'custom', path: ['items'], message: 'Item IDs must be unique' })

			const itemIdSet = new Set(itemIds)
			data.tiers.forEach((tier, tierIndex) => {
				const missing = tier.itemIds.filter((id) => !itemIdSet.has(id))
				if (missing.length)
					context.addIssue({
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
				context.addIssue({
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
	const context = use(TierListContext)
	if (!context) throw new Error('useTierList must be used within a TierListProvider')
	return context
}

const TierListProvider = ({ children }: { children: ReactNode }) => {
	const [tierList, setTierList] = useLocalStorage<TierList>({
		key: STORAGE_KEY,
		defaultValue: defaultTierList,
		deserialize: deserializeTierList,
	})
	const [editingItemId, setEditingItemId] = useState<string | null>(null)
	const editingItem = tierList.items.find((item) => item.id === editingItemId)

	const setSettings = (settings: TierListSettings) => setTierList((previous) => ({ ...previous, settings }))

	const handleTierUpdate = (updated: Tier) =>
		setTierList((previous) => ({
			...previous,
			tiers: previous.tiers.map((tier) => (tier.id === updated.id ? updated : tier)),
		}))

	const handleTierInsert = (index: number, initial: Partial<Tier> = {}) => {
		const newTier: Tier = {
			id: initial.id ?? randomId(),
			label: initial.label ?? 'X',
			color: initial.color,
			itemIds: initial.itemIds ?? [],
			imageUrl: initial.imageUrl,
		}
		setTierList((previous) => ({
			...previous,
			tiers: [...previous.tiers.slice(0, index), newTier, ...previous.tiers.slice(index)],
		}))
		return newTier
	}

	const handleTierDelete = (tierId: string) =>
		setTierList((previous) =>
			previous.tiers.length > 1
				? { ...previous, tiers: previous.tiers.filter((tier) => tier.id !== tierId) }
				: previous,
		)

	const handleTierDrop = (activeId: UniqueIdentifier, overId?: UniqueIdentifier) => {
		if (!overId) return
		setTierList((previous) => {
			const fromIndex = previous.tiers.findIndex((tier) => tier.id === String(activeId))
			const toIndex = previous.tiers.findIndex((tier) => tier.id === String(overId))
			if (fromIndex === -1 || toIndex === -1) return previous
			return { ...previous, tiers: arrayMove(previous.tiers, fromIndex, toIndex) }
		})
	}

	const handleItemMove = (itemId: string, containerId: string, index?: number) => {
		setTierList((previous) => {
			const item = previous.items.find((candidate) => candidate.id === itemId)
			if (!item) return previous

			const tiersWithoutItem = previous.tiers.map((tier) => ({
				...tier,
				itemIds: tier.itemIds.filter((id) => id !== itemId),
			}))

			if (containerId === BANK_ID) {
				// Bank order is derived from the items array; insert before the bank item at `index`
				const assigned = new Set(tiersWithoutItem.flatMap((tier) => tier.itemIds))
				const bankItems = previous.items.filter((candidate) => !assigned.has(candidate.id) && candidate.id !== itemId)
				const insertBefore = index != null ? bankItems[index] : undefined
				const remaining = previous.items.filter((candidate) => candidate.id !== itemId)
				const insertAt = insertBefore
					? remaining.findIndex((candidate) => candidate.id === insertBefore.id)
					: remaining.length
				return {
					...previous,
					tiers: tiersWithoutItem,
					items: [...remaining.slice(0, insertAt), item, ...remaining.slice(insertAt)],
				}
			}

			const tiers = tiersWithoutItem.map((tier) => {
				if (tier.id !== containerId) return tier
				const insertAt = index != null ? Math.min(index, tier.itemIds.length) : tier.itemIds.length
				return { ...tier, itemIds: [...tier.itemIds.slice(0, insertAt), itemId, ...tier.itemIds.slice(insertAt)] }
			})
			return { ...previous, tiers }
		})
	}

	const handleItemReorder = (containerId: string, itemId: string, overItemId: string) => {
		setTierList((previous) => {
			if (containerId === BANK_ID) {
				const fromIndex = previous.items.findIndex((item) => item.id === itemId)
				const toIndex = previous.items.findIndex((item) => item.id === overItemId)
				if (fromIndex === -1 || toIndex === -1) return previous
				return { ...previous, items: arrayMove(previous.items, fromIndex, toIndex) }
			}

			const tiers = previous.tiers.map((tier) => {
				if (tier.id !== containerId) return tier
				const fromIndex = tier.itemIds.indexOf(itemId)
				const toIndex = tier.itemIds.indexOf(overItemId)
				if (fromIndex === -1 || toIndex === -1) return tier
				return { ...tier, itemIds: arrayMove(tier.itemIds, fromIndex, toIndex) }
			})
			return { ...previous, tiers }
		})
	}

	const handleItemInsert = () => {
		const newItem: Item = { id: randomId(), label: 'New Item' }
		setTierList((previous) => ({ ...previous, items: [...previous.items, newItem] }))
		return newItem
	}

	const handleItemUpdate = (updated: Item) =>
		setTierList((previous) => ({
			...previous,
			items: previous.items.map((item) => (item.id === updated.id ? updated : item)),
		}))

	const handleItemDelete = (itemId: string) =>
		setTierList((previous) => ({
			...previous,
			items: previous.items.filter((item) => item.id !== itemId),
			tiers: previous.tiers.map((tier) => ({ ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) })),
		}))

	const handleTitleUpdate = (title: string) => setTierList((previous) => ({ ...previous, title }))

	const getItemsForTier = (tierId: string) => {
		const tier = tierList.tiers.find((candidate) => candidate.id === tierId)
		if (!tier) return []
		return tier.itemIds
			.map((itemId) => tierList.items.find((item) => item.id === itemId))
			.filter((item): item is Item => item !== undefined)
	}

	const getUnassignedItems = () => {
		const assigned = new Set(tierList.tiers.flatMap((tier) => tier.itemIds))
		return tierList.items.filter((item) => !assigned.has(item.id))
	}

	return (
		<TierListContext
			// eslint-disable-next-line @eslint-react/no-unstable-context-value -- React Compiler memoizes this value; manual useMemo is banned here
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
			onChange={(event) => onChange(event.target.value || undefined)}
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

type EditEntityFormProps = {
	noun: 'Item' | 'Tier'
	entity: Item | Tier
	deleteDisabled?: boolean
	onSave: (fields: Pick<Item, 'color' | 'imageUrl' | 'label'>) => void
	onDelete: () => void
	close: () => void
}

// Tiers and items edit the same three fields, so they share one form
const EditEntityForm = ({ noun, entity, deleteDisabled, onSave, onDelete, close }: EditEntityFormProps) => {
	const [label, setLabel] = useState(entity.label)
	const [color, setColor] = useState(entity.color)
	const [imageUrl, setImageUrl] = useState(entity.imageUrl)

	const isValid = !!label.trim() && (!imageUrl || imageUrlSchema.safeParse(imageUrl).success)
	const idPrefix = noun.toLowerCase()

	return (
		<div className='grid grid-cols-[auto_1fr] gap-4 items-center'>
			<h3 className='font-bold text-lg col-span-full'>Edit {noun}</h3>

			<label htmlFor={`${idPrefix}-label`}>Label</label>
			<input
				id={`${idPrefix}-label`}
				type='text'
				value={label}
				onChange={(event) => setLabel(event.target.value)}
				placeholder={`${noun} label`}
				className='input w-full'
			/>

			<span className='self-start'>Color</span>
			<ColorPicker value={color} onChange={setColor} format='hex' />

			<label htmlFor={`${idPrefix}-image`} className='self-start'>
				Image
			</label>
			<ImageUrlField id={`${idPrefix}-image`} value={imageUrl} onChange={setImageUrl} />

			<div className='flex justify-between col-span-full gap-2'>
				<ConfirmButton
					className='btn btn-error btn-outline'
					disabled={deleteDisabled}
					onConfirm={() => {
						onDelete()
						close()
						toast.success(`${noun} deleted`)
					}}
				>
					<LuTrash2 /> Delete
				</ConfirmButton>
				<div className='flex gap-2'>
					<button type='button' className='btn' onClick={close}>
						Cancel
					</button>
					<button
						type='button'
						className='btn btn-primary'
						disabled={!isValid}
						onClick={() => {
							onSave({ label: label.trim(), color, imageUrl })
							close()
							toast.success(`${noun} updated`)
						}}
					>
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
	const { tierList, handleTierUpdate, handleTierDelete } = useTierList()
	const [open, setOpen] = useState(false)
	return (
		<Modal open={open} onOpenChange={setOpen} trigger={trigger}>
			{/* Mount the form only while open so each edit starts from the tier's current values */}
			{open && (
				<EditEntityForm
					noun='Tier'
					entity={tier}
					deleteDisabled={tierList.tiers.length === 1}
					onSave={(fields) => handleTierUpdate({ ...tier, ...fields })}
					onDelete={() => handleTierDelete(tier.id)}
					close={() => setOpen(false)}
				/>
			)}
		</Modal>
	)
}

const EditTierItemDialog = () => {
	const { editingItem, setEditingItemId, handleItemUpdate, handleItemDelete } = useTierList()
	return (
		<Modal open={!!editingItem} onOpenChange={(open) => !open && setEditingItemId(null)}>
			{editingItem && (
				<EditEntityForm
					key={editingItem.id}
					noun='Item'
					entity={editingItem}
					onSave={(fields) => handleItemUpdate({ ...editingItem, ...fields })}
					onDelete={() => handleItemDelete(editingItem.id)}
					close={() => setEditingItemId(null)}
				/>
			)}
		</Modal>
	)
}

type TierItemProps = {
	item: Item
	isOverlay?: boolean
}

const TierItem = ({ item, isOverlay }: TierItemProps) => {
	const { settings, setEditingItemId } = useTierList()
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

	const style = {
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

type AddTierRowButtonProps = React.ComponentProps<'button'> & {
	position: 'bottom' | 'top'
}

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

	const index = tierList.tiers.findIndex((candidate) => candidate.id === tier.id)
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
					onChange={(event) => setSettings({ ...settings, showLabels: event.target.checked })}
				/>

				<label htmlFor='show-images'>Show Images</label>
				<input
					type='checkbox'
					className='toggle'
					id='show-images'
					checked={settings.showImages}
					onChange={(event) => setSettings({ ...settings, showImages: event.target.checked })}
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
			const blob = new Blob([JSON.stringify(tierList, null, 2)], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `${tierList.title.replace(/\s+/g, '-').toLowerCase()}.json`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
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
	.transform((value, context) => {
		try {
			return JSON.parse(value)
		} catch {
			context.addIssue({ code: 'custom', message: 'Invalid JSON format' })
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
	const issues = result.error?.issues.map(
		(issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`,
	)

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
				<div
					className={cn('relative', isDraggingFile && 'ring-2 ring-primary')}
					onDragOver={(event) => {
						event.preventDefault()
						setIsDraggingFile(true)
					}}
					onDragLeave={(event) => {
						event.preventDefault()
						setIsDraggingFile(false)
					}}
					onDrop={(event) => {
						event.preventDefault()
						setIsDraggingFile(false)
						const file = event.dataTransfer.files[0]
						if (file?.type !== 'application/json') return toast.error('Please drop a valid JSON file.')
						const reader = new FileReader()
						reader.onload = (loadEvent) => setJsonInput(String(loadEvent.target?.result ?? ''))
						reader.readAsText(file)
					}}
				>
					<TextArea
						value={jsonInput}
						onChange={(event) => setJsonInput(event.target.value)}
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
	const lastOverIdRef = useRef<UniqueIdentifier | null>(null)
	const recentlyMovedToNewContainerRef = useRef(false)
	const unassignedItems = getUnassignedItems()

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
	)

	const isTierId = (id: UniqueIdentifier) => tierList.tiers.some((tier) => tier.id === id)
	const isContainerId = (id: UniqueIdentifier) => id === BANK_ID || isTierId(id)

	const getContainerItemIds = (containerId: string) =>
		containerId === BANK_ID
			? unassignedItems.map((item) => item.id)
			: (tierList.tiers.find((tier) => tier.id === containerId)?.itemIds ?? [])

	const findContainerId = (id: UniqueIdentifier) => {
		if (isContainerId(id)) return String(id)
		const tier = tierList.tiers.find((candidate) => candidate.itemIds.includes(String(id)))
		if (tier) return tier.id
		return tierList.items.some((item) => item.id === id) ? BANK_ID : undefined
	}

	// Adapted from dnd-kit's MultipleContainers example: tiers sort against tiers only;
	// items prefer what's under the pointer, and pointing at a container's empty space
	// snaps to the closest item inside it so the whole row is a drop target.
	const collisionDetection: CollisionDetection = (args) => {
		if (isTierId(args.active.id))
			return closestCenter({
				...args,
				droppableContainers: args.droppableContainers.filter((container) => isTierId(container.id)),
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

		if (isContainerId(overId)) {
			const containerItemIds = getContainerItemIds(String(overId))

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
					onChange={(event) => handleTitleUpdate(event.target.value)}
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
				<SortableContext items={tierList.tiers.map((tier) => tier.id)} strategy={rectSortingStrategy}>
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
