import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import heic2any from 'https://esm.sh/heic2any'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import type { CropperRef, CropperState } from 'https://esm.sh/react-advanced-cropper'
import { Cropper } from 'https://esm.sh/react-advanced-cropper'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { ImageRestriction } from 'advanced-cropper'

type Stage = 'idle' | 'loading' | 'cropping' | 'processing' | 'done' | 'error'
type Format = 'image/png' | 'image/webp' | 'image/jpeg' | 'image/avif'
type ModelSize = 'small' | 'medium' | 'large'
type BrushMode = 'erase' | 'restore'

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

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

const ESM_SH = 'https://esm' + '.sh/' // split to prevent Vite's esm.sh plugin from rewriting

function createBgWorker(model: ModelSize): Worker {
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

async function normalizeFile(file: File): Promise<string> {
	if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
		const converted = await heic2any({ blob: file, toType: 'image/png' })
		const blob = Array.isArray(converted) ? converted[0] : converted
		return URL.createObjectURL(blob)
	}
	return URL.createObjectURL(file)
}

type ProgressInfo = { label: string; pct: number | null }

const PHASE_LABELS: Record<string, string> = {
	'fetch:model': 'Preparing the AI (first time takes a moment)…',
	'compute:inference': 'Finding the subject in your image…',
	'compute:postprocess': 'Cleaning up the edges…',
}

const DETERMINISTIC_PHASES = new Set(['fetch:model'])

function phaseLabel(key: string): string {
	if (key in PHASE_LABELS) return PHASE_LABELS[key]
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
				const pct = DETERMINISTIC_PHASES.has(key) && total > 0 ? Math.round((current / total) * 100) : null
				onProgress({ label: phaseLabel(key), pct })
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
			const c = document.createElement('canvas')
			c.width = img.naturalWidth
			c.height = img.naturalHeight
			c.getContext('2d')!.drawImage(img, 0, 0)
			c.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png')
		}
		img.onerror = reject
		img.src = src
	})
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = reject
		img.src = src
	})
}

/**
 * Create a radial gradient brush with feathered edges.
 * hardness 1 = fully hard circle, hardness 0 = extremely soft gaussian-like falloff.
 * At low hardness, the opaque core shrinks to nearly nothing and the falloff is curved.
 */
function createBrushPattern(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, hardness: number): CanvasGradient {
	const coreRadius = radius * hardness * hardness // quadratic curve for more dramatic softness range
	const grad = ctx.createRadialGradient(x, y, coreRadius, x, y, radius)
	// Gaussian-ish falloff with intermediate stops
	grad.addColorStop(0, 'rgba(0,0,0,1)')
	grad.addColorStop(0.3, `rgba(0,0,0,${(0.7 + hardness * 0.3).toFixed(2)})`)
	grad.addColorStop(0.6, `rgba(0,0,0,${(0.3 + hardness * 0.4).toFixed(2)})`)
	grad.addColorStop(0.85, `rgba(0,0,0,${(0.08 + hardness * 0.2).toFixed(2)})`)
	grad.addColorStop(1, 'rgba(0,0,0,0)')
	return grad
}

function Elapsed({ running }: { running: boolean }) {
	const [seconds, setSeconds] = useState(0)
	const startRef = useRef(Date.now())

	useEffect(() => {
		if (!running) return
		startRef.current = Date.now()
		setSeconds(0)
		const id = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
		return () => clearInterval(id)
	}, [running])

	if (seconds < 2) return null
	return <span className='text-xs opacity-40'>{seconds}s</span>
}

