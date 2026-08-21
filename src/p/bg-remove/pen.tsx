import { useHotkeys } from 'https://esm.sh/@mantine/hooks'
import { loadImage, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import heic2any from 'https://esm.sh/heic2any'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import type { CropperRef, CropperState } from 'https://esm.sh/react-advanced-cropper'
import { Cropper } from 'https://esm.sh/react-advanced-cropper'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { ImageRestriction } from 'https://esm.sh/advanced-cropper'

type Stage = 'cropping' | 'done' | 'error' | 'idle' | 'loading' | 'processing'

type Format = 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp'

type ModelSize = 'large' | 'medium' | 'small'

type BrushMode = 'erase' | 'restore'

type Point = { x: number; y: number }

const FORMAT_META: Record<Format, { ext: string; label: string; transparency: boolean }> = {
	'image/png': { ext: 'png', label: 'PNG', transparency: true },
	'image/webp': { ext: 'webp', label: 'WebP', transparency: true },
	'image/jpeg': { ext: 'jpg', label: 'JPEG', transparency: false },
	'image/avif': { ext: 'avif', label: 'AVIF', transparency: true },
}

const MODEL_META: Record<ModelSize, { label: string; size: string }> = {
	small: { label: 'Fast', size: '~42 MB' },
	medium: { label: 'Balanced', size: '~84 MB' },
	large: { label: 'Best quality', size: '~168 MB' },
}

const nextFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	})

const createCanvas = (width: number, height: number) => {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

const revokeUrls = (urls: (string | null)[]) => {
	for (const url of urls) if (url) URL.revokeObjectURL(url)
}

const isHeicFile = (file: File) => file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')

// The host is its own constant so the string `https://esm.sh/...` never appears in this file: Vite's
// esm-sh-to-local plugin rewrites any such literal to a bare specifier, which a blob worker can't resolve.
const ESM_HOST = 'esm.sh'
const ESM_SH = `https://${ESM_HOST}/`

function createBgWorker(model: ModelSize) {
	const code = `
self.onmessage = async (e) => {
	try {
		const { removeBackground } = await import("${ESM_SH}@imgly/background-removal");
		const result = await removeBackground(e.data, {
			model: "${model}",
			output: { quality: 1 },
			progress: (key, current, total) => {
				self.postMessage({ type: "progress", key, current, total });
			},
		});
		self.postMessage({ type: "done", blob: result });
	} catch (err) {
		self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
	}
};
`
	const blob = new Blob([code], { type: 'application/javascript' })
	return new Worker(URL.createObjectURL(blob))
}

async function normalizeFile(file: File) {
	if (isHeicFile(file)) {
		const converted = await heic2any({ blob: file, toType: 'image/png' })
		const blob = Array.isArray(converted) ? converted[0]! : converted
		return URL.createObjectURL(blob)
	}

	return URL.createObjectURL(file)
}

type ProgressInfo = { label: string; percent: number | null }

const PHASE_LABELS: Record<string, string> = {
	'fetch:model': 'Preparing the AI (first time takes a moment)…',
	'compute:inference': 'Finding the subject in your image…',
	'compute:postprocess': 'Cleaning up the edges…',
}

const DETERMINISTIC_PHASES = new Set(['fetch:model'])

function phaseLabel(key: string) {
	if (key in PHASE_LABELS) return PHASE_LABELS[key]!
	if (key.startsWith('fetch:')) return 'Downloading resources…'
	if (key.startsWith('compute:')) return 'Processing…'
	return 'Working…'
}

function runBgRemoval(blob: Blob, model: ModelSize, onProgress: (info: ProgressInfo) => void): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const worker = createBgWorker(model)

		worker.onmessage = (e: MessageEvent) => {
			const { type } = e.data

			if (type === 'progress') {
				const { key, current, total } = e.data
				const percent = DETERMINISTIC_PHASES.has(key) && total > 0 ? Math.round((current / total) * 100) : null
				onProgress({ label: phaseLabel(key), percent })
			} else if (type === 'done') {
				resolve(e.data.blob)
				worker.terminate()
			} else if (type === 'error') {
				reject(new Error(e.data.message))
				worker.terminate()
			}
		}

		worker.onerror = (err) => {
			reject(err)
			worker.terminate()
		}

		worker.postMessage(blob)
	})
}

