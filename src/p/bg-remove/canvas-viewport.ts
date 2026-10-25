import React, { useRef, useState } from 'https://esm.sh/react'

export function useCanvasViewport() {
	const [zoom, setZoom] = useState(1)
	const [pan, setPan] = useState({ x: 0, y: 0 })
	const panningRef = useRef(false)
	const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault()
		const delta = e.deltaY > 0 ? 0.9 : 1.1
		setZoom((current) => Math.min(20, Math.max(0.5, current * delta)))
	}

	const startPan = (clientX: number, clientY: number) => {
		panningRef.current = true
		panStartRef.current = { x: clientX, y: clientY, panX: pan.x, panY: pan.y }
	}

	const movePan = (clientX: number, clientY: number) => {
		setPan({
			x: panStartRef.current.panX + (clientX - panStartRef.current.x),
			y: panStartRef.current.panY + (clientY - panStartRef.current.y),
		})
	}

	/** Ends a pan if one was in flight; the boolean says whether it swallowed the gesture. */
	const endPan = () => {
		if (!panningRef.current) return false
		panningRef.current = false
		return true
	}

	const reset = () => {
		setZoom(1)
		setPan({ x: 0, y: 0 })
	}

	return { zoom, pan, panningRef, handleWheel, startPan, movePan, endPan, reset }
}
