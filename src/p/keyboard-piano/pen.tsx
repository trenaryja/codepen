import { useElementSize } from 'https://esm.sh/@mantine/hooks'
import { css, ThemePicker, ThemeProvider, toast, Toaster } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useEffectEvent, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'

type NoteConfig = { black?: boolean; frequency: number; key: string; note: string }

type ChromaticNote = { black: boolean; frequency: number; note: string }

type StepState = 'current' | 'played' | 'upcoming'

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const ALL_NOTES: ChromaticNote[] = []

for (let octave = 1; octave <= 8; octave++) {
	for (const name of CHROMATIC) {
		if (octave === 8 && name !== 'C') break
		// Equal temperament off A4 = 440 Hz; index 9 of CHROMATIC is 'A'
		const semitones = (octave - 4) * 12 + (CHROMATIC.indexOf(name) - 9)

		ALL_NOTES.push({
			note: `${name}${String(octave)}`,
			frequency: 440 * 2 ** (semitones / 12),
			black: name.includes('#'),
		})
	}
}

// Home row = white keys, top row = black keys (spatially matched to QWERTY stagger)
const HOME_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"]
// Top-row key between home key i and i+1 (maps to the sharp between those white notes)
const SLOT_KEYS = ['w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']']
const MAX_WHITE_COUNT = HOME_KEYS.length
const MIN_KEY_WIDTH_REM = 3
const REM_PX = typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 16

function maxOffset(whiteCount: number) {
	for (let i = ALL_NOTES.length - 1; i >= 0; i--) {
		const whites = ALL_NOTES.slice(i).filter((note) => !note.black).length

		if (whites >= whiteCount) return i
	}

	return 0
}

const NOTE_INDEX: Record<string, number> = Object.fromEntries(ALL_NOTES.map((note, i) => [note.note, i]))
const DEFAULT_OFFSET = ALL_NOTES.findIndex((note) => note.note === 'C4')

// Song encoding: "C4 D4 [C4 E4 G4]|F4" — brackets group a chord, pipes split phrases.
// A step is one array of note names: ['C4'] for a single note, ['C4','E4','G4'] for a chord.
type ParsedSong = { phrases: string[][][]; steps: string[][] }

function parsePhrase(phrase: string) {
	const steps: string[][] = []
	let i = 0

	while (i < phrase.length) {
		if (phrase[i] === ' ') {
			i += 1
			continue
		}

		if (phrase[i] === '[') {
			const end = phrase.indexOf(']', i)

			steps.push(
				phrase
					.slice(i + 1, end)
					.trim()
					.split(/\s+/),
			)
			i = end + 1
		} else {
			let end = i

			while (end < phrase.length && phrase[end] !== ' ' && phrase[end] !== '[') end += 1
			steps.push([phrase.slice(i, end)])
			i = end
		}
	}

	return steps
}

function parseSong(data: string) {
	const phrases = data.split('|').map((phrase) => parsePhrase(phrase.trim()))

	return { phrases, steps: phrases.flat() }
}

const SONGS: Record<string, string> = {
	'Mary Had a Little Lamb': 'E4 D4 C4 D4 E4 E4 E4|D4 D4 D4|E4 G4 G4|E4 D4 C4 D4 E4 E4 E4|E4 D4 D4 E4 D4 C4',
	'Twinkle Twinkle Little Star':
		'C4 C4 G4 G4 A4 A4 G4|F4 F4 E4 E4 D4 D4 C4|G4 G4 F4 F4 E4 E4 D4|G4 G4 F4 F4 E4 E4 D4|C4 C4 G4 G4 A4 A4 G4|F4 F4 E4 E4 D4 D4 C4',
	'Hot Cross Buns': 'E4 D4 C4|E4 D4 C4|C4 C4 D4 D4 E4 D4 C4',
	'Ode to Joy': 'E4 E4 F4 G4 G4 F4 E4 D4|C4 C4 D4 E4 E4 D4 D4|E4 E4 F4 G4 G4 F4 E4 D4|C4 C4 D4 E4 D4 C4 C4',
	'Jingle Bells (Chorus)': 'E4 E4 E4|E4 E4 E4|E4 G4 C4 D4 E4|F4 F4 F4 F4 F4 E4 E4 E4|E4 D4 D4 E4 D4 G4',
	'Chord Progression (I–IV–V–I)': '[C4 E4 G4] [C4 E4 G4]|[C4 F4 A4] [C4 F4 A4]|[D4 G4 B4] [D4 G4 B4]|[C4 E4 G4]',
}