function imageToBlobUrl(src: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image()

		img.onload = () => {
			const canvas = createCanvas(img.naturalWidth, img.naturalHeight)
			canvas.getContext('2d')!.drawImage(img, 0, 0)
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png')
		}

		img.onerror = reject
		img.src = src
	})
}

async function renderForDownload({ url, format, bgColor }: { url: string; format: Format; bgColor: string }) {
	const image = await loadImage(url)
	const canvas = createCanvas(image.naturalWidth, image.naturalHeight)
	const context = canvas.getContext('2d')!

	if (!FORMAT_META[format].transparency) {
		context.fillStyle = bgColor
		context.fillRect(0, 0, canvas.width, canvas.height)
	}

	context.drawImage(image, 0, 0)
	return new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, format, format === 'image/jpeg' ? 0.92 : undefined)
	})
}

/** Returns the object URL; the caller owns revoking it. */
function triggerDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	return url
}

type Dab = { context: CanvasRenderingContext2D; x: number; y: number; radius: number; hardness: number }

function createBrushPattern({ context, x, y, radius, hardness }: Dab): CanvasGradient {
	const coreRadius = radius * hardness * hardness // quadratic curve for more dramatic softness range
	const gradient = context.createRadialGradient(x, y, coreRadius, x, y, radius)
	gradient.addColorStop(0, 'rgba(0,0,0,1)')
	gradient.addColorStop(0.3, `rgba(0,0,0,${(0.7 + hardness * 0.3).toFixed(2)})`)
	gradient.addColorStop(0.6, `rgba(0,0,0,${(0.3 + hardness * 0.4).toFixed(2)})`)
	gradient.addColorStop(0.85, `rgba(0,0,0,${(0.08 + hardness * 0.2).toFixed(2)})`)
	gradient.addColorStop(1, 'rgba(0,0,0,0)')
	return gradient
}

