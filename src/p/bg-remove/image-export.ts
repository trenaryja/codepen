import { loadImage } from 'https://esm.sh/@trenaryja/ui'
import { context2d, createCanvas } from './canvas-utils'
import type { Format } from './types'
import { FORMAT_META } from './types'

export function imageToBlobUrl(src: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image()

		img.addEventListener('load', () => {
			const canvas = createCanvas(img.naturalWidth, img.naturalHeight)
			context2d(canvas).drawImage(img, 0, 0)
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png')
		})

		img.addEventListener('error', () => reject(new Error(`Image failed to load: ${src}`)))
		img.src = src
	})
}

export async function renderForDownload({ url, format, bgColor }: { url: string; format: Format; bgColor: string }) {
	const image = await loadImage(url)
	const canvas = createCanvas(image.naturalWidth, image.naturalHeight)
	const context = context2d(canvas)

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
export function triggerDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	return url
}
