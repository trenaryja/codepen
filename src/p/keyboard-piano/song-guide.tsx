import React from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import type { StepState } from './notes'
import type { ParsedSong } from './songs'

export function StepDisplay({
	chordProgress,
	songNoteToKey,
	songNoteToNote,
	state,
	step,
}: {
	chordProgress: Set<string>
	songNoteToKey: Record<string, string>
	songNoteToNote: Record<string, string>
	state: StepState
	step: string[]
}) {
	const keys = step.map((note) => songNoteToKey[note] ?? '?')
	const noteNames = step.map((note) => songNoteToNote[note] ?? note)
	const fade = state === 'played' ? 'opacity-30' : state === 'upcoming' ? 'opacity-70' : ''

	if (keys.length === 1)
		return (
			<span
				className={`inline-flex flex-col items-center transition-all duration-100 ${fade} ${state === 'current' ? 'text-primary scale-125 font-bold' : ''}`}
			>
				<span className='uppercase'>{keys[0]}</span>
				<span className='text-3xs opacity-50'>{noteNames[0]}</span>
			</span>
		)

	// Chords stack bottom-up, so the lowest note renders last
	const reversedNoteNames = noteNames.toReversed()

	return (
		<span
			className={`inline-flex flex-col items-center rounded px-0.5 leading-tight transition-all duration-100 ${fade} ${
				state === 'current'
					? 'border-primary scale-110 border-l-2 pl-1'
					: state === 'upcoming'
						? 'border-l-2 border-current/20 pl-1'
						: ''
			}`}
		>
			{keys.toReversed().map((key, i) => (
				<span
					key={key}
					className={`font-mono text-sm uppercase ${
						state === 'current' ? (chordProgress.has(key) ? 'text-success font-bold' : 'text-primary font-bold') : ''
					}`}
				>
					{key}
					<span className='text-3xs ml-0.5 normal-case opacity-50'>{reversedNoteNames[i]}</span>
				</span>
			))}
		</span>
	)
}

export function SongGuide({
	chordProgress,
	name,
	onNext,
	onPrev,
	onReset,
	song,
	songNoteToKey,
	songNoteToNote,
	songPosition,
}: {
	chordProgress: Set<string>
	name: string
	onNext: () => void
	onPrev: () => void
	onReset: () => void
	song: ParsedSong
	songNoteToKey: Record<string, string>
	songNoteToNote: Record<string, string>
	songPosition: number
}) {
	return (
		<div className='surface surface-base-200 w-full max-w-2xl space-y-3 p-4'>
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<button type='button' onClick={onPrev} className='btn btn-xs'>
						‹
					</button>
					<button type='button' onClick={onNext} className='btn btn-xs'>
						›
					</button>
					<h2 className='font-bold'>{name}</h2>
				</div>
				<button type='button' onClick={onReset} className='btn btn-xs btn-ghost opacity-60'>
					reset
				</button>
			</div>

			<div className='flex flex-wrap items-center gap-x-1 gap-y-2 font-mono text-lg leading-relaxed'>
				{song.phrases.map((phrase, phraseIndex) => (
					<span key={`p${String(phraseIndex)}`} className='inline-flex items-center gap-x-1'>
						{phrase.map((step, stepIndex) => {
							const absoluteIndex = R.sumBy(song.phrases.slice(0, phraseIndex), (x) => x.length) + stepIndex
							const state =
								absoluteIndex === songPosition ? 'current' : absoluteIndex < songPosition ? 'played' : 'upcoming'

							return (
								<StepDisplay
									key={`${String(phraseIndex)}-${String(stepIndex)}`}
									step={step}
									state={state}
									chordProgress={chordProgress}
									songNoteToKey={songNoteToKey}
									songNoteToNote={songNoteToNote}
								/>
							)
						})}
						{phraseIndex < song.phrases.length - 1 && <span className='mx-1 opacity-20'>·</span>}
					</span>
				))}
			</div>

			<p className='text-xs opacity-40'>
				{songPosition} / {song.steps.length} steps
			</p>
		</div>
	)
}