function fillDab({ context, x, y, radius, hardness }: Dab) {
	if (hardness >= 0.95) {
		context.fillStyle = '#000'
		context.beginPath()
		context.arc(x, y, radius, 0, Math.PI * 2)
		context.fill()
		return
	}

	context.fillStyle = createBrushPattern({ context, x, y, radius, hardness })
	context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

const eraseDab = ({ context, x, y, radius, hardness }: Dab) => {
	context.save()
	context.globalCompositeOperation = 'destination-out'
	fillDab({ context, x, y, radius, hardness })
	context.restore()
}

type RestoreDab = Dab & {
	canvas: HTMLCanvasElement
	scratchCanvas: HTMLCanvasElement
	croppedImage: HTMLImageElement
}

function restoreDab({ context, canvas, scratchCanvas, croppedImage, x, y, radius, hardness }: RestoreDab) {
	const scratchContext = scratchCanvas.getContext('2d')!
	const brushSize = radius * 2
	const left = Math.max(0, Math.floor(x - radius))
	const top = Math.max(0, Math.floor(y - radius))
	const width = Math.min(canvas.width - left, Math.ceil(brushSize + 2))
	const height = Math.min(canvas.height - top, Math.ceil(brushSize + 2))

	scratchContext.clearRect(left, top, width, height)
	scratchContext.save()
	scratchContext.beginPath()
	scratchContext.rect(left, top, width, height)
	scratchContext.clip()
	scratchContext.drawImage(croppedImage, 0, 0)
	scratchContext.restore()

	scratchContext.globalCompositeOperation = 'destination-in'
	fillDab({ context: scratchContext, x, y, radius, hardness })
	scratchContext.globalCompositeOperation = 'source-over'

	context.save()
	context.globalCompositeOperation = 'source-over'
	context.drawImage(scratchCanvas, left, top, width, height, left, top, width, height)
	context.restore()
}

type StrokeSettings = {
	canvas: HTMLCanvasElement
	scratchCanvas: HTMLCanvasElement
	croppedImage: HTMLImageElement
	brushSize: number
	hardness: number
	mode: BrushMode
}

function paintStroke(from: Point, to: Point, settings: StrokeSettings) {
	const { canvas, scratchCanvas, croppedImage, brushSize, hardness, mode } = settings
	const context = canvas.getContext('2d')!
	const radius = brushSize / 2
	const distance = Math.hypot(to.x - from.x, to.y - from.y)
	const steps = Math.max(1, Math.ceil(distance / (brushSize * 0.25)))

	for (let i = 0; i <= steps; i++) {
		const t = i / steps
		const x = from.x + (to.x - from.x) * t
		const y = from.y + (to.y - from.y) * t

		if (mode === 'erase') eraseDab({ context, x, y, radius, hardness })
		else restoreDab({ context, canvas, scratchCanvas, croppedImage, x, y, radius, hardness })
	}
}

function primeCanvas(canvas: HTMLCanvasElement, resultImage: HTMLImageElement) {
	canvas.width = resultImage.naturalWidth
	canvas.height = resultImage.naturalHeight
	canvas.getContext('2d')!.drawImage(resultImage, 0, 0)
	return createCanvas(canvas.width, canvas.height)
}

function canvasPointFromEvent(canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) {
	const rect = canvas.getBoundingClientRect()
	const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX
	const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY
	return {
		x: ((clientX - rect.left) / rect.width) * canvas.width,
		y: ((clientY - rect.top) / rect.height) * canvas.height,
	}
}

function useCanvasViewport() {
	const [zoom, setZoom] = useState(1)
	const [pan, setPan] = useState({ x: 0, y: 0 })
	const panningRef = useRef(false)
	const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault()
		const delta = e.deltaY > 0 ? 0.9 : 1.1
		setZoom((current) => Math.min(20, Math.max(0.5, current * delta)))
	}

	const startPan = (clientX: number, clientY: number) => {
		panningRef.current = true
		panStartRef.current = { x: clientX, y: clientY, panX: pan.x, panY: pan.y }
	}

	const movePan = (clientX: number, clientY: number) => {
		setPan({
			x: panStartRef.current.panX + (clientX - panStartRef.current.x),
			y: panStartRef.current.panY + (clientY - panStartRef.current.y),
		})
	}

	/** Ends a pan if one was in flight; the boolean says whether it swallowed the gesture. */
	const endPan = () => {
		if (!panningRef.current) return false
		panningRef.current = false
		return true
	}

	const reset = () => {
		setZoom(1)
		setPan({ x: 0, y: 0 })
	}

	return { zoom, pan, panningRef, handleWheel, startPan, movePan, endPan, reset }
}