// ── Eraser/Restore canvas component ──

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
	const cursorRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const croppedImgRef = useRef<HTMLImageElement | null>(null)
	const [brushSize, setBrushSize] = useState(20)
	const [hardness, setHardness] = useState(0.7)
	const [mode, setMode] = useState<BrushMode>('erase')
	const [ready, setReady] = useState(false)
	const [cursorVisible, setCursorVisible] = useState(false)
	const [zoom, setZoom] = useState(1)
	const [pan, setPan] = useState({ x: 0, y: 0 })
	const paintingRef = useRef(false)
	const panningRef = useRef(false)
	const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
	const lastPosRef = useRef<{ x: number; y: number } | null>(null)
	const undoStackRef = useRef<ImageData[]>([])

	// Reusable temp canvas for restore brush (avoids creating one per stroke step)
	const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null)

	const getDisplayBrushSize = (): number => {
		const canvas = canvasRef.current
		if (!canvas) return brushSize
		const rect = canvas.getBoundingClientRect()
		return (brushSize / canvas.width) * rect.width * zoom
	}

	useEffect(() => {
		let cancelled = false
		Promise.all([loadImage(resultUrl), loadImage(croppedUrl)]).then(([resultImg, croppedImg]) => {
			if (cancelled) return
			croppedImgRef.current = croppedImg

			const canvas = canvasRef.current!
			canvas.width = resultImg.naturalWidth
			canvas.height = resultImg.naturalHeight
			const ctx = canvas.getContext('2d')!
			ctx.drawImage(resultImg, 0, 0)

			// Pre-create temp canvas at image size for restore brush
			const tmp = document.createElement('canvas')
			tmp.width = canvas.width
			tmp.height = canvas.height
			tmpCanvasRef.current = tmp

			setReady(true)
		})
		return () => { cancelled = true }
	}, [resultUrl, croppedUrl])

	const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
		const canvas = canvasRef.current!
		const rect = canvas.getBoundingClientRect()
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
		return {
			x: ((clientX - rect.left) / rect.width) * canvas.width,
			y: ((clientY - rect.top) / rect.height) * canvas.height,
		}
	}

	const updateCursor = (e: React.MouseEvent) => {
		if (!cursorRef.current) return
		const size = getDisplayBrushSize()
		cursorRef.current.style.left = `${e.clientX - size / 2}px`
		cursorRef.current.style.top = `${e.clientY - size / 2}px`
		cursorRef.current.style.width = `${size}px`
		cursorRef.current.style.height = `${size}px`
	}

	const saveUndo = () => {
		const canvas = canvasRef.current!
		const ctx = canvas.getContext('2d')!
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
		undoStackRef.current.push(data)
		if (undoStackRef.current.length > 30) undoStackRef.current.shift()
	}

	const undo = () => {
		const data = undoStackRef.current.pop()
		if (!data) return
		const canvas = canvasRef.current!
		canvas.getContext('2d')!.putImageData(data, 0, 0)
		emitUpdate()
	}

	const paintStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
		const canvas = canvasRef.current!
		const ctx = canvas.getContext('2d')!
		const radius = brushSize / 2

		const dist = Math.hypot(to.x - from.x, to.y - from.y)
		const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.25)))

		for (let i = 0; i <= steps; i++) {
			const t = i / steps
			const x = from.x + (to.x - from.x) * t
			const y = from.y + (to.y - from.y) * t

			if (mode === 'erase') {
				ctx.save()
				ctx.globalCompositeOperation = 'destination-out'
				if (hardness >= 0.95) {
					ctx.beginPath()
					ctx.arc(x, y, radius, 0, Math.PI * 2)
					ctx.fill()
				} else {
					ctx.fillStyle = createBrushPattern(ctx, x, y, radius, hardness)
					ctx.fillRect(x - radius, y - radius, brushSize, brushSize)
				}
				ctx.restore()
			} else {
				// Restore from original cropped image with feathering
				const tmp = tmpCanvasRef.current!
				const tmpCtx = tmp.getContext('2d')!
				const bx = Math.max(0, Math.floor(x - radius))
				const by = Math.max(0, Math.floor(y - radius))
				const bw = Math.min(canvas.width - bx, Math.ceil(brushSize + 2))
				const bh = Math.min(canvas.height - by, Math.ceil(brushSize + 2))

				tmpCtx.clearRect(bx, by, bw, bh)
				tmpCtx.save()
				tmpCtx.beginPath()
				tmpCtx.rect(bx, by, bw, bh)
				tmpCtx.clip()
				tmpCtx.drawImage(croppedImgRef.current!, 0, 0)
				tmpCtx.restore()

				tmpCtx.globalCompositeOperation = 'destination-in'
				if (hardness >= 0.95) {
					tmpCtx.beginPath()
					tmpCtx.arc(x, y, radius, 0, Math.PI * 2)
					tmpCtx.fill()
				} else {
					tmpCtx.fillStyle = createBrushPattern(tmpCtx, x, y, radius, hardness)
					tmpCtx.fillRect(x - radius, y - radius, brushSize, brushSize)
				}
				tmpCtx.globalCompositeOperation = 'source-over'

				ctx.save()
				ctx.globalCompositeOperation = 'source-over'
				ctx.drawImage(tmp, bx, by, bw, bh, bx, by, bw, bh)
				ctx.restore()
			}
		}
	}

	const emitUpdate = () => {
		const canvas = canvasRef.current!
		canvas.toBlob((blob) => {
			if (blob) onUpdate(URL.createObjectURL(blob))
		}, 'image/png')
	}

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault()
		const delta = e.deltaY > 0 ? 0.9 : 1.1
		setZoom((z) => Math.min(20, Math.max(0.5, z * delta)))
	}

	const startPaint = (e: React.MouseEvent | React.TouchEvent) => {
		if (!ready) return

		// Space+click or middle mouse = pan
		if ('button' in e && e.button === 1) {
			e.preventDefault()
			panningRef.current = true
			panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
			return
		}

		e.preventDefault()
		saveUndo()
		paintingRef.current = true
		const pos = getCanvasPos(e)
		lastPosRef.current = pos
		paintStroke(pos, pos)
	}

	const movePaint = (e: React.MouseEvent | React.TouchEvent) => {
		if ('clientX' in e) updateCursor(e)

		if (panningRef.current && 'clientX' in e) {
			setPan({
				x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
				y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
			})
			return
		}

		if (!paintingRef.current || !lastPosRef.current) return
		e.preventDefault()
		const pos = getCanvasPos(e)
		paintStroke(lastPosRef.current, pos)
		lastPosRef.current = pos
	}

	const endPaint = () => {
		if (panningRef.current) {
			panningRef.current = false
			return
		}
		if (!paintingRef.current) return
		paintingRef.current = false
		lastPosRef.current = null
		emitUpdate()
	}

	const resetView = () => {
		setZoom(1)
		setPan({ x: 0, y: 0 })
	}

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
				e.preventDefault()
				undo()
			} else if (e.key === '0') {
				resetView()
			} else if (e.key === '[') {
				setBrushSize((s) => Math.max(5, s - 5))
			} else if (e.key === ']') {
				setBrushSize((s) => Math.min(150, s + 5))
			}
		}
		window.addEventListener('keydown', handleKey)
		return () => window.removeEventListener('keydown', handleKey)
	}, [])

	const cursorBorder = mode === 'erase' ? 'border-red-400' : 'border-green-400'

	return (
		<div className='flex flex-col h-full'>
			{/* Brush cursor overlay */}
			<div
				ref={cursorRef}
				className={`fixed pointer-events-none rounded-full border-2 ${cursorBorder} z-50 transition-[border-color] duration-150`}
				style={{
					display: cursorVisible ? 'block' : 'none',
					boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
				}}
			/>
			<div
				ref={containerRef}
				className='flex-1 min-h-0 flex items-center justify-center overflow-hidden'
				onWheel={handleWheel}
			>
				<canvas
					ref={canvasRef}
					className='max-w-full max-h-full rounded-lg checkerboard'
					style={{
						cursor: 'none',
						touchAction: 'none',
						transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
						transformOrigin: 'center center',
					}}
					onMouseDown={startPaint}
					onMouseMove={(e) => {
						updateCursor(e)
						movePaint(e)
					}}
					onMouseUp={endPaint}
					onMouseLeave={() => {
						setCursorVisible(false)
						endPaint()
					}}
					onMouseEnter={() => setCursorVisible(true)}
					onTouchStart={startPaint}
					onTouchMove={movePaint}
					onTouchEnd={endPaint}
				/>
			</div>
			<div className='flex items-center justify-center gap-4 px-4 py-3 bg-base-200/80 backdrop-blur-sm border-t border-current/10 flex-wrap'>
				<div className='flex gap-1'>
					<button
						type='button'
						className={`btn btn-sm ${mode === 'erase' ? 'btn-error' : 'btn-outline'}`}
						onClick={() => setMode('erase')}
					>
						Erase
					</button>
					<button
						type='button'
						className={`btn btn-sm ${mode === 'restore' ? 'btn-success' : 'btn-outline'}`}
						onClick={() => setMode('restore')}
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
						onChange={(e) => setBrushSize(Number(e.target.value))}
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
						onChange={(e) => setHardness(1 - Number(e.target.value) / 100)}
					/>
				</div>
				<div className='flex items-center gap-1'>
					<span className='text-xs opacity-50'>{Math.round(zoom * 100)}%</span>
					{zoom !== 1 && (
						<button type='button' className='btn btn-xs btn-ghost' onClick={resetView}>
							Fit
						</button>
					)}
				</div>
				<button type='button' className='btn btn-sm btn-ghost' onClick={undo}>
					Undo
				</button>
				<span className='text-xs opacity-40 hidden sm:inline'>[ ] brush size · scroll to zoom · middle-click to pan</span>
			</div>
		</div>
	)
}

