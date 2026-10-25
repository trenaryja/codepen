import { useHotkeys } from 'https://esm.sh/@mantine/hooks'
import { loadImage } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { canvasPointFromEvent, paintStroke, primeCanvas } from './brush-painting'
import { context2d } from './canvas-utils'
import { useCanvasViewport } from './canvas-viewport'
import type { BrushMode, Point } from './types'

export type EraserSurfaceProps = {
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

export function EraserSurface({
	canvasRef,
	brushSize,
	mode,
	zoom,
	pan,
	onWheel,
	onStart,
	onMove,
	onEnd,
}: EraserSurfaceProps) {
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
				className={`pointer-events-none fixed rounded-full border-2 ${cursorBorder} z-50 transition-[border-color] duration-150`}
				style={{
					display: cursorVisible ? 'block' : 'none',
					boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)',
					transform: 'translate(-50%, -50%)',
				}}
			/>
			<div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden' onWheel={onWheel}>
				<canvas
					ref={canvasRef}
					className='checkerboard max-h-full max-w-full rounded-lg'
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

export type EraserToolbarProps = {
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

export function EraserToolbar(props: EraserToolbarProps) {
	const { mode, onModeChange, brushSize, onBrushSizeChange, hardness, onHardnessChange, zoom } = props

	return (
		<div className='bg-base-200/80 flex flex-wrap items-center justify-center gap-4 border-t border-current/10 px-4 py-3 backdrop-blur-sm'>
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
			<span className='hidden text-xs opacity-40 sm:inline'>[ ] brush size · scroll to zoom · middle-click to pan</span>
		</div>
	)
}

export function EraserCanvas({
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
				if (cancelled || !canvasRef.current) return
				croppedImageRef.current = croppedImage
				scratchCanvasRef.current = primeCanvas(canvasRef.current, resultImage)
				setReady(true)
			})
			.catch((error: unknown) => console.error('Touch-up canvas could not load its source images:', error))

		return () => {
			cancelled = true
		}
	}, [seedUrl, croppedUrl])

	const saveUndo = () => {
		const canvas = canvasRef.current
		if (!canvas) return
		undoStackRef.current.push(context2d(canvas).getImageData(0, 0, canvas.width, canvas.height))
		if (undoStackRef.current.length > 30) undoStackRef.current.shift()
	}

	const emitUpdate = () => {
		canvasRef.current?.toBlob((blob) => {
			if (blob) onUpdate(URL.createObjectURL(blob))
		}, 'image/png')
	}

	const undo = () => {
		const canvas = canvasRef.current
		if (!canvas) return
		const data = undoStackRef.current.pop()
		if (!data) return
		context2d(canvas).putImageData(data, 0, 0)
		emitUpdate()
	}

	const stroke = (from: Point, to: Point) => {
		const canvas = canvasRef.current
		const scratchCanvas = scratchCanvasRef.current
		const croppedImage = croppedImageRef.current
		if (!canvas || !scratchCanvas || !croppedImage) return
		paintStroke(from, to, { canvas, scratchCanvas, croppedImage, brushSize, hardness, mode })
	}

	const startPaint = (e: React.MouseEvent | React.TouchEvent) => {
		if (!ready) return

		if ('button' in e && e.button === 1) {
			e.preventDefault()
			viewport.startPan(e.clientX, e.clientY)
			return
		}

		e.preventDefault()
		const point = canvasRef.current && canvasPointFromEvent(canvasRef.current, e)
		if (!point) return
		saveUndo()
		paintingRef.current = true
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
		const point = canvasRef.current && canvasPointFromEvent(canvasRef.current, e)
		if (!point) return
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
		<div className='flex h-full flex-col'>
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