function Elapsed({ running }: { running: boolean }) {
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

type EraserSurfaceProps = {
	canvasRef: React.RefObject<HTMLCanvasElement | null>
	brushSize: number
	mode: BrushMode
	zoom: number
	pan: Point
	onWheel: (e: React.WheelEvent) => void
	onStart: (e: React.MouseEvent | React.TouchEvent) => void
	onMove: (e: React.MouseEvent | React.TouchEvent) => void
	onEnd: () => void
}

function EraserSurface({ canvasRef, brushSize, mode, zoom, pan, onWheel, onStart, onMove, onEnd }: EraserSurfaceProps) {
	const cursorRef = useRef<HTMLDivElement>(null)
	const [cursorVisible, setCursorVisible] = useState(false)
	const cursorBorder = mode === 'erase' ? 'border-red-400' : 'border-green-400'

	const trackCursor = (e: React.MouseEvent) => {
		const cursor = cursorRef.current
		if (!cursor) return
		cursor.style.left = `${e.clientX}px`
		cursor.style.top = `${e.clientY}px`
	}

	// getBoundingClientRect includes the canvas's CSS `scale(zoom)`, so zoom must not be a factor here —
	// it and `cursorVisible` (first hover can precede priming) are deps only to retrigger the read.
	useEffect(() => {
		const cursor = cursorRef.current
		const canvas = canvasRef.current
		if (!cursor || !canvas) return
		const size = (brushSize / canvas.width) * canvas.getBoundingClientRect().width
		cursor.style.width = `${size}px`
		cursor.style.height = `${size}px`
	}, [brushSize, zoom, cursorVisible, canvasRef])

	return (
		<>
			<div
				ref={cursorRef}
				className={`fixed pointer-events-none rounded-full border-2 ${cursorBorder} z-50 transition-[border-color] duration-150`}
				style={{
					display: cursorVisible ? 'block' : 'none',
					boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
					transform: 'translate(-50%, -50%)',
				}}
			/>
			<div className='flex-1 min-h-0 flex items-center justify-center overflow-hidden' onWheel={onWheel}>
				<canvas
					ref={canvasRef}
					className='max-w-full max-h-full rounded-lg checkerboard'
					style={{
						cursor: 'none',
						touchAction: 'none',
						transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
						transformOrigin: 'center center',
					}}
					onMouseDown={onStart}
					onMouseMove={(e) => {
						trackCursor(e)
						onMove(e)
					}}
					onMouseUp={onEnd}
					onMouseLeave={() => {
						setCursorVisible(false)
						onEnd()
					}}
					onMouseEnter={(e) => {
						setCursorVisible(true)
						trackCursor(e)
					}}
					onTouchStart={onStart}
					onTouchMove={onMove}
					onTouchEnd={onEnd}
				/>
			</div>
		</>
	)
}

type EraserToolbarProps = {
	mode: BrushMode
	onModeChange: (mode: BrushMode) => void
	brushSize: number
	onBrushSizeChange: (size: number) => void
	hardness: number
	onHardnessChange: (hardness: number) => void
	zoom: number
	onResetView: () => void
	onUndo: () => void
}

function EraserToolbar(props: EraserToolbarProps) {
	const { mode, onModeChange, brushSize, onBrushSizeChange, hardness, onHardnessChange, zoom } = props

	return (
		<div className='flex items-center justify-center gap-4 px-4 py-3 bg-base-200/80 backdrop-blur-sm border-t border-current/10 flex-wrap'>
			<div className='flex gap-1'>
				<button
					type='button'
					className={`btn btn-sm ${mode === 'erase' ? 'btn-error' : 'btn-outline'}`}
					onClick={() => onModeChange('erase')}
				>
					Erase
				</button>
				<button
					type='button'
					className={`btn btn-sm ${mode === 'restore' ? 'btn-success' : 'btn-outline'}`}
					onClick={() => onModeChange('restore')}
				>
					Restore
				</button>
			</div>
			<div className='flex items-center gap-2'>
				<span className='text-xs opacity-50'>Size</span>
				<input
					type='range'
					className='range range-xs w-20'
					min={5}
					max={150}
					value={brushSize}
					onChange={(e) => onBrushSizeChange(Number(e.target.value))}
				/>
			</div>
			<div className='flex items-center gap-2'>
				<span className='text-xs opacity-50'>Softness</span>
				<input
					type='range'
					className='range range-xs w-20'
					min={0}
					max={100}
					value={Math.round((1 - hardness) * 100)}
					onChange={(e) => onHardnessChange(1 - Number(e.target.value) / 100)}
				/>
			</div>
			<div className='flex items-center gap-1'>
				<span className='text-xs opacity-50'>{Math.round(zoom * 100)}%</span>
				{zoom !== 1 && (
					<button type='button' className='btn btn-xs btn-ghost' onClick={props.onResetView}>
						Fit
					</button>
				)}
			</div>
			<button type='button' className='btn btn-sm btn-ghost' onClick={props.onUndo}>
				Undo
			</button>
			<span className='text-xs opacity-40 hidden sm:inline'>[ ] brush size · scroll to zoom · middle-click to pan</span>
		</div>
	)
}

function EraserCanvas({
	resultUrl,
	croppedUrl,
	onUpdate,
}: {
	resultUrl: string
	croppedUrl: string
	onUpdate: (url: string) => void
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const croppedImageRef = useRef<HTMLImageElement | null>(null)
	// Reusable temp canvas for restore brush (avoids creating one per stroke step)
	const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null)
	const paintingRef = useRef(false)
	const lastPointRef = useRef<Point | null>(null)
	const undoStackRef = useRef<ImageData[]>([])
	const [brushSize, setBrushSize] = useState(20)
	const [hardness, setHardness] = useState(0.7)
	const [mode, setMode] = useState<BrushMode>('erase')
	const [ready, setReady] = useState(false)
	const viewport = useCanvasViewport()
	// Every stroke round-trips out through `onUpdate` and back in as `resultUrl`; re-priming from that
	// would wipe strokes still in flight. A genuinely new source remounts this via ResultStage's `key`.
	const [seedUrl] = useState(resultUrl)

	useEffect(() => {
		let cancelled = false
		Promise.all([loadImage(seedUrl), loadImage(croppedUrl)])
			.then(([resultImage, croppedImage]) => {
				if (cancelled) return
				croppedImageRef.current = croppedImage
				scratchCanvasRef.current = primeCanvas(canvasRef.current!, resultImage)
				setReady(true)
			})
			.catch((error) => console.error('Touch-up canvas could not load its source images:', error))

		return () => {
			cancelled = true
		}
	}, [seedUrl, croppedUrl])

	const saveUndo = () => {
		const canvas = canvasRef.current!
		undoStackRef.current.push(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height))
		if (undoStackRef.current.length > 30) undoStackRef.current.shift()
	}

	const emitUpdate = () => {
		canvasRef.current!.toBlob((blob) => {
			if (blob) onUpdate(URL.createObjectURL(blob))
		}, 'image/png')
	}

	const undo = () => {
		const data = undoStackRef.current.pop()
		if (!data) return
		canvasRef.current!.getContext('2d')!.putImageData(data, 0, 0)
		emitUpdate()
	}

	const stroke = (from: Point, to: Point) =>
		paintStroke(from, to, {
			canvas: canvasRef.current!,
			scratchCanvas: scratchCanvasRef.current!,
			croppedImage: croppedImageRef.current!,
			brushSize,
			hardness,
			mode,
		})

	const startPaint = (e: React.MouseEvent | React.TouchEvent) => {
		if (!ready) return

		if ('button' in e && e.button === 1) {
			e.preventDefault()
			viewport.startPan(e.clientX, e.clientY)
			return
		}

		e.preventDefault()
		saveUndo()
		paintingRef.current = true
		const point = canvasPointFromEvent(canvasRef.current!, e)
		lastPointRef.current = point
		stroke(point, point)
	}

	const movePaint = (e: React.MouseEvent | React.TouchEvent) => {
		if (viewport.panningRef.current && 'clientX' in e) {
			viewport.movePan(e.clientX, e.clientY)
			return
		}

		if (!paintingRef.current || !lastPointRef.current) return
		e.preventDefault()
		const point = canvasPointFromEvent(canvasRef.current!, e)
		stroke(lastPointRef.current, point)
		lastPointRef.current = point
	}

	const endPaint = () => {
		if (viewport.endPan()) return
		if (!paintingRef.current) return
		paintingRef.current = false
		lastPointRef.current = null
		emitUpdate()
	}

	useHotkeys([
		['mod+Z', undo],
		['0', viewport.reset],
		['[', () => setBrushSize((size) => Math.max(5, size - 5))],
		[']', () => setBrushSize((size) => Math.min(150, size + 5))],
	])

	return (
		<div className='flex flex-col h-full'>
			<EraserSurface
				canvasRef={canvasRef}
				brushSize={brushSize}
				mode={mode}
				zoom={viewport.zoom}
				pan={viewport.pan}
				onWheel={viewport.handleWheel}
				onStart={startPaint}
				onMove={movePaint}
				onEnd={endPaint}
			/>
			<EraserToolbar
				mode={mode}
				onModeChange={setMode}
				brushSize={brushSize}
				onBrushSizeChange={setBrushSize}
				hardness={hardness}
				onHardnessChange={setHardness}
				zoom={viewport.zoom}
				onResetView={viewport.reset}
				onUndo={undo}
			/>
		</div>
	)
}

