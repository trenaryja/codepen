import { useHotkeys } from 'https://esm.sh/@mantine/hooks'
import { ImageRestriction } from 'https://esm.sh/advanced-cropper'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import type { CropperRef, CropperState } from 'https://esm.sh/react-advanced-cropper'
import { Cropper } from 'https://esm.sh/react-advanced-cropper'
import * as R from 'https://esm.sh/remeda'
import type { ProgressInfo } from './background-removal'
import { nextFrame } from './canvas-utils'
import { EraserCanvas } from './eraser'
import { imageToBlobUrl } from './image-export'
import type { Format, ModelSize } from './types'
import { FORMAT_META, MODEL_META } from './types'

export function Elapsed({ running }: { running: boolean }) {
	const [seconds, setSeconds] = useState(0)
	const startRef = useRef(0)

	// Reset the counter as soon as `running` flips, not a render later
	const [prevRunning, setPrevRunning] = useState(running)

	if (prevRunning !== running) {
		setPrevRunning(running)
		setSeconds(0)
	}

	useEffect(() => {
		if (!running) return
		startRef.current = Date.now()
		const id = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
		return () => clearInterval(id)
	}, [running])

	if (seconds < 2) return null
	return <span className='text-xs opacity-40'>{seconds}s</span>
}

export function DropZone({
	inputRef,
	onFile,
}: {
	inputRef: React.RefObject<HTMLInputElement | null>
	onFile: (file: File) => void
}) {
	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.currentTarget.classList.remove('border-primary', 'bg-primary/5')
		const file = e.dataTransfer.files[0]
		if (file) onFile(file)
	}

	return (
		<button
			type='button'
			onDrop={handleDrop}
			onDragOver={(e) => {
				e.preventDefault()
				e.currentTarget.classList.add('border-primary', 'bg-primary/5')
			}}
			onDragLeave={(e) => e.currentTarget.classList.remove('border-primary', 'bg-primary/5')}
			onClick={() => inputRef.current?.click()}
			className='m-4 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-current/20 transition-all duration-200 hover:border-current/50'
		>
			<p className='text-xl font-medium opacity-70'>Drop an image here or click to select</p>
			<p className='mt-2 text-sm opacity-40'>Accepts any image your browser supports</p>
			<input
				ref={inputRef}
				type='file'
				accept='image/*,.heic'
				className='hidden'
				onChange={(e) => {
					const file = e.target.files?.[0]
					if (file) onFile(file)
				}}
			/>
		</button>
	)
}

export function LoadingStage({ label }: { label: string }) {
	return (
		<div className='flex flex-1 flex-col items-center justify-center gap-4'>
			<span className='loading loading-spinner loading-lg' />
			<p className='text-sm opacity-70'>{label}</p>
		</div>
	)
}

export type CropStageProps = {
	imageUrl: string
	model: ModelSize
	onModelChange: (model: ModelSize) => void
	savedStateRef: React.RefObject<CropperState | null>
	onStatus: (label: string) => void
	onCropped: (blob: Blob, previewUrl: string) => Promise<void>
	onError: (error: unknown) => void
	onCancel: () => void
}

