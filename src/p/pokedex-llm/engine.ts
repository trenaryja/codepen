import * as R from 'https://esm.sh/remeda'
import { acceptSchema, buildMessages, rejectSchema, repairJson } from './prompt'

/**
 * Every model here was checked against the real grammar — "small instruct model" is no guarantee it
 * can finish a constrained object. Gemma 3 1B is deliberately absent: JSON allows unlimited whitespace
 * between tokens, and after each string value Gemma rides that loop to max_tokens, never reaching the
 * next key. Penalties only change which whitespace it emits, and WebLLM 0.2.84 can't disable it.
 */
export const MODELS = [
	{ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', size: '376 MB' },
	{ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', size: '879 MB' },
	{ id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B', size: '1.6 GB' },
] as const

/**
 * jsDelivr, not esm.sh: esm.sh's build of web-llm shims node's `path` badly and dies with
 * "dirname is not a function" the moment the worker engine spins up. esm.run is what web-llm's
 * own docs point at. The `.` is split out so Vite's esm.sh plugin ignores the worker source.
 */
export const CDN = `https://esm.run/`

/**
 * Resolves once the browser has actually painted — one frame to commit, one to be sure it landed.
 * A hidden tab never fires rAF, so frames alone would wedge the load at "Starting…" forever; and
 * `visible` is not the inverse guarantee — an occluded window composites nothing while still
 * reporting visible (measured: 0 frames in 500ms). Hence a 2s ceiling rather than a short race: too
 * short and work starts before the overlay lands, leaving the user on the last good frame, a page
 * that looks idle and answers nothing. Waiting too long is the safe direction; too short isn't.
 */
export const nextPaint = () =>
	new Promise((resolve) => {
		const done = () => resolve(undefined)

		if (document.visibilityState === 'hidden') {
			setTimeout(done, 0)
			return
		}

		setTimeout(done, 2000)
		requestAnimationFrame(() => requestAnimationFrame(done))
	})

/**
 * Load progress lives outside React deliberately. WebLLM fires ~25 init callbacks per load; routing
 * them through root state re-rendered the whole pen each time. Measured against a no-React control on
 * the same warm cache: 62 long tasks / 7228ms blocked main thread versus 6 / 407ms, a 9.0s load versus
 * 1.9s. That gap is what Chrome's hang detector reacted to — an overlay alone could never have fixed
 * it. Only `LoadOverlay` subscribes, which keeps a progress tick down to a label and a bar.
 */
export const createProgressStore = () => {
	let snapshot = { text: '', value: 0 }
	const listeners = new Set<() => void>()
	return {
		// `useSyncExternalStore` compares snapshots by identity: this must be a fresh object per update
		// and the *same* one between updates — building it inside `getSnapshot` would loop forever.
		set: (text: string, value: number) => {
			snapshot = { text, value }
			for (const listener of listeners) listener()
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => void listeners.delete(listener)
		},
		getSnapshot: () => snapshot,
	}
}

export const loadProgress = createProgressStore()

export const createEngineWorker = () => {
	const source = `
import { WebWorkerMLCEngineHandler } from "${CDN}@mlc-ai/web-llm";
export const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
`
	const blob = new Blob([source], { type: 'text/javascript' })
	return new Worker(URL.createObjectURL(blob), { type: 'module' })
}

export type Engine = {
	chat: { completions: { create: (request: unknown) => Promise<AsyncIterable<StreamChunk>> } }
	unload: () => Promise<void>
}

export type WebLlm = {
	CreateWebWorkerMLCEngine: (worker: Worker, id: string, options: object) => Promise<Engine>
}

/** esm.run has no types for web-llm, so the import is checked for the one export we call. */
export const isWebLlm = (module: unknown): module is WebLlm =>
	typeof module === 'object' &&
	module !== null &&
	'CreateWebWorkerMLCEngine' in module &&
	typeof module.CreateWebWorkerMLCEngine === 'function'

export type StreamChunk = {
	choices: { delta?: { content?: string } }[]
	usage?: { completion_tokens?: number; extra?: { decode_tokens_per_s?: number } }
}

export type ModelState = 'error' | 'idle' | 'loading' | 'ready'

export type Rejection = { reason: string; message: string }

// `loadEngine` and `streamFilters` live out here rather than inside `Root` so that React Compiler can
// compile the component. It does not yet support dynamic `import()`, `for await`, or `try/finally`, and
// a single unsupported construct disqualifies the whole component — including unrelated derived values,
// which then lose their memoization. Keeping the async work at module scope keeps `Root` compilable.
export const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export type LoadEngineHandlers = {
	id: string
	previous: Engine | null
	onLoaded: (engine: Engine, loadMs: number) => void
	onError: (message: string) => void
}

export const loadEngine = async ({ id, previous, onLoaded, onError }: LoadEngineHandlers) => {
	loadProgress.set('Starting…', 0)
	const started = performance.now()

	try {
		// A React state change does not guarantee a paint, and the frames immediately after this are
		// the contended ones. Without waiting, the overlay never reaches the screen: the page freezes
		// still looking fully interactive, which is precisely what reads as a crash.
		await nextPaint()
		await previous?.unload()
		const webllm: unknown = await import(/* @vite-ignore */ `${CDN}@mlc-ai/web-llm`)
		if (!isWebLlm(webllm)) throw new Error(`${CDN}@mlc-ai/web-llm has no CreateWebWorkerMLCEngine export`)
		const engine = await webllm.CreateWebWorkerMLCEngine(createEngineWorker(), id, {
			// WebLLM narrates every shard at INFO, and worker console output is proxied to the page's
			// main thread. WARN rather than SILENT so genuine failures still surface in the console.
			logLevel: 'WARN',
			initProgressCallback: (report: { text: string; progress: number }) =>
				loadProgress.set(report.text, report.progress),
		})
		onLoaded(engine, performance.now() - started)
	} catch (error) {
		onError(toErrorMessage(error))
	}
}

export type StreamResult =
	{ ok: false; message: string } | { ok: true; decodeMs: number; tokensPerSecond?: number; rejection: Rejection | null }

export const toRejection = (final: unknown): Rejection | null => {
	if (!R.isPlainObject(final) || final.ok !== false) return null
	return {
		reason: typeof final.reason === 'string' ? final.reason : 'off_domain',
		message: typeof final.message === 'string' ? final.message : '',
	}
}

export const streamFilters = async (
	engine: Engine,
	prompt: string,
	onProgress: (text: string, parsed: Record<string, unknown> | null) => void,
): Promise<StreamResult> => {
	const started = performance.now()

	try {
		const stream = await engine.chat.completions.create({
			stream: true,
			stream_options: { include_usage: true },
			messages: buildMessages(prompt),
			temperature: 0,
			max_tokens: 400,
			response_format: { type: 'json_object', schema: JSON.stringify({ anyOf: [acceptSchema, rejectSchema] }) },
		})

		let text = ''
		let tokensPerSecond: number | undefined

		for await (const chunk of stream) {
			text += chunk.choices[0]?.delta?.content ?? ''
			const parsed = repairJson(text)
			onProgress(text, R.isPlainObject(parsed) ? parsed : null)
			if (chunk.usage?.extra?.decode_tokens_per_s) tokensPerSecond = chunk.usage.extra.decode_tokens_per_s
		}

		return {
			ok: true,
			decodeMs: performance.now() - started,
			tokensPerSecond,
			rejection: toRejection(repairJson(text)),
		}
	} catch (error) {
		return { ok: false, message: toErrorMessage(error) }
	}
}