function DropZone({
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
			className='flex-1 m-4 border-2 border-dashed border-current/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 hover:border-current/50'
		>
			<p className='text-xl font-medium opacity-70'>Drop an image here or click to select</p>
			<p className='text-sm opacity-40 mt-2'>Accepts any image your browser supports</p>
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

function LoadingStage({ label }: { label: string }) {
	return (
		<div className='flex-1 flex flex-col items-center justify-center gap-4'>
			<span className='loading loading-spinner loading-lg' />
			<p className='text-sm opacity-70'>{label}</p>
		</div>
	)
}

type CropStageProps = {
	imageUrl: string
	model: ModelSize
	onModelChange: (model: ModelSize) => void
	savedStateRef: React.RefObject<CropperState | null>
	onStatus: (label: string) => void
	onCropped: (blob: Blob, previewUrl: string) => Promise<void>
	onCancel: () => void
}

function CropStage({ imageUrl, model, onModelChange, savedStateRef, onStatus, onCropped, onCancel }: CropStageProps) {
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
		['Enter', cropAndRemove],
		['Escape', onCancel],
	])

	return (
		<>
			<div className='flex-1 min-h-0 relative'>
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
			<div className='flex items-center justify-between gap-3 px-4 py-3 bg-base-200/80 backdrop-blur-sm border-t border-current/10'>
				<div className='flex gap-2 items-center'>
					<button type='button' className='btn btn-sm btn-outline' onClick={() => cropperRef.current?.zoomImage(0.7)}>
						-
					</button>
					<button type='button' className='btn btn-sm btn-outline' onClick={() => cropperRef.current?.zoomImage(1.4)}>
						+
					</button>
					<span className='text-xs opacity-40 ml-1'>or scroll</span>
					<button type='button' className='btn btn-sm btn-ghost' onClick={resetCrop}>
						Reset
					</button>
					<select
						className='select select-sm select-bordered'
						value={model}
						onChange={(e) => onModelChange(e.target.value as ModelSize)}
					>
						{Object.entries(MODEL_META).map(([key, { label, size }]) => (
							<option key={key} value={key}>
								{label} ({size})
							</option>
						))}
					</select>
				</div>
				<p className='text-xs opacity-50 hidden sm:block'>Drag edges to resize · Enter to confirm · Esc to cancel</p>
				<div className='flex gap-2'>
					<button type='button' className='btn btn-sm btn-ghost' onClick={onCancel}>
						Cancel
					</button>
					<button type='button' className='btn btn-sm btn-outline' onClick={skipCrop}>
						Skip Crop
					</button>
					<button type='button' className='btn btn-sm btn-primary' onClick={cropAndRemove}>
						Crop & Remove Background
					</button>
				</div>
			</div>
		</>
	)
}

