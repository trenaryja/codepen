import { css } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useRef } from 'https://esm.sh/react'
import type { NoteConfig } from './notes'

export function PianoKey({
	active,
	note,
	onPress,
	style,
}: {
	active: boolean
	note: NoteConfig
	onPress: () => void
	style?: React.CSSProperties
}) {
	const inactiveClass = note.black ? 'surface-base-content text-base-300' : 'surface-base-300 text-base-content'

	return (
		<button
			type='button'
			onPointerDown={onPress}
			style={style}
			className={`surface flex cursor-pointer flex-col items-end justify-end transition-all duration-100 select-none ${
				note.black ? 'absolute top-0 z-10 h-[60%] w-(--black-key-width)' : 'relative size-full'
			} ${active ? 'surface-primary' : inactiveClass}`}
		>
			<kbd className={`kbd uppercase ${note.black ? 'kbd-xs' : 'kbd-sm'}`}>{note.key}</kbd>
			<span className={`opacity-50 ${note.black ? 'text-3xs px-1' : 'px-2 pb-1 text-xs'}`}>{note.note}</span>
		</button>
	)
}

export function Piano({
	activeKeys,
	black,
	blackPositions,
	onTrigger,
	onWheel,
	white,
}: {
	activeKeys: Set<string>
	black: NoteConfig[]
	blackPositions: Record<string, number>
	onTrigger: (key: string, frequency: number) => void
	onWheel: (e: WheelEvent) => void
	white: NoteConfig[]
}) {
	const pianoRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const element = pianoRef.current
		if (!element) return

		const handler = (e: WheelEvent) => {
			e.preventDefault()
			onWheel(e)
		}

		// React's onWheel is registered passively, so preventDefault needs a manual listener
		element.addEventListener('wheel', handler, { passive: false })
		return () => element.removeEventListener('wheel', handler)
	}, [onWheel])

	return (
		<div
			ref={pianoRef}
			className='relative h-[clamp(8rem,25vw,20rem)] w-full max-w-2xl'
			style={css({ '--black-key-width': `${(70 / white.length).toFixed(1)}%` })}
		>
			<div className='grid h-full' style={{ gridTemplateColumns: `repeat(${white.length}, 1fr)`, gap: '2px' }}>
				{white.map((note) => (
					<PianoKey
						key={note.note}
						note={note}
						active={activeKeys.has(note.key)}
						onPress={() => onTrigger(note.key, note.frequency)}
					/>
				))}
			</div>
			{black.flatMap((note) => {
				const position = blackPositions[note.key]
				if (position === undefined) return []
				return (
					<PianoKey
						key={note.note}
						note={note}
						active={activeKeys.has(note.key)}
						onPress={() => onTrigger(note.key, note.frequency)}
						style={{ left: `calc(${((position + 1) / white.length) * 100}% - 4%)` }}
					/>
				)
			})}
		</div>
	)
}

export type PianoDockProps = {
	activeKeys: Set<string>
	black: NoteConfig[]
	blackPositions: Record<string, number>
	containerRef: React.Ref<HTMLDivElement>
	firstNote: string
	lastNote: string
	onTrigger: (key: string, frequency: number) => void
	onWheel: (e: WheelEvent) => void
	white: NoteConfig[]
}

// The bar pinned to the bottom of the viewport: which computer key plays what, the audible range, and the keys
export function PianoDock({
	activeKeys,
	black,
	blackPositions,
	containerRef,
	firstNote,
	lastNote,
	onTrigger,
	onWheel,
	white,
}: PianoDockProps) {
	return (
		<div className='bg-base-100/80 sticky bottom-0 flex w-full flex-col items-center gap-1 p-6 pt-4 backdrop-blur-sm'>
			<p className='flex flex-wrap items-center justify-center gap-1 text-center text-sm opacity-60'>
				<span>White:</span>
				{white.map((note) => (
					<kbd key={note.note} className='kbd kbd-sm'>
						{note.key.toUpperCase()}
					</kbd>
				))}
				<span>· Black:</span>
				{black.map((note) => (
					<kbd key={note.note} className='kbd kbd-sm'>
						{note.key.toUpperCase()}
					</kbd>
				))}
			</p>
			<p className='text-center text-xs opacity-40'>
				{firstNote} — {lastNote} · scroll to transpose
			</p>
			<div ref={containerRef} className='w-full max-w-2xl'>
				<Piano
					white={white}
					black={black}
					blackPositions={blackPositions}
					activeKeys={activeKeys}
					onTrigger={onTrigger}
					onWheel={onWheel}
				/>
			</div>
		</div>
	)
}
