import { rectSortingStrategy, SortableContext, useSortable } from 'https://esm.sh/@dnd-kit/sortable'
import { CSS } from 'https://esm.sh/@dnd-kit/utilities'
import { cn, ColorPicker, ConfirmButton, isDark, Modal, toast } from 'https://esm.sh/@trenaryja/ui'
import type { ReactElement } from 'https://esm.sh/react'
import React, { useState } from 'https://esm.sh/react'
import { LuPlus, LuTrash2 } from 'https://esm.sh/react-icons/lu'
import * as R from 'https://esm.sh/remeda'
import type { Item, Tier, TierListSettings } from './schema'
import { imageUrlSchema } from './schema'
import { useTierList } from './tier-list-context'

export const shapeClasses = {
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
			<img src={value} alt='Preview' className='rounded-box size-20 object-cover' />
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

const EditEntityForm = ({ noun, entity, deleteDisabled, onSave, onDelete, close }: EditEntityFormProps) => {
	const [label, setLabel] = useState(entity.label)
	const [color, setColor] = useState(entity.color)
	const [imageUrl, setImageUrl] = useState(entity.imageUrl)

	const isValid = !!label.trim() && (!imageUrl || imageUrlSchema.safeParse(imageUrl).success)
	const idPrefix = noun.toLowerCase()

	return (
		<div className='grid grid-cols-[auto_1fr] items-center gap-4'>
			<h3 className='col-span-full text-lg font-bold'>Edit {noun}</h3>

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

			<div className='col-span-full flex justify-between gap-2'>
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

export const EditTierItemDialog = () => {
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

export const TierItem = ({ item, isOverlay }: TierItemProps) => {
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
				'btn relative grid cursor-grab touch-none place-items-center gap-1 overflow-hidden bg-cover bg-center',
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
			'absolute left-1/4 z-10 grid w-1/2 place-items-center transition-opacity sm:opacity-0 sm:hover:opacity-100',
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

export const TierRow = ({ tier, isOverlay }: TierRowProps) => {
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
			className={cn('bg-base-100 relative flex border border-current/10', isDragging && 'opacity-25')}
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
							'grid cursor-grab touch-none place-items-center',
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
				<div className='flex flex-1 flex-wrap gap-2 p-2'>
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