function ProcessingStage({ croppedUrl, progressInfo }: { croppedUrl: string | null; progressInfo: ProgressInfo }) {
	return (
		<div className='flex-1 flex flex-col items-center justify-center gap-5 p-6'>
			{croppedUrl && <img src={croppedUrl} alt='Cropped' className='max-w-lg max-h-[40vh] rounded-lg opacity-30' />}
			<div className='flex flex-col items-center gap-3 w-full max-w-xs'>
				{progressInfo.percent != null ? (
					<div className='w-full bg-base-300 rounded-full h-2 overflow-hidden'>
						<div
							className='bg-primary h-full rounded-full transition-all duration-300'
							style={{ width: `${progressInfo.percent}%` }}
						/>
					</div>
				) : (
					<progress className='progress progress-primary w-full' />
				)}
				<div className='flex items-center gap-2'>
					<p className='text-sm opacity-70'>
						{progressInfo.label}
						{progressInfo.percent != null ? ` — ${progressInfo.percent}%` : ''}
					</p>
					<Elapsed running />
				</div>
			</div>
		</div>
	)
}

function ErrorStage({ message, onRetry }: { message: string | null; onRetry: () => void }) {
	return (
		<div className='flex-1 flex flex-col items-center justify-center gap-4 p-6'>
			<p className='text-lg font-medium text-error'>Something went wrong</p>
			<p className='text-sm opacity-70 max-w-md text-center'>{message}</p>
			<button type='button' className='btn btn-sm btn-primary' onClick={onRetry}>
				Try Again
			</button>
		</div>
	)
}

