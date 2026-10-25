import { Button, Field, Input, Modal, Select } from 'https://esm.sh/@trenaryja/ui'
import mapboxgl from 'https://esm.sh/mapbox-gl'
import React, { useRef, useState } from 'https://esm.sh/react'
import { flushSync } from 'https://esm.sh/react-dom'
import {
	FaCrosshairs,
	FaDownload,
	FaExclamationTriangle,
	FaLock,
	FaLockOpen,
	FaMinus,
	FaPlus,
} from 'https://esm.sh/react-icons/fa'
import {
	BYTES_PER_PIXEL,
	type Format,
	type MapStyle,
	STYLES,
	TILE_SIZE,
	type TileBounds,
	type TileSource,
	isMapStyle,
} from './map-config'
import { defaultFilename, downloadMap } from './map-download'
import { getPosition } from './map-layers'
import { boundsToGrid, chunkGrid, formatBytes, getRatio } from './tile-math'

export type DownloadButtonProps = TileSource & { map: mapboxgl.Map | null; format: Format }

export const DownloadButton = ({ map, bounds, zoom, format, style }: DownloadButtonProps) => {
	const [downloading, setDownloading] = useState(false)
	// Non-null is also what opens the dialog: there is no draft filename unless one is being edited
	const [draft, setDraft] = useState<string | null>(null)
	const filenameRef = useRef<HTMLInputElement>(null)

	const save = async (filename: string) => {
		setDraft(null)
		setDownloading(true)

		await downloadMap({ bounds, zoom, format, style, filename }).finally(() => setDownloading(false))
	}

	return (
		<>
			<Button
				className='btn-square'
				disabled={downloading}
				title='Download'
				onClick={() => {
					// Modal keeps its children mounted while closed, so autoFocus fires before the dialog opens
					flushSync(() => setDraft(defaultFilename({ map, bounds, zoom, format })))
					filenameRef.current?.focus()
				}}
			>
				{downloading ? <span className='loading loading-spinner loading-xs' /> : <FaDownload />}
			</Button>
			<Modal open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
				<form
					className='grid gap-4'
					onSubmit={(event) => {
						event.preventDefault()
						const filename = draft?.trim()
						if (filename) void save(filename)
					}}
				>
					<Field label='Filename'>
						<Input
							ref={filenameRef}
							className='w-full'
							value={draft ?? ''}
							onChange={(event) => setDraft(event.target.value)}
						/>
					</Field>
					<Button type='submit' className='btn-primary' disabled={!draft?.trim()}>
						Download
					</Button>
				</form>
			</Modal>
		</>
	)
}

export const LocateButton = ({ map }: { map: mapboxgl.Map | null }) => (
	<Button
		className='btn-square'
		title='Go to current location'
		onClick={() => void getPosition().then((center) => map?.flyTo({ center }))}
	>
		<FaCrosshairs />
	</Button>
)

export type ZoomControlProps = {
	zoom: number
	locked: boolean
	onToggleLock: () => void
	onStep: (delta: number) => void
}

export const ZoomControl = ({ zoom, locked, onToggleLock, onStep }: ZoomControlProps) => (
	<div className='join'>
		<Button className='btn-square join-item' onClick={() => onStep(-1)}>
			<FaMinus />
		</Button>
		<Button className='join-item gap-1' onClick={onToggleLock}>
			{locked ? <FaLock /> : <FaLockOpen />}
			<span className='font-mono'>{zoom}</span>
		</Button>
		<Button className='btn-square join-item' onClick={() => onStep(1)}>
			<FaPlus />
		</Button>
	</div>
)

export type StyleSelectProps = { value: MapStyle; onChange: (style: MapStyle) => void }

export const StyleSelect = ({ value, onChange }: StyleSelectProps) => (
	<Select className='w-fit' value={value} onChange={(e) => isMapStyle(e.target.value) && onChange(e.target.value)}>
		{Object.entries(STYLES).map(([styleId, label]) => (
			<option key={styleId} value={styleId}>
				{label}
			</option>
		))}
	</Select>
)

export const MapStats = ({ bounds, format }: { bounds: TileBounds; format: Format }) => {
	const { cols, rows } = boundsToGrid(bounds)
	const tileCount = cols * rows
	const { chunksX, chunksY } = chunkGrid(cols, rows)
	const totalChunks = chunksX * chunksY

	return (
		<div className='flex items-center justify-center gap-4 font-mono text-xs opacity-75'>
			{totalChunks === 1 && tileCount > 100 && format === 'png' && (
				<FaExclamationTriangle className='text-warning cursor-help' title='Large map — JPG will export faster' />
			)}
			<span>{getRatio(cols, rows)}</span>
			<span>{tileCount} tiles</span>
			<span>~{formatBytes(tileCount * TILE_SIZE ** 2 * BYTES_PER_PIXEL[format])}</span>
			{totalChunks > 1 && (
				<span>
					{totalChunks} downloads ({chunksX}x{chunksY})
				</span>
			)}
		</div>
	)
}
