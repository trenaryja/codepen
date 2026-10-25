import React from 'https://esm.sh/react'
import { context2d, createCanvas } from './canvas-utils'
import type { BrushMode, Point } from './types'

export type Dab = { context: CanvasRenderingContext2D; x: number; y: number; radius: number; hardness: number }

export function createBrushPattern({ context, x, y, radius, hardness }: Dab): CanvasGradient {
	const coreRadius = radius * hardness * hardness // quadratic curve for more dramatic softness range
	const gradient = context.createRadialGradient(x, y, coreRadius, x, y, radius)
	gradient.addColorStop(0, 'rgba(0,0,0,1)')
	gradient.addColorStop(0.3, `rgba(0,0,0,${(0.7 + hardness * 0.3).toFixed(2)})`)
	gradient.addColorStop(0.6, `rgba(0,0,0,${(0.3 + hardness * 0.4).toFixed(2)})`)
	gradient.addColorStop(0.85, `rgba(0,0,0,${(0.08 + hardness * 0.2).toFixed(2)})`)
	gradient.addColorStop(1, 'rgba(0,0,0,0)')
	return gradient
}

export function fillDab({ context, x, y, radius, hardness }: Dab) {
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

export const eraseDab = ({ context, x, y, radius, hardness }: Dab) => {
	context.save()
	context.globalCompositeOperation = 'destination-out'
	fillDab({ context, x, y, radius, hardness })
	context.restore()
}

export type RestoreDab = Dab & {
	canvas: HTMLCanvasElement
	scratchCanvas: HTMLCanvasElement
	croppedImage: HTMLImageElement
}

export function restoreDab({ context, canvas, scratchCanvas, croppedImage, x, y, radius, hardness }: RestoreDab) {
	const scratchContext = context2d(scratchCanvas)
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

export type StrokeSettings = {
	canvas: HTMLCanvasElement
	scratchCanvas: HTMLCanvasElement
	croppedImage: HTMLImageElement
	brushSize: number
	hardness: number
	mode: BrushMode
}

export function paintStroke(from: Point, to: Point, settings: StrokeSettings) {
	const { canvas, scratchCanvas, croppedImage, brushSize, hardness, mode } = settings
	const context = context2d(canvas)
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

export function primeCanvas(canvas: HTMLCanvasElement, resultImage: HTMLImageElement) {
	canvas.width = resultImage.naturalWidth
	canvas.height = resultImage.naturalHeight
	context2d(canvas).drawImage(resultImage, 0, 0)
	return createCanvas(canvas.width, canvas.height)
}

export function canvasPointFromEvent(canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) {
	const { clientX, clientY } = ('touches' in e ? e.touches[0] : e) ?? {}
	if (clientX === undefined || clientY === undefined) return null
	const rect = canvas.getBoundingClientRect()
	return {
		x: ((clientX - rect.left) / rect.width) * canvas.width,
		y: ((clientY - rect.top) / rect.height) * canvas.height,
	}
}