const SONG_NAMES = Object.keys(SONGS)

function playNote(audioContext: AudioContext, frequency: number) {
	const oscillator = audioContext.createOscillator()
	const gain = audioContext.createGain()

	oscillator.connect(gain)
	gain.connect(audioContext.destination)
	oscillator.frequency.value = frequency
	oscillator.type = 'sine'
	gain.gain.setValueAtTime(0.3, audioContext.currentTime)
	// exponentialRampToValueAtTime cannot target 0, so decay to a near-silent floor instead
	gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8)
	oscillator.start(audioContext.currentTime)
	oscillator.stop(audioContext.currentTime + 0.8)
}

function PianoKey({
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
			className={`surface select-none cursor-pointer transition-all duration-100 flex flex-col items-end justify-end ${
				note.black ? 'absolute z-10 w-(--black-key-width) h-[60%] top-0' : 'relative size-full'
			} ${active ? 'surface-primary' : inactiveClass}`}
		>
			<kbd className={`kbd uppercase ${note.black ? 'kbd-xs' : 'kbd-sm'}`}>{note.key}</kbd>
			<span className={`opacity-50 ${note.black ? 'text-3xs px-1' : 'text-xs px-2 pb-1'}`}>{note.note}</span>
		</button>
	)
}

function Piano({
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
			className='relative w-full max-w-2xl h-[clamp(8rem,25vw,20rem)]'
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
			{black
				.filter((note) => note.key in blackPositions)
				.map((note) => (
					<PianoKey
						key={note.note}
						note={note}
						active={activeKeys.has(note.key)}
						onPress={() => onTrigger(note.key, note.frequency)}
						style={{ left: `calc(${((blackPositions[note.key]! + 1) / white.length) * 100}% - 4%)` }}
					/>
				))}
		</div>
	)
}

