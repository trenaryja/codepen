import { cn, Modal, TextArea, toast } from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { LuCircle, LuDownload, LuSettings, LuSquare, LuSquircle, LuUpload } from 'https://esm.sh/react-icons/lu'
import { z } from 'https://esm.sh/zod'
import { tierListSchema } from './schema'
import { useTierList } from './tier-list-context'

const shapes = [
	{ name: 'square', Icon: LuSquare },
	{ name: 'rounded', Icon: LuSquircle },
	{ name: 'circle', Icon: LuCircle },
] as const

export const EditSettingsDialog = () => {
	const { settings, setSettings } = useTierList()

	return (
		<Modal
			trigger={
				<button type='button' className='btn btn-square'>
					<LuSettings />
				</button>
			}
		>
			<h3 className='text-lg font-bold'>Display Settings</h3>

			<div className='grid grid-cols-2 gap-2 py-2'>
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

export const ExportButton = () => {
	const { tierList } = useTierList()

	const handleExport = () => {
		try {
			const blob = new Blob([JSON.stringify(tierList, null, 2)], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `${tierList.title.replaceAll(/\s+/g, '-').toLowerCase()}.json`
			document.body.append(link)
			link.click()
			link.remove()
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
			const parsed: unknown = JSON.parse(value)
			return parsed
		} catch {
			context.addIssue({ code: 'custom', message: 'Invalid JSON format' })
			return z.NEVER
		}
	})
	.pipe(tierListSchema)

export const ImportDialog = () => {
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
			<h3 className='text-lg font-bold'>Import Tier List</h3>
			<p className='py-2 text-sm opacity-70'>Paste your tier list JSON below or drag and drop a JSON file.</p>

			<div className='mt-2 space-y-4'>
				<div className={cn('relative', isDraggingFile && 'ring-primary ring-2')}>
					<TextArea
						value={jsonInput}
						onChange={(event) => setJsonInput(event.target.value)}
						className='max-h-[60ch] min-h-32 w-full font-mono text-xs'
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
							void file.text().then(setJsonInput)
						}}
					/>
					{isDraggingFile && (
						<div className='bg-primary/10 text-primary pointer-events-none absolute inset-0 flex items-center justify-center rounded-md font-medium'>
							<p>Drop JSON file here</p>
						</div>
					)}
				</div>

				{jsonInput.length > 0 && issues && (
					<div className='alert alert-error p-3 text-sm'>
						<div>
							<strong className='font-bold'>Import Errors:</strong>
							<ul className='mt-1 list-inside list-disc'>
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