export function CropStage({
	imageUrl,
	model,
	onModelChange,
	savedStateRef,
	onStatus,
	onCropped,
	onError,
	onCancel,
}: CropStageProps) {
	const cropperRef = useRef<CropperRef>(null)

	const cropAndRemove = async () => {
		const canvas = cropperRef.current?.getCanvas({ imageSmoothingQuality: 'high' })
		if (!canvas) return

		savedStateRef.current = cropperRef.current?.getState() ?? null
		onStatus('Preparing your crop…')
		await nextFrame()

		const croppedBlob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((blob: Blob | null) => {
				if (blob) resolve(blob)
				else reject(new Error('Canvas export failed'))
			}, 'image/png')
		})
		await onCropped(croppedBlob, URL.createObjectURL(croppedBlob))
	}

	const skipCrop = async () => {
		onStatus('Getting ready…')
		await nextFrame()
		await onCropped(await imageToBlobUrl(imageUrl), imageUrl)
	}

	const restoreSavedState = () => {
		if (savedStateRef.current && cropperRef.current) cropperRef.current.setState(savedStateRef.current)
	}

	const resetCrop = () => {
		cropperRef.current?.reset()
		savedStateRef.current = null
	}

	useHotkeys([
		['Enter', () => void cropAndRemove().catch(onError)],
		['Escape', onCancel],
	])

	return (
		<>
			<div className='relative min-h-0 flex-1'>
				<Cropper
					ref={cropperRef}
					src={imageUrl}
					style={{ width: '100%', height: '100%' }}
					stencilProps={{ movable: true, resizable: true, lines: true, handlers: true, grid: true }}
					onReady={restoreSavedState}
					{...{
						scaleImage: { wheel: { ratio: 0.1 }, touch: true },
						moveImage: { mouse: true, touch: true },
						imageRestriction: ImageRestriction.none,
						transitions: true,
					}}
				/>
			</div>
			<div className='bg-base-200/80 flex items-center justify-between gap-3 border-t border-current/10 px-4 py-3 backdrop-blur-sm'>
				<div className='flex items-center gap-2'>
					<button type='button' className='btn btn-sm btn-outline' onClick={() => cropperRef.current?.zoomImage(0.7)}>
						-
					</button>
					<button type='button' className='btn btn-sm btn-outline' onClick={() => cropperRef.current?.zoomImage(1.4)}>
						+
					</button>
					<span className='ml-1 text-xs opacity-40'>or scroll</span>
					<button type='button' className='btn btn-sm btn-ghost' onClick={resetCrop}>
						Reset
					</button>
					<select
						className='select select-sm select-bordered'
						value={model}
						onChange={(e) => {
							const size = R.keys(MODEL_META).find((key) => key === e.target.value)
							if (size) onModelChange(size)
						}}
					>
						{Object.entries(MODEL_META).map(([key, { label, size }]) => (
							<option key={key} value={key}>
								{label} ({size})
							</option>
						))}
					</select>
				</div>
				<p className='hidden text-xs opacity-50 sm:block'>Drag edges to resize · Enter to confirm · Esc to cancel</p>
				<div className='flex gap-2'>
					<button type='button' className='btn btn-sm btn-ghost' onClick={onCancel}>
						Cancel
					</button>
					<button type='button' className='btn btn-sm btn-outline' onClick={() => void skipCrop().catch(onError)}>
						Skip Crop
					</button>
					<button type='button' className='btn btn-sm btn-primary' onClick={() => void cropAndRemove().catch(onError)}>
						Crop & Remove Background
					</button>
				</div>
			</div>
		</>
	)
}

export function ProcessingStage({
	croppedUrl,
	progressInfo,
}: {
	croppedUrl: string | null
	progressInfo: ProgressInfo
}) {
	return (
		<div className='flex flex-1 flex-col items-center justify-center gap-5 p-6'>
			{croppedUrl && <img src={croppedUrl} alt='Cropped' className='max-h-[40vh] max-w-lg rounded-lg opacity-30' />}
			<div className='flex w-full max-w-xs flex-col items-center gap-3'>
				{progressInfo.percent == null ? (
					<progress className='progress progress-primary w-full' />
				) : (
					<div className='bg-base-300 h-2 w-full overflow-hidden rounded-full'>
						<div
							className='bg-primary h-full rounded-full transition-all duration-300'
							style={{ width: `${progressInfo.percent}%` }}
						/>
					</div>
				)}
				<div className='flex items-center gap-2'>
					<p className='text-sm opacity-70'>
						{progressInfo.label}
						{progressInfo.percent == null ? '' : ` — ${progressInfo.percent}%`}
					</p>
					<Elapsed running />
				</div>
			</div>
		</div>
	)
}

