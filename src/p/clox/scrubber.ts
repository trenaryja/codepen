import { useEffect, useRef } from 'https://esm.sh/react'
import { DAY, HOUR, QUARTER_HOUR, localMs } from './time'

type ScrubberInput = {
	now: number
	instant: number
	referenceTimeZone: string
	searchOpen: boolean
	onScrub: (instant: number | null) => void
	onCloseSearch: () => void
}

// How the instant moves: a 300ms ease to wherever you asked for. Arrows walk 15-min boundaries of the
// reference zone's wall time (shift = hours), n = back to now, esc closes search — or clears the scrub.
// The keydown listener registers once and an animation outlives the render that started it, so both read
// live props out of a ref rather than out of a closure.
export const useScrubber = ({ now, instant, referenceTimeZone, searchOpen, onScrub, onCloseSearch }: ScrubberInput) => {
	const stateRef = useRef({ now, instant, searchOpen, referenceTimeZone, onScrub, onCloseSearch })
	useEffect(() => {
		stateRef.current = { now, instant, searchOpen, referenceTimeZone, onScrub, onCloseSearch }
	})

	const animationRef = useRef(0)
	// where the last scrub is headed — arrow walks step from here, not the mid-animation instant
	const scrubTargetRef = useRef<number | null>(null)

	// everything the animation needs already lives in a ref, so one instance serves every render —
	// which is what lets the keydown listener below register once
	const animateRef = useRef((target: number | null) => {
		scrubTargetRef.current = target
		cancelAnimationFrame(animationRef.current)
		const from = stateRef.current.instant
		const start = performance.now()

		const step = (frameTime: number) => {
			const t = Math.min(1, (frameTime - start) / 300)
			const goal = target ?? stateRef.current.now
			stateRef.current.onScrub(t < 1 ? from + (goal - from) * (1 - (1 - t) ** 3) : target)
			if (t < 1) animationRef.current = requestAnimationFrame(step)
		}

		animationRef.current = requestAnimationFrame(step)
	})

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const animateTo = animateRef.current
			if (event.key === 'Escape')
				return stateRef.current.searchOpen ? void stateRef.current.onCloseSearch() : void animateTo(null)
			if (event.target instanceof HTMLElement && event.target.closest('input')) return
			if (event.key === 'n') return void animateTo(null)
			if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
			if (event.metaKey || event.ctrlKey || event.altKey) return // leave history-back and desktop-switch alone
			event.preventDefault() // bare arrows would scroll the page
			const step = event.shiftKey ? HOUR : QUARTER_HOUR
			const forward = event.key === 'ArrowRight'
			const base = scrubTargetRef.current ?? stateRef.current.instant
			const local = localMs(stateRef.current.referenceTimeZone, base)
			// off a boundary walks to the nearest one in that direction; on one, a full step
			const target = (forward ? Math.floor(local / step + 1) : Math.ceil(local / step - 1)) * step
			animateTo(base + target - local)
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const animateTo = (target: number | null) => animateRef.current(target)

	const scrubToWall = (timeZone: string, candidates: number[]) => {
		const current = (localMs(timeZone, stateRef.current.instant) % DAY) / 60_000
		// wrap each candidate into the nearest ±12h so "9am" never scrubs the long way round
		const nearest = candidates
			.map((minutes) => ((minutes - current + 2160) % 1440) - 720)
			.reduce((best, delta) => (Math.abs(delta) < Math.abs(best) ? delta : best))
		animateTo(stateRef.current.instant + nearest * 60_000)
	}

	return { animateTo, scrubToWall }
}
