export type Stage = 'cropping' | 'done' | 'error' | 'idle' | 'loading' | 'processing'

export type Format = 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp'

export type ModelSize = 'large' | 'medium' | 'small'

export type BrushMode = 'erase' | 'restore'

export type Point = { x: number; y: number }

export const FORMAT_META: Record<Format, { ext: string; label: string; transparency: boolean }> = {
	'image/png': { ext: 'png', label: 'PNG', transparency: true },
	'image/webp': { ext: 'webp', label: 'WebP', transparency: true },
	'image/jpeg': { ext: 'jpg', label: 'JPEG', transparency: false },
	'image/avif': { ext: 'avif', label: 'AVIF', transparency: true },
}

export const MODEL_META: Record<ModelSize, { label: string; size: string }> = {
	small: { label: 'Fast', size: '~42 MB' },
	medium: { label: 'Balanced', size: '~84 MB' },
	large: { label: 'Best quality', size: '~168 MB' },
}
