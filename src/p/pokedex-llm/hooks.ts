import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { z } from 'https://esm.sh/zod'
import type { Engine, ModelState } from './engine'
import { MODELS, loadEngine, toErrorMessage } from './engine'
import type { Mon } from './fields'
import { DATA_URL } from './fields'
import { computeRangeStats, deriveMon, rawMonSchema } from './rows'

export type Timing = { load?: number; decode?: number; tokensPerSecond?: number }

/** One fetch, one derive, one pass to fill `RANGE_STATS` — everything else reads the result. */
export const usePokedexRows = () => {
	const [rows, setRows] = useState<Mon[]>([])
	const [loadError, setLoadError] = useState<string | null>(null)

	useEffect(() => {
		const controller = new AbortController()
		fetch(DATA_URL, { signal: controller.signal })
			.then((response) => response.json())
			.then((json) => {
				const parsed = z.array(rawMonSchema).safeParse(json)
				if (!parsed.success) throw new Error(`${DATA_URL}: ${z.prettifyError(parsed.error)}`)
				const derived = parsed.data.map(deriveMon)
				computeRangeStats(derived)
				setRows(derived)
			})
			.catch((error: unknown) => {
				if (!controller.signal.aborted) setLoadError(toErrorMessage(error))
			})
		return () => controller.abort()
	}, [])

	return { rows, loadError }
}

/** The WebLLM engine's whole lifecycle: which model, how far along, and how long it took. */
export const useEngine = () => {
	const engineRef = useRef<Engine | null>(null)
	// Bumped the moment a load starts, so anything still streaming off the outgoing engine is stale.
	const runIdRef = useRef(0)
	const [modelId, setModelId] = useState<string>(MODELS[1].id)
	const [modelState, setModelState] = useState<ModelState>('idle')
	const [modelError, setModelError] = useState('')
	const [timing, setTiming] = useState<Timing>({})

	const loadModel = (id: string) => {
		runIdRef.current += 1
		setModelState('loading')
		void loadEngine({
			id,
			engineRef,
			onLoaded: (loadMs) => {
				setTiming({ load: loadMs })
				setModelState('ready')
			},
			onError: (message) => {
				setModelError(message)
				setModelState('error')
			},
		})
	}

	const selectModel = (id: string) => {
		setModelId(id)
		// Already running one? Swap immediately. Otherwise the Enable button starts it.
		if (modelState === 'ready') loadModel(id)
	}

	return { engineRef, runIdRef, modelId, modelState, modelError, timing, setTiming, loadModel, selectModel }
}