// ── Main app ──

const Root = () => {
	const [stage, setStage] = useState<Stage>('idle')
	const [progressInfo, setProgressInfo] = useState<ProgressInfo>({ label: '', pct: null })
	const [error, setError] = useState<string | null>(null)
	const [imageUrl, setImageUrl] = useState<string | null>(null)
	const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
	const [resultUrl, setResultUrl] = useState<string | null>(null)
	const [editedUrl, setEditedUrl] = useState<string | null>(null)
	const [showOriginal, setShowOriginal] = useState(false)
	const [editing, setEditing] = useState(false)
	const [format, setFormat] = useState<Format>('image/png')
	const [bgColor, setBgColor] = useState('#ffffff')
	const [model, setModel] = useState<ModelSize>('medium')
	const inputRef = useRef<HTMLInputElement>(null)
	const cropperRef = useRef<CropperRef>(null)
	const downloadBlobUrlRef = useRef<string | null>(null)
	const savedCropperStateRef = useRef<CropperState | null>(null)

	const activeResultUrl = editedUrl ?? resultUrl

	const handleFile = async (file: File) => {
		try {
			const isHeic = file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')
			setStage('loading')
			setError(null)
			setProgressInfo({ label: isHeic ? 'Converting your photo…' : 'Opening your image…', pct: null })
			await nextFrame()

			const url = await normalizeFile(file)
			setImageUrl(url)
			setStage('cropping')
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
			setStage('error')
		}
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.currentTarget.classList.remove('border-primary', 'bg-primary/5')
		const file = e.dataTransfer.files[0]
		if (file) handleFile(file)
	}

	const processImage = async (inputBlob: Blob, previewUrl: string) => {
		try {
			setStage('processing')
			setError(null)
			setCroppedUrl(previewUrl)
			setProgressInfo({ label: 'Getting ready…', pct: null })
			await nextFrame()

			const resultBlob = await runBgRemoval(inputBlob, model, setProgressInfo)

			setResultUrl(URL.createObjectURL(resultBlob))
			setEditedUrl(null)
			setStage('done')
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
			setStage('error')
		}
	}

	const handleCropAndRemove = async () => {
		const canvas = cropperRef.current?.getCanvas({ imageSmoothingQuality: 'high' })
		if (!canvas) return

		savedCropperStateRef.current = cropperRef.current?.getState() ?? null
		setStage('processing')
		setProgressInfo({ label: 'Preparing your crop…', pct: null })
		await nextFrame()

		const croppedBlob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png'),
		)
		const previewUrl = URL.createObjectURL(croppedBlob)
		await processImage(croppedBlob, previewUrl)
	}

	const handleSkipCrop = async () => {
		if (!imageUrl) return
		setStage('processing')
		setProgressInfo({ label: 'Getting ready…', pct: null })
		await nextFrame()

		const blob = await imageToBlobUrl(imageUrl)
		await processImage(blob, imageUrl)
	}

	const handleBackToCrop = () => {
		if (resultUrl) URL.revokeObjectURL(resultUrl)
		if (editedUrl) URL.revokeObjectURL(editedUrl)
		if (croppedUrl && croppedUrl !== imageUrl) URL.revokeObjectURL(croppedUrl)
		setResultUrl(null)
		setEditedUrl(null)
		setCroppedUrl(null)
		setShowOriginal(false)
		setEditing(false)
		setStage('cropping')
	}

	const handleCropperReady = () => {
		if (savedCropperStateRef.current && cropperRef.current) {
			cropperRef.current.setState(savedCropperStateRef.current)
		}
	}

	const handleResetCrop = () => {
		cropperRef.current?.reset()
		savedCropperStateRef.current = null
	}

	const handleEditUpdate = (url: string) => {
		if (editedUrl) URL.revokeObjectURL(editedUrl)
		setEditedUrl(url)
	}

	const download = async () => {
		if (!activeResultUrl) return

		if (downloadBlobUrlRef.current) {
			URL.revokeObjectURL(downloadBlobUrlRef.current)
			downloadBlobUrlRef.current = null
		}

		const { ext, transparency } = FORMAT_META[format]
		const img = await loadImage(activeResultUrl)
		const c = document.createElement('canvas')
		c.width = img.naturalWidth
		c.height = img.naturalHeight
		const ctx = c.getContext('2d')!
		if (!transparency) {
			ctx.fillStyle = bgColor
			ctx.fillRect(0, 0, c.width, c.height)
		}
		ctx.drawImage(img, 0, 0)
		c.toBlob(
			(blob) => {
				if (!blob) return
				const url = URL.createObjectURL(blob)
				downloadBlobUrlRef.current = url
				const a = document.createElement('a')
				a.href = url
				a.download = `bg-removed.${ext}`
				a.click()
			},
			format,
			format === 'image/jpeg' ? 0.92 : undefined,
		)
	}

	const reset = () => {
		setStage('idle')
		setProgressInfo({ label: '', pct: null })
		setError(null)
		savedCropperStateRef.current = null
		for (const url of [imageUrl, resultUrl, croppedUrl, editedUrl]) {
			if (url) URL.revokeObjectURL(url)
		}
		if (downloadBlobUrlRef.current) {
			URL.revokeObjectURL(downloadBlobUrlRef.current)
			downloadBlobUrlRef.current = null
		}
		setImageUrl(null)
		setResultUrl(null)
		setCroppedUrl(null)
		setEditedUrl(null)
		setShowOriginal(false)
		setEditing(false)
		if (inputRef.current) inputRef.current.value = ''
	}

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (stage === 'cropping') {
				if (e.key === 'Enter') {
					e.preventDefault()
					handleCropAndRemove()
				} else if (e.key === 'Escape') {
					e.preventDefault()
					reset()
				}
			}
		}
		window.addEventListener('keydown', handleKey)
		return () => window.removeEventListener('keydown', handleKey)
	}, [stage])

	return (
		<ThemeProvider>
			<div className='h-screen w-screen flex flex-col overflow-hidden'>
				{/* ── Drop zone ── */}
				{stage === 'idle' && (
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
								if (file) handleFile(file)
							}}
						/>
					</button>
				)}

				{/* ── Loading ── */}
				{stage === 'loading' && (
					<div className='flex-1 flex flex-col items-center justify-center gap-4'>
						<span className='loading loading-spinner loading-lg' />
						<p className='text-sm opacity-70'>{progressInfo.label}</p>
					</div>
				)}

				{/* ── Crop ── */}
				{stage === 'cropping' && imageUrl && (
					<>
						<div className='flex-1 min-h-0 relative'>
							<Cropper
								ref={cropperRef}
								src={imageUrl}
								style={{ width: '100%', height: '100%' }}
								stencilProps={{
									movable: true,
									resizable: true,
									lines: true,
									handlers: true,
									grid: true,
								}}
								onReady={handleCropperReady}
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
								<button
									type='button'
									className='btn btn-sm btn-outline'
									onClick={() => cropperRef.current?.zoomImage(0.7)}
								>
									-
								</button>
								<button
									type='button'
									className='btn btn-sm btn-outline'
									onClick={() => cropperRef.current?.zoomImage(1.4)}
								>
									+
								</button>
								<span className='text-xs opacity-40 ml-1'>or scroll</span>
								<button type='button' className='btn btn-sm btn-ghost' onClick={handleResetCrop}>
									Reset
								</button>
								<select
									className='select select-sm select-bordered'
									value={model}
									onChange={(e) => setModel(e.target.value as ModelSize)}
								>
									{Object.entries(MODEL_META).map(([key, { label, size }]) => (
										<option key={key} value={key}>
											{label} ({size})
										</option>
									))}
								</select>
							</div>
							<p className='text-xs opacity-50 hidden sm:block'>
								Drag edges to resize · Enter to confirm · Esc to cancel
							</p>
							<div className='flex gap-2'>
								<button type='button' className='btn btn-sm btn-ghost' onClick={reset}>
									Cancel
								</button>
								<button type='button' className='btn btn-sm btn-outline' onClick={handleSkipCrop}>
									Skip Crop
								</button>
								<button type='button' className='btn btn-sm btn-primary' onClick={handleCropAndRemove}>
									Crop & Remove Background
								</button>
							</div>
						</div>
					</>
				)}

				{/* ── Processing ── */}
				{stage === 'processing' && (
					<div className='flex-1 flex flex-col items-center justify-center gap-5 p-6'>
						{croppedUrl && (
							<img src={croppedUrl} alt='Cropped' className='max-w-lg max-h-[40vh] rounded-lg opacity-30' />
						)}
						<div className='flex flex-col items-center gap-3 w-full max-w-xs'>
							{progressInfo.pct != null ? (
								<div className='w-full bg-base-300 rounded-full h-2 overflow-hidden'>
									<div
										className='bg-primary h-full rounded-full transition-all duration-300'
										style={{ width: `${progressInfo.pct}%` }}
									/>
								</div>
							) : (
								<progress className='progress progress-primary w-full' />
							)}
							<div className='flex items-center gap-2'>
								<p className='text-sm opacity-70'>
									{progressInfo.label}
									{progressInfo.pct != null ? ` — ${progressInfo.pct}%` : ''}
								</p>
								<Elapsed running={stage === 'processing'} />
							</div>
						</div>
					</div>
				)}

				{/* ── Error ── */}
				{stage === 'error' && (
					<div className='flex-1 flex flex-col items-center justify-center gap-4 p-6'>
						<p className='text-lg font-medium text-error'>Something went wrong</p>
						<p className='text-sm opacity-70 max-w-md text-center'>{error}</p>
						<button type='button' className='btn btn-sm btn-primary' onClick={reset}>
							Try Again
						</button>
					</div>
				)}

				{/* ── Result ── */}
				{stage === 'done' && resultUrl && (
					<>
						{editing && croppedUrl ? (
							<EraserCanvas resultUrl={editedUrl ?? resultUrl} croppedUrl={croppedUrl} onUpdate={handleEditUpdate} />
						) : (
							<>
								<div className='flex-1 min-h-0 flex items-center justify-center p-4'>
									<img
										src={showOriginal ? croppedUrl! : activeResultUrl!}
										alt={showOriginal ? 'Cropped original' : 'Background removed'}
										className={`max-w-full max-h-full rounded-lg object-contain ${!showOriginal ? 'checkerboard' : ''}`}
									/>
								</div>
								<div className='flex items-center justify-center gap-3 px-4 py-3 bg-base-200/80 backdrop-blur-sm border-t border-current/10 flex-wrap'>
									<button type='button' className='btn btn-sm btn-outline' onClick={() => setShowOriginal(!showOriginal)}>
										{showOriginal ? 'Show Result' : 'Show Original'}
									</button>
									<button type='button' className='btn btn-sm btn-outline' onClick={() => setEditing(true)}>
										Touch Up
									</button>
									<button type='button' className='btn btn-sm btn-outline' onClick={handleBackToCrop}>
										Re-crop
									</button>
									<select
										className='select select-sm select-bordered'
										value={format}
										onChange={(e) => setFormat(e.target.value as Format)}
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
											onChange={(e) => setBgColor(e.target.value)}
											title='Background fill color'
										/>
									)}
									<button type='button' className='btn btn-sm btn-primary' onClick={download}>
										Download {FORMAT_META[format].label}
									</button>
									<button type='button' className='btn btn-sm btn-ghost' onClick={reset}>
										New Image
									</button>
								</div>
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
				)}
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