function StepDisplay({
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

	if (keys.length === 1) {
		return (
			<span
				className={`inline-flex flex-col items-center transition-all duration-100 ${fade} ${state === 'current' ? 'text-primary font-bold scale-125' : ''}`}
			>
				<span className='uppercase'>{keys[0]}</span>
				<span className='text-3xs opacity-50'>{noteNames[0]}</span>
			</span>
		)
	}

	// Chords stack bottom-up, so the lowest note renders last
	const reversedNoteNames = [...noteNames].reverse()

	return (
		<span
			className={`inline-flex flex-col items-center rounded px-0.5 leading-tight transition-all duration-100 ${fade} ${
				state === 'current'
					? 'border-l-2 border-primary pl-1 scale-110'
					: state === 'upcoming'
						? 'border-l-2 border-current/20 pl-1'
						: ''
			}`}
		>
			{[...keys].reverse().map((key, i) => (
				<span
					key={key}
					className={`uppercase text-sm font-mono ${
						state === 'current' ? (chordProgress.has(key) ? 'text-success font-bold' : 'text-primary font-bold') : ''
					}`}
				>
					{key}
					<span className='text-3xs opacity-50 normal-case ml-0.5'>{reversedNoteNames[i]}</span>
				</span>
			))}
		</span>
	)
}

function SongGuide({
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
	const offsets = song.phrases.map((_, i) => song.phrases.slice(0, i).reduce((sum, phrase) => sum + phrase.length, 0))

	return (
		<div className='surface surface-base-200 p-4 w-full max-w-2xl space-y-3'>
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

			<div className='font-mono text-lg flex flex-wrap items-center gap-x-1 gap-y-2 leading-relaxed'>
				{song.phrases.map((phrase, phraseIndex) => (
					<span key={`p${String(phraseIndex)}`} className='inline-flex items-center gap-x-1'>
						{phrase.map((step, stepIndex) => {
							const absoluteIndex = offsets[phraseIndex]! + stepIndex // offsets has one entry per phrase
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
						{phraseIndex < song.phrases.length - 1 && <span className='opacity-20 mx-1'>·</span>}
					</span>
				))}
			</div>

			<p className='text-xs opacity-40'>
				{songPosition} / {song.steps.length} steps
			</p>
		</div>
	)
}

function resetChord(ref: React.RefObject<Set<string>>, setter: (chord: Set<string>) => void) {
	ref.current = new Set()
	setter(new Set())
}

function useVisibleNotes(whiteCount: number) {
	const [offset, setOffset] = useState(DEFAULT_OFFSET)

	const count = Math.max(1, Math.min(whiteCount, MAX_WHITE_COUNT))

	// Key assignment starts from a white key, so skip any black key sitting at the offset
	let start = offset
	while (start < ALL_NOTES.length && ALL_NOTES[start]!.black) start += 1

	const visible: ChromaticNote[] = []
	let whitesFound = 0
	let index = start

	while (whitesFound < count && index < ALL_NOTES.length) {
		const note = ALL_NOTES[index]! // while-guard: index < ALL_NOTES.length
		visible.push(note)
		if (!note.black) whitesFound += 1
		index += 1
	}

	// Trailing black key fills the top-row slot past the last white key
	if (index < ALL_NOTES.length && ALL_NOTES[index]!.black) visible.push(ALL_NOTES[index]!)

	let whiteIndex = 0
	const notes: NoteConfig[] = visible.map((note) => {
		if (!note.black) {
			const key = HOME_KEYS[whiteIndex]! // count ≤ MAX_WHITE_COUNT = HOME_KEYS.length
			whiteIndex += 1
			return { ...note, key }
		}

		return { ...note, key: SLOT_KEYS[whiteIndex - 1]! } // blacks always follow a white, so whiteIndex ≥ 1
	})

	const white = notes.filter((note) => !note.black)
	const black = notes.filter((note) => note.black)
	const noteToKey = R.fromEntries(notes.map((note) => [note.note, note.key] as const))

	const blackPositions: Record<string, number> = {}

	for (const blackNote of black) {
		const blackIndex = notes.indexOf(blackNote)
		const previousWhite = notes
			.slice(0, blackIndex)
			.reverse()
			.find((note) => !note.black)

		if (previousWhite) blackPositions[blackNote.key] = white.indexOf(previousWhite)
	}

	const handleWheel = (e: WheelEvent) => {
		const direction = e.deltaY > 0 ? -1 : 1
		setOffset((prev) => Math.max(0, Math.min(maxOffset(count), prev + direction)))
	}

	const firstNote = notes[0]?.note ?? ''
	const lastNote = notes[notes.length - 1]?.note ?? ''

	return { black, blackPositions, firstNote, handleWheel, lastNote, noteToKey, notes, white }
}

function getSongKeyMap(song: ParsedSong, notes: NoteConfig[], noteToKey: Record<string, string>) {
	const allSongNotes = song.steps.flat()
	const empty: { toKey: Record<string, string>; toNote: Record<string, string> } = { toKey: {}, toNote: {} }

	if (allSongNotes.length === 0) return empty

	const uniqueSongNotes = new Set(allSongNotes).values().toArray()
	const songIndices = uniqueSongNotes
		.map((note) => NOTE_INDEX[note])
		.filter((index): index is number => index !== undefined)

	if (songIndices.length === 0) return empty

	const visibleNoteSet = new Set(notes.map((note) => note.note))

	// Try every octave shift (-8 to +8) and pick the first where ALL song notes land on visible keys
	for (let octaveShift = -8; octaveShift <= 8; octaveShift += 1) {
		const shift = octaveShift * 12
		const allFit = uniqueSongNotes.every((note) => {
			const index = NOTE_INDEX[note]

			if (index === undefined) return false

			const transposed = ALL_NOTES[index + shift]

			return transposed && visibleNoteSet.has(transposed.note)
		})

		if (allFit) {
			const toKey: Record<string, string> = {}
			const toNote: Record<string, string> = {}

			for (const note of uniqueSongNotes) {
				// allFit verified every note has an index and transposes onto a visible key
				const transposed = ALL_NOTES[NOTE_INDEX[note]! + shift]!

				toKey[note] = noteToKey[transposed.note] ?? '?'
				toNote[note] = transposed.note
			}

			return { toKey, toNote }
		}
	}

	// No perfect fit — fall back to closest octave shift and show ? for missing notes
	const lowestSongIndex = Math.min(...songIndices)
	const lowestVisibleIndex = Math.min(...notes.map((note) => NOTE_INDEX[note.note]!)) // every visible note is in NOTE_INDEX
	const bestShift = Math.round((lowestVisibleIndex - lowestSongIndex) / 12) * 12

	const toKey: Record<string, string> = {}
	const toNote: Record<string, string> = {}

	for (const note of uniqueSongNotes) {
		const index = NOTE_INDEX[note]

		if (index === undefined) continue

		const transposed = ALL_NOTES[index + bestShift]

		toKey[note] = transposed ? (noteToKey[transposed.note] ?? '?') : '?'
		toNote[note] = transposed ? transposed.note : note
	}

	return { toKey, toNote }
}

function Root() {
	const audioContextRef = useRef<AudioContext | null>(null)
	const { ref: pianoContainerRef, width: pianoWidth } = useElementSize<HTMLDivElement>()
	const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set())
	const [songIndex, setSongIndex] = useState(0)
	const [songPosition, setSongPosition] = useState(0)
	const [chordProgress, setChordProgress] = useState<Set<string>>(() => new Set())
	const chordRef = useRef<Set<string>>(new Set())

	const whiteCount = pianoWidth ? Math.floor(pianoWidth / (MIN_KEY_WIDTH_REM * REM_PX)) : MAX_WHITE_COUNT
	const { black, blackPositions, firstNote, handleWheel, lastNote, noteToKey, notes, white } =
		useVisibleNotes(whiteCount)

	const songName = SONG_NAMES[songIndex]! // songIndex cycles within SONG_NAMES.length
	const song = parseSong(SONGS[songName]!)
	const songKeyMap = getSongKeyMap(song, notes, noteToKey)

	// Browsers only let an AudioContext start from a user gesture, so create it lazily on first note
	const getAudioContext = () => {
		audioContextRef.current ??= new AudioContext()
		audioContextRef.current.resume()
		return audioContextRef.current
	}

	const triggerNote = (key: string, frequency: number) => {
		playNote(getAudioContext(), frequency)
		setActiveKeys((prev) => new Set(prev).add(key))
		setTimeout(
			() =>
				setActiveKeys((prev) => {
					const next = new Set(prev)

					next.delete(key)
					return next
				}),
			150,
		)

		setSongPosition((prev) => {
			if (prev >= song.steps.length) return prev
			const stepKeys = song.steps[prev]!.map((note) => songKeyMap.toKey[note] ?? '?') // guarded: prev < song.steps.length

			if (stepKeys.length === 1) {
				if (key !== stepKeys[0]) return prev
				resetChord(chordRef, setChordProgress)
			} else {
				if (!stepKeys.includes(key)) return prev
				chordRef.current.add(key)
				const updated = new Set(chordRef.current)

				setChordProgress(updated)

				// Hold the position until every note of the chord has been struck
				if (!stepKeys.every((stepKey) => updated.has(stepKey))) return prev
				resetChord(chordRef, setChordProgress)
			}

			const next = prev + 1

			if (next >= song.steps.length) {
				toast.success(`Nice! You played ${songName}`)
				setTimeout(() => {
					setSongPosition(0)
					resetChord(chordRef, setChordProgress)
				}, 2000)
			}

			return next
		})
	}

	const cycleSong = (direction: number) => {
		setSongIndex((prev) => (prev + direction + SONG_NAMES.length) % SONG_NAMES.length)
		setSongPosition(0)
		resetChord(chordRef, setChordProgress)
	}

	const onKey = useEffectEvent((e: KeyboardEvent) => {
		if (e.repeat) return
		const found = notes.find((note) => note.key === e.key.toLowerCase())

		if (found) {
			e.preventDefault()
			triggerNote(found.key, found.frequency)
		}
	})

	useEffect(() => {
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	return (
		<ThemeProvider>
			<Toaster />
			<main className='min-h-screen flex flex-col items-center'>
				<div className='flex-1 flex flex-col items-center justify-center gap-8 p-6 pb-0'>
					<div className='flex items-center gap-2'>
						<h1 className='text-3xl font-bold tracking-tight'>Keyboard Piano</h1>
						<ThemePicker variant='modal' />
					</div>

					<SongGuide
						name={songName}
						song={song}
						songPosition={songPosition}
						chordProgress={chordProgress}
						songNoteToKey={songKeyMap.toKey}
						songNoteToNote={songKeyMap.toNote}
						onReset={() => {
							setSongPosition(0)
							resetChord(chordRef, setChordProgress)
						}}
						onPrev={() => cycleSong(-1)}
						onNext={() => cycleSong(1)}
					/>
				</div>

				<div className='sticky bottom-0 w-full flex flex-col items-center gap-1 p-6 pt-4 bg-base-100/80 backdrop-blur-sm'>
					<p className='opacity-60 text-sm text-center flex flex-wrap items-center justify-center gap-1'>
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
					<p className='text-xs opacity-40 text-center'>
						{firstNote} — {lastNote} · scroll to transpose
					</p>
					<div ref={pianoContainerRef} className='w-full max-w-2xl'>
						<Piano
							white={white}
							black={black}
							blackPositions={blackPositions}
							activeKeys={activeKeys}
							onTrigger={triggerNote}
							onWheel={handleWheel}
						/>
					</div>
				</div>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