type ExportControls = {
	onBackToCrop: () => void
	format: Format
	onFormatChange: (format: Format) => void
	bgColor: string
	onBgColorChange: (color: string) => void
	onDownload: () => void
	onReset: () => void
}

type ResultToolbarProps = ExportControls & {
	showOriginal: boolean
	onToggleOriginal: () => void
	onEdit: () => void
}

function ResultToolbar(props: ResultToolbarProps) {
	const { showOriginal, format, bgColor } = props

	return (
		<div className='flex items-center justify-center gap-3 px-4 py-3 bg-base-200/80 backdrop-blur-sm border-t border-current/10 flex-wrap'>
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
				onChange={(e) => props.onFormatChange(e.target.value as Format)}
			>
				{Object.entries(FORMAT_META).map(([mime, { label, transparency }]) => (
					<option key={mime} value={mime}>
						{label}
						{!transparency ? ' (no transparency)' : ''}
					</option>
				))}
			</select>
			{!FORMAT_META[format].transparency && (
				<input
					type='color'
					className='w-8 h-8 rounded cursor-pointer border border-current/20'
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

type ResultStageProps = ExportControls & {
	resultUrl: string
	editedUrl: string | null
	croppedUrl: string | null
	onEditUpdate: (url: string) => void
}

function ResultStage({ resultUrl, editedUrl, croppedUrl, onEditUpdate, ...toolbar }: ResultStageProps) {
	const [showOriginal, setShowOriginal] = useState(false)
	const [editing, setEditing] = useState(false)
	const activeResultUrl = editedUrl ?? resultUrl

	return (
		<>
			{editing && croppedUrl ? (
				<EraserCanvas key={resultUrl} resultUrl={activeResultUrl} croppedUrl={croppedUrl} onUpdate={onEditUpdate} />
			) : (
				<>
					<div className='flex-1 min-h-0 flex items-center justify-center p-4'>
						<img
							src={showOriginal ? croppedUrl! : activeResultUrl}
							alt={showOriginal ? 'Cropped original' : 'Background removed'}
							className={`max-w-full max-h-full rounded-lg object-contain ${!showOriginal ? 'checkerboard' : ''}`}
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
				<div className='flex justify-center gap-2 px-4 py-2 bg-base-200/80 border-t border-current/10'>
					<button type='button' className='btn btn-sm btn-primary' onClick={() => setEditing(false)}>
						Done Editing
					</button>
				</div>
			)}
		</>
	)
}

const Root = () => {
	const [stage, setStage] = useState<Stage>('idle')
	const [progressInfo, setProgressInfo] = useState<ProgressInfo>({ label: '', percent: null })
	const [error, setError] = useState<string | null>(null)
	const [imageUrl, setImageUrl] = useState<string | null>(null)
	const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
	const [resultUrl, setResultUrl] = useState<string | null>(null)
	const [editedUrl, setEditedUrl] = useState<string | null>(null)
	const [format, setFormat] = useState<Format>('image/png')
	const [bgColor, setBgColor] = useState('#ffffff')
	const [model, setModel] = useState<ModelSize>('medium')
	const inputRef = useRef<HTMLInputElement>(null)
	const downloadBlobUrlRef = useRef<string | null>(null)
	const savedCropperStateRef = useRef<CropperState | null>(null)

	const fail = (err: unknown) => {
		setError(err instanceof Error ? err.message : String(err))
		setStage('error')
	}

	const announce = (label: string) => {
		setStage('processing')
		setProgressInfo({ label, percent: null })
	}

	const handleFile = async (file: File) => {
		try {
			setStage('loading')
			setError(null)
			setProgressInfo({ label: isHeicFile(file) ? 'Converting your photo…' : 'Opening your image…', percent: null })
			await nextFrame()

			setImageUrl(await normalizeFile(file))
			setStage('cropping')
		} catch (err) {
			fail(err)
		}
	}

	const processImage = async (inputBlob: Blob, previewUrl: string) => {
		try {
			setStage('processing')
			setError(null)
			setCroppedUrl(previewUrl)
			setProgressInfo({ label: 'Getting ready…', percent: null })
			await nextFrame()

			const resultBlob = await runBgRemoval(inputBlob, model, setProgressInfo)

			setResultUrl(URL.createObjectURL(resultBlob))
			setEditedUrl(null)
			setStage('done')
		} catch (err) {
			fail(err)
		}
	}

	const handleBackToCrop = () => {
		revokeUrls([resultUrl, editedUrl, croppedUrl === imageUrl ? null : croppedUrl])
		setResultUrl(null)
		setEditedUrl(null)
		setCroppedUrl(null)
		setStage('cropping')
	}

	const handleEditUpdate = (url: string) => {
		revokeUrls([editedUrl])
		setEditedUrl(url)
	}

	const download = async () => {
		const source = editedUrl ?? resultUrl
		if (!source) return

		const blob = await renderForDownload({ url: source, format, bgColor })
		if (!blob) return

		revokeUrls([downloadBlobUrlRef.current])
		downloadBlobUrlRef.current = triggerDownload(blob, `bg-removed.${FORMAT_META[format].ext}`)
	}

	const reset = () => {
		setStage('idle')
		setProgressInfo({ label: '', percent: null })
		setError(null)
		savedCropperStateRef.current = null

		revokeUrls([imageUrl, resultUrl, croppedUrl, editedUrl, downloadBlobUrlRef.current])
		downloadBlobUrlRef.current = null

		setImageUrl(null)
		setResultUrl(null)
		setCroppedUrl(null)
		setEditedUrl(null)
		if (inputRef.current) inputRef.current.value = ''
	}

	return (
		<ThemeProvider>
			<div className='h-screen w-screen flex flex-col overflow-hidden'>
				{stage === 'idle' && <DropZone inputRef={inputRef} onFile={handleFile} />}
				{stage === 'loading' && <LoadingStage label={progressInfo.label} />}
				{stage === 'cropping' && imageUrl && (
					<CropStage
						imageUrl={imageUrl}
						model={model}
						onModelChange={setModel}
						savedStateRef={savedCropperStateRef}
						onStatus={announce}
						onCropped={processImage}
						onCancel={reset}
					/>
				)}
				{stage === 'processing' && <ProcessingStage croppedUrl={croppedUrl} progressInfo={progressInfo} />}
				{stage === 'error' && <ErrorStage message={error} onRetry={reset} />}
				{stage === 'done' && resultUrl && (
					<ResultStage
						resultUrl={resultUrl}
						editedUrl={editedUrl}
						croppedUrl={croppedUrl}
						format={format}
						onFormatChange={setFormat}
						bgColor={bgColor}
						onBgColorChange={setBgColor}
						onEditUpdate={handleEditUpdate}
						onBackToCrop={handleBackToCrop}
						onDownload={download}
						onReset={reset}
					/>
				)}
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
