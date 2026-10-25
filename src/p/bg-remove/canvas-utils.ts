export const nextFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	})

export const createCanvas = (width: number, height: number) => {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

export const context2d = (canvas: HTMLCanvasElement) => {
	const context = canvas.getContext('2d')
	if (!context) throw new Error('This browser gave no 2D canvas context')
	return context
}

export const revokeUrls = (urls: (string | null)[]) => {
	for (const url of urls) if (url) URL.revokeObjectURL(url)
}

export const isHeicFile = (file: File) => file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')