export function ErrorStage({ message, onRetry }: { message: string | null; onRetry: () => void }) {
	return (
		<div className='flex flex-1 flex-col items-center justify-center gap-4 p-6'>
			<p className='text-error text-lg font-medium'>Something went wrong</p>
			<p className='max-w-md text-center text-sm opacity-70'>{message}</p>
			<button type='button' className='btn btn-sm btn-primary' onClick={onRetry}>
				Try Again
			</button>
		</div>
	)
}

export type ExportControls = {
	onBackToCrop: () => void
	format: Format
	onFormatChange: (format: Format) => void
	bgColor: string
	onBgColorChange: (color: string) => void
	onDownload: () => void
	onReset: () => void
}

export type ResultToolbarProps = ExportControls & {
	showOriginal: boolean
	onToggleOriginal: () => void
	onEdit: () => void
}

export function ResultToolbar(props: ResultToolbarProps) {
	const { showOriginal, format, bgColor } = props

	return (
		<div className='bg-base-200/80 flex flex-wrap items-center justify-center gap-3 border-t border-current/10 px-4 py-3 backdrop-blur-sm'>
			<button type='button' className='btn btn-sm btn-outline' onClick={props.onToggleOriginal}>
				{showOriginal ? 'Show Result' : 'Show Original'}
			</button>
			<button type='button' className='btn btn-sm btn-outline' onClick={props.onEdit}>
				Touch Up
			</button>
			<button type='button' className='btn btn-sm btn-outline' onClick={props.onBackToCrop}>
				Re-crop
			</button>
			<select
				className='select select-sm select-bordered'
				value={format}
				onChange={(e) => {
					const mime = R.keys(FORMAT_META).find((key) => key === e.target.value)
					if (mime) props.onFormatChange(mime)
				}}
			>
				{Object.entries(FORMAT_META).map(([mime, { label, transparency }]) => (
					<option key={mime} value={mime}>
						{label}
						{transparency ? '' : ' (no transparency)'}
					</option>
				))}
			</select>
			{!FORMAT_META[format].transparency && (
				<input
					type='color'
					className='h-8 w-8 cursor-pointer rounded border border-current/20'
					value={bgColor}
					onChange={(e) => props.onBgColorChange(e.target.value)}
					title='Background fill color'
				/>
			)}
			<button type='button' className='btn btn-sm btn-primary' onClick={props.onDownload}>
				Download {FORMAT_META[format].label}
			</button>
			<button type='button' className='btn btn-sm btn-ghost' onClick={props.onReset}>
				New Image
			</button>
		</div>
	)
}

export type ResultStageProps = ExportControls & {
	resultUrl: string
	editedUrl: string | null
	croppedUrl: string | null
	onEditUpdate: (url: string) => void
}

export function ResultStage({ resultUrl, editedUrl, croppedUrl, onEditUpdate, ...toolbar }: ResultStageProps) {
	const [showOriginal, setShowOriginal] = useState(false)
	const [editing, setEditing] = useState(false)
	const activeResultUrl = editedUrl ?? resultUrl

	return (
		<>
			{editing && croppedUrl ? (
				<EraserCanvas key={resultUrl} resultUrl={activeResultUrl} croppedUrl={croppedUrl} onUpdate={onEditUpdate} />
			) : (
				<>
					<div className='flex min-h-0 flex-1 items-center justify-center p-4'>
						<img
							src={showOriginal ? (croppedUrl ?? undefined) : activeResultUrl}
							alt={showOriginal ? 'Cropped original' : 'Background removed'}
							className={`max-h-full max-w-full rounded-lg object-contain ${showOriginal ? '' : 'checkerboard'}`}
						/>
					</div>
					<ResultToolbar
						{...toolbar}
						showOriginal={showOriginal}
						onToggleOriginal={() => setShowOriginal(!showOriginal)}
						onEdit={() => setEditing(true)}
					/>
				</>
			)}
			{editing && (
				<div className='bg-base-200/80 flex justify-center gap-2 border-t border-current/10 px-4 py-2'>
					<button type='button' className='btn btn-sm btn-primary' onClick={() => setEditing(false)}>
						Done Editing
					</button>
				</div>
			)}
		</>
	)
}
