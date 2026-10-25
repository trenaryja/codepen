import heic2any from 'https://esm.sh/heic2any'
import { z } from 'https://esm.sh/zod'
import { isHeicFile } from './canvas-utils'
import type { ModelSize } from './types'

// The host is its own constant so the string `https://esm.sh/...` never appears in this file: Vite's
// esm-sh-to-local plugin rewrites any such literal to a bare specifier, which a blob worker can't resolve.
export const ESM_HOST = 'esm.sh'
export const ESM_SH = `https://${ESM_HOST}/`

export function createBgWorker(model: ModelSize) {
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

export async function normalizeFile(file: File) {
	if (isHeicFile(file)) {
		const converted = await heic2any({ blob: file, toType: 'image/png' })
		const blob = Array.isArray(converted) ? converted[0] : converted
		if (!blob) throw new Error(`heic2any returned no image for ${file.name}`)
		return URL.createObjectURL(blob)
	}

	return URL.createObjectURL(file)
}

export type ProgressInfo = { label: string; percent: number | null }

export const PHASE_LABELS: Record<string, string> = {
	'fetch:model': 'Preparing the AI (first time takes a moment)…',
	'compute:inference': 'Finding the subject in your image…',
	'compute:postprocess': 'Cleaning up the edges…',
}

export const DETERMINISTIC_PHASES = new Set(['fetch:model'])

export function phaseLabel(key: string) {
	const known = PHASE_LABELS[key]
	if (known) return known
	if (key.startsWith('fetch:')) return 'Downloading resources…'
	if (key.startsWith('compute:')) return 'Processing…'
	return 'Working…'
}

export const workerMessageSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('progress'), key: z.string(), current: z.number(), total: z.number() }),
	z.object({ type: z.literal('done'), blob: z.instanceof(Blob) }),
	z.object({ type: z.literal('error'), message: z.string() }),
])

export function runBgRemoval(blob: Blob, model: ModelSize, onProgress: (info: ProgressInfo) => void): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const worker = createBgWorker(model)

		worker.addEventListener('message', (e) => {
			const parsed = workerMessageSchema.safeParse(e.data)

			if (!parsed.success) {
				reject(new Error(`Background-removal worker sent an unexpected message: ${z.prettifyError(parsed.error)}`))
				worker.terminate()
				return
			}

			const message = parsed.data

			if (message.type === 'progress') {
				const { key, current, total } = message
				const percent = DETERMINISTIC_PHASES.has(key) && total > 0 ? Math.round((current / total) * 100) : null
				onProgress({ label: phaseLabel(key), percent })
			} else if (message.type === 'done') {
				resolve(message.blob)
				worker.terminate()
			} else {
				reject(new Error(message.message))
				worker.terminate()
			}
		})

		worker.addEventListener('error', (event) => {
			reject(new Error(event.message))
			worker.terminate()
		})

		worker.postMessage(blob)
	})
}
