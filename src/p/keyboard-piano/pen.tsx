import { ThemePicker, ThemeProvider, toast, Toaster } from 'https://esm.sh/@trenaryja/ui'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

// Audio engine from gabrycina & claude opus — github.com/gabrycina/hear-yourself

type NoteConfig = { black?: boolean; freq: number; key: string; note: string }

type ChromaticNote = { black: boolean; freq: number; note: string }

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const ALL_NOTES: ChromaticNote[] = []

for (let oct = 1; oct <= 8; oct++) {
	for (const name of CHROMATIC) {
		if (oct === 8 && name !== 'C') break
		const semitones = (oct - 4) * 12 + (CHROMATIC.indexOf(name) - 9)

		ALL_NOTES.push({
			note: `${name}${String(oct)}`,
			freq: 440 * 2 ** (semitones / 12),
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
		const whites = ALL_NOTES.slice(i).filter((n) => !n.black).length

		if (whites >= whiteCount) return i
	}

	return 0
}

const NOTE_INDEX: Record<string, number> = Object.fromEntries(ALL_NOTES.map((n, i) => [n.note, i]))
const DEFAULT_OFFSET = ALL_NOTES.findIndex((n) => n.note === 'C4')

// Song step = note name array. Single: ["C4"], chord: ["C4","E4","G4"]
// Encoding: "C4 D4 [C4 E4 G4]|F4" — brackets=chords, pipes=phrases
type ParsedSong = { phrases: string[][][]; steps: string[][] }

type SongDef = { data: string; format: 'keys' | 'notes' }

function parsePhraseStr(phrase: string, resolve: (t: string) => string): string[][] {
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
					.split(/\s+/)
					.map(resolve),
			)
			i = end + 1
		} else {
			let end = i

			while (end < phrase.length && phrase[end] !== ' ' && phrase[end] !== '[') end += 1
			steps.push([resolve(phrase.slice(i, end))])
			i = end
		}
	}

	return steps
}

function parseSong(def: SongDef, keyToNote: Record<string, string>): ParsedSong {
	const resolve = def.format === 'keys' ? (t: string) => keyToNote[t] ?? t : (t: string) => t
	const phrases = def.data.split('|').map((p) => parsePhraseStr(p.trim(), resolve))

	return { phrases, steps: phrases.flat() }
}

const SONGS: Record<string, SongDef> = {
	'Mary Had a Little Lamb': {
		format: 'notes',
		data: 'E4 D4 C4 D4 E4 E4 E4|D4 D4 D4|E4 G4 G4|E4 D4 C4 D4 E4 E4 E4|E4 D4 D4 E4 D4 C4',
	},
	'Twinkle Twinkle Little Star': {
		format: 'notes',
		data: 'C4 C4 G4 G4 A4 A4 G4|F4 F4 E4 E4 D4 D4 C4|G4 G4 F4 F4 E4 E4 D4|G4 G4 F4 F4 E4 E4 D4|C4 C4 G4 G4 A4 A4 G4|F4 F4 E4 E4 D4 D4 C4',
	},
	'Hot Cross Buns': {
		format: 'notes',
		data: 'E4 D4 C4|E4 D4 C4|C4 C4 D4 D4 E4 D4 C4',
	},
	'Ode to Joy': {
		format: 'notes',
		data: 'E4 E4 F4 G4 G4 F4 E4 D4|C4 C4 D4 E4 E4 D4 D4|E4 E4 F4 G4 G4 F4 E4 D4|C4 C4 D4 E4 D4 C4 C4',
	},
	'Jingle Bells (Chorus)': {
		format: 'notes',
		data: 'E4 E4 E4|E4 E4 E4|E4 G4 C4 D4 E4|F4 F4 F4 F4 F4 E4 E4 E4|E4 D4 D4 E4 D4 G4',
	},
	'Chord Progression (I–IV–V–I)': {
		format: 'notes',
		data: '[C4 E4 G4] [C4 E4 G4]|[C4 F4 A4] [C4 F4 A4]|[D4 G4 B4] [D4 G4 B4]|[C4 E4 G4]',
	},
}

const SONG_NAMES = Object.keys(SONGS)

function playNote(ctx: AudioContext, freq: number) {
	const osc = ctx.createOscillator()
	const gain = ctx.createGain()

	osc.connect(gain)
	gain.connect(ctx.destination)
	osc.frequency.value = freq
	osc.type = 'sine'
	gain.gain.setValueAtTime(0.3, ctx.currentTime)
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
	osc.start(ctx.currentTime)
	osc.stop(ctx.currentTime + 0.8)
}

function PianoKey({
	n,
	active,
	onPress,
	style,
}: {
	active: boolean
	n: NoteConfig
	onPress: () => void
	style?: React.CSSProperties
}) {
	const inactiveClass = n.black ? 'surface-base-content text-base-300' : 'surface-base-300 text-base-content'

	return (
		<button
			type='button'
			onPointerDown={onPress}
			style={style}
			className={`surface select-none cursor-pointer transition-all duration-100 flex flex-col items-end justify-end ${
				n.black ? 'absolute z-10 w-(--black-key-w) h-[60%] top-0' : 'relative size-full'
			} ${active ? 'surface-primary' : inactiveClass}`}
		>
			<kbd className={`kbd uppercase ${n.black ? 'kbd-xs' : 'kbd-sm'}`}>{n.key}</kbd>
			<span className={`opacity-50 ${n.black ? 'text-3xs px-1' : 'text-xs px-2 pb-1'}`}>{n.note}</span>
		</button>
	)
}

function Piano({
	activeKeys,
	black,
	blackPos,
	onTrigger,
	onWheel,
	white,
}: {
	activeKeys: Set<string>
	black: NoteConfig[]
	blackPos: Record<string, number>
	onTrigger: (key: string, freq: number) => void
	onWheel: (e: React.WheelEvent) => void
	white: NoteConfig[]
}) {
	const pianoRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = pianoRef.current
		if (!el) return

		const handler = (e: WheelEvent) => {
			e.preventDefault()
			onWheel(e as unknown as React.WheelEvent)
		}

		el.addEventListener('wheel', handler, { passive: false })
		return () => el.removeEventListener('wheel', handler)
	}, [onWheel])

	return (
		<div
			ref={pianoRef}
			className='relative w-full max-w-2xl h-[clamp(8rem,25vw,20rem)]'
			style={{ '--black-key-w': `${(70 / white.length).toFixed(1)}%` } as React.CSSProperties}
		>
			<div className='grid h-full' style={{ gridTemplateColumns: `repeat(${white.length}, 1fr)`, gap: '2px' }}>
				{white.map((n) => (
					<PianoKey key={n.note} n={n} active={activeKeys.has(n.key)} onPress={() => onTrigger(n.key, n.freq)} />
				))}
			</div>
			{black
				.filter((n) => n.key in blackPos)
				.map((n) => (
					<PianoKey
						key={n.note}
						n={n}
						active={activeKeys.has(n.key)}
						onPress={() => onTrigger(n.key, n.freq)}
						style={{ left: `calc(${((blackPos[n.key] + 1) / white.length) * 100}% - 4%)` }}
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
	state: 'current' | 'played' | 'upcoming'
	step: string[]
}) {
	const keys = step.map((n) => songNoteToKey[n] ?? '?')
	const noteNames = step.map((n) => songNoteToNote[n] ?? n)
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
			{[...keys].reverse().map((k, i) => (
				<span
					key={k}
					className={`uppercase text-sm font-mono ${
						state === 'current' ? (chordProgress.has(k) ? 'text-success font-bold' : 'text-primary font-bold') : ''
					}`}
				>
					{k}
					<span className='text-3xs opacity-50 normal-case ml-0.5'>{[...noteNames].reverse()[i]}</span>
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
	songPos,
}: {
	chordProgress: Set<string>
	name: string
	onNext: () => void
	onPrev: () => void
	onReset: () => void
	song: ParsedSong
	songNoteToKey: Record<string, string>
	songNoteToNote: Record<string, string>
	songPos: number
}) {
	const offsets = song.phrases.map((_, i) => song.phrases.slice(0, i).reduce((sum, p) => sum + p.length, 0))

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
				{song.phrases.map((phrase, pi) => (
					<span key={`p${String(pi)}`} className='inline-flex items-center gap-x-1'>
						{phrase.map((step, si) => {
							const gi = offsets[pi] + si
							const state: 'current' | 'played' | 'upcoming' =
								gi === songPos ? 'current' : gi < songPos ? 'played' : 'upcoming'

							return (
								<StepDisplay
									key={`${String(pi)}-${String(si)}`}
									step={step}
									state={state}
									chordProgress={chordProgress}
									songNoteToKey={songNoteToKey}
									songNoteToNote={songNoteToNote}
								/>
							)
						})}
						{pi < song.phrases.length - 1 && <span className='opacity-20 mx-1'>·</span>}
					</span>
				))}
			</div>

			<p className='text-xs opacity-40'>
				{songPos} / {song.steps.length} steps
			</p>
		</div>
	)
}

function resetChord(ref: React.RefObject<Set<string>>, setter: (s: Set<string>) => void) {
	ref.current = new Set()
	setter(new Set())
}

function useVisibleNotes(whiteCount: number) {
	const [offset, setOffset] = useState(DEFAULT_OFFSET)

	const count = Math.max(1, Math.min(whiteCount, MAX_WHITE_COUNT))

	// Snap to nearest white key at or after offset
	let start = offset
	while (start < ALL_NOTES.length && ALL_NOTES[start].black) start += 1

	const visible: ChromaticNote[] = []
	let wc = 0
	let vi = start

	// Collect exactly `count` white keys and all blacks between them
	while (wc < count && vi < ALL_NOTES.length) {
		visible.push(ALL_NOTES[vi])
		if (!ALL_NOTES[vi].black) wc += 1
		vi += 1
	}

	// Include trailing black key (for the last slot)
	if (vi < ALL_NOTES.length && ALL_NOTES[vi].black) {
		visible.push(ALL_NOTES[vi])
	}

	// Assign keyboard keys based on spatial layout
	let whiteIdx = 0
	const notes: NoteConfig[] = visible.map((n) => {
		if (!n.black) {
			const key = HOME_KEYS[whiteIdx]
			whiteIdx += 1
			return { ...n, key }
		}

		return { ...n, key: SLOT_KEYS[whiteIdx - 1] }
	})

	const white = notes.filter((n) => !n.black)
	const black = notes.filter((n) => n.black)
	const noteToKey = Object.fromEntries(notes.map((n) => [n.note, n.key])) as Record<string, string>
	const keyToNote = Object.fromEntries(notes.map((n) => [n.key, n.note])) as Record<string, string>

	const blackPos: Record<string, number> = {}

	for (const bn of black) {
		const idx = notes.indexOf(bn)
		const prev = [...notes.slice(0, idx)].reverse().find((n) => !n.black)
		if (prev) blackPos[bn.key] = white.indexOf(prev)
	}

	const handleWheel = (e: React.WheelEvent | WheelEvent) => {
		const dir = e.deltaY > 0 ? -1 : 1
		setOffset((prev) => Math.max(0, Math.min(maxOffset(count), prev + dir)))
	}

	const firstNote = notes[0]?.note ?? ''
	const lastNote = notes[notes.length - 1]?.note ?? ''

	return { black, blackPos, firstNote, handleWheel, keyToNote, lastNote, noteToKey, notes, white }
}

function getSongKeyMap(song: ParsedSong, notes: NoteConfig[], noteToKey: Record<string, string>) {
	const allSongNotes = song.steps.flat()
	const empty = { toKey: {} as Record<string, string>, toNote: {} as Record<string, string> }

	if (allSongNotes.length === 0) return empty

	const uniqueSongNotes = [...new Set(allSongNotes)]
	const songIndices = uniqueSongNotes.map((n) => NOTE_INDEX[n]).filter((i): i is number => i !== undefined)

	if (songIndices.length === 0) return empty

	const visibleNoteSet = new Set(notes.map((n) => n.note))

	// Try every octave shift (-8 to +8) and pick the first where ALL song notes land on visible keys
	for (let octShift = -8; octShift <= 8; octShift += 1) {
		const shift = octShift * 12
		const allFit = uniqueSongNotes.every((n) => {
			const idx = NOTE_INDEX[n]

			if (idx === undefined) return false

			const transposed = ALL_NOTES[idx + shift]

			return transposed && visibleNoteSet.has(transposed.note)
		})

		if (allFit) {
			const toKey: Record<string, string> = {}
			const toNote: Record<string, string> = {}

			for (const n of uniqueSongNotes) {
				const transposed = ALL_NOTES[NOTE_INDEX[n] + shift]

				toKey[n] = noteToKey[transposed.note] ?? '?'
				toNote[n] = transposed.note
			}

			return { toKey, toNote }
		}
	}

	// No perfect fit — fall back to closest octave shift and show ? for missing notes
	const minSong = Math.min(...songIndices)
	const minVis = Math.min(...notes.map((n) => NOTE_INDEX[n.note]))
	const bestShift = Math.round((minVis - minSong) / 12) * 12

	const toKey: Record<string, string> = {}
	const toNote: Record<string, string> = {}

	for (const n of uniqueSongNotes) {
		const idx = NOTE_INDEX[n]

		if (idx === undefined) continue

		const transposed = ALL_NOTES[idx + bestShift]

		toKey[n] = transposed ? (noteToKey[transposed.note] ?? '?') : '?'
		toNote[n] = transposed ? transposed.note : n
	}

	return { toKey, toNote }
}

function usePianoWidth(ref: React.RefObject<HTMLDivElement | null>) {
	const [width, setWidth] = useState(MAX_WHITE_COUNT)

	useEffect(() => {
		const el = ref.current
		if (!el) return

		const update = () => {
			const count = Math.floor(el.clientWidth / (MIN_KEY_WIDTH_REM * REM_PX))
			setWidth(Math.max(1, Math.min(count, MAX_WHITE_COUNT)))
		}

		update()
		const ro = new ResizeObserver(update)
		ro.observe(el)
		return () => ro.disconnect()
	}, [ref])

	return width
}

function PianoBar({
	activeKeys,
	black,
	blackPos,
	containerRef,
	firstNote,
	handleWheel,
	lastNote,
	onTrigger,
	white,
}: {
	activeKeys: Set<string>
	black: NoteConfig[]
	blackPos: Record<string, number>
	containerRef: React.RefObject<HTMLDivElement | null>
	firstNote: string
	handleWheel: (e: React.WheelEvent) => void
	lastNote: string
	onTrigger: (key: string, freq: number) => void
	white: NoteConfig[]
}) {
	return (
		<div className='sticky bottom-0 w-full flex flex-col items-center gap-1 p-6 pt-4 bg-base-100/80 backdrop-blur-sm'>
			<p className='opacity-60 text-sm text-center flex flex-wrap items-center justify-center gap-1'>
				<span>White:</span>
				{white.map((n) => (
					<kbd key={n.note} className='kbd kbd-sm'>
						{n.key.toUpperCase()}
					</kbd>
				))}
				<span>· Black:</span>
				{black.map((n) => (
					<kbd key={n.note} className='kbd kbd-sm'>
						{n.key.toUpperCase()}
					</kbd>
				))}
			</p>
			<p className='text-xs opacity-40 text-center'>
				{firstNote} — {lastNote} · scroll to transpose
			</p>
			<div ref={containerRef} className='w-full max-w-2xl'>
				<Piano
					white={white}
					black={black}
					blackPos={blackPos}
					activeKeys={activeKeys}
					onTrigger={onTrigger}
					onWheel={handleWheel}
				/>
			</div>
		</div>
	)
}

function Root() {
	const audioCtxRef = useRef<AudioContext | null>(null)
	const pianoContainerRef = useRef<HTMLDivElement | null>(null)
	const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set())
	const [songIdx, setSongIdx] = useState(0)
	const [songPos, setSongPos] = useState(0)
	const [chordProgress, setChordProgress] = useState<Set<string>>(() => new Set())
	const chordRef = useRef<Set<string>>(new Set())

	const whiteCount = usePianoWidth(pianoContainerRef)
	const { black, blackPos, firstNote, handleWheel, keyToNote, lastNote, noteToKey, notes, white } =
		useVisibleNotes(whiteCount)

	const songName = SONG_NAMES[songIdx]
	const song = parseSong(SONGS[songName], keyToNote)
	const songKeyMap = getSongKeyMap(song, notes, noteToKey)

	const getAudioCtx = () => {
		if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
		audioCtxRef.current.resume()
		return audioCtxRef.current
	}

	// eslint-disable-next-line react-hooks/exhaustive-deps -- React Compiler handles memoization
	const triggerNote = (key: string, freq: number) => {
		playNote(getAudioCtx(), freq)
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

		setSongPos((prev) => {
			if (prev >= song.steps.length) return prev
			const stepKeys = song.steps[prev].map((n: string) => songKeyMap.toKey[n] ?? '?')

			if (stepKeys.length === 1) {
				if (key !== stepKeys[0]) return prev
				resetChord(chordRef, setChordProgress)
			} else {
				if (!stepKeys.includes(key)) return prev
				chordRef.current.add(key)
				const updated = new Set(chordRef.current)

				setChordProgress(updated)

				if (stepKeys.every((k: string) => updated.has(k))) {
					resetChord(chordRef, setChordProgress)
				} else {
					return prev
				}
			}

			const next = prev + 1

			if (next >= song.steps.length) {
				toast.success(`Nice! You played ${songName}`)
				const resetTimer = setTimeout(() => {
					setSongPos(0)
					resetChord(chordRef, setChordProgress)
				}, 2000)
				void resetTimer
			}

			return next
		})
	}

	const cycleSong = (dir: number) => {
		setSongIdx((prev) => (prev + dir + SONG_NAMES.length) % SONG_NAMES.length)
		setSongPos(0)
		resetChord(chordRef, setChordProgress)
	}

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.repeat) return
			const found = notes.find((n) => n.key === e.key.toLowerCase())

			if (found) {
				e.preventDefault()
				triggerNote(found.key, found.freq)
			}
		}

		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [triggerNote, notes])

	return (
		<ThemeProvider>
			<Toaster />
			<main className='min-h-screen flex flex-col items-center'>
				{/* Centered content area */}
				<div className='flex-1 flex flex-col items-center justify-center gap-8 p-6 pb-0'>
					<div className='flex items-center gap-2'>
						<h1 className='text-3xl font-bold tracking-tight'>Keyboard Piano</h1>
						<ThemePicker variant='modal' />
					</div>

					<SongGuide
						name={songName}
						song={song}
						songPos={songPos}
						chordProgress={chordProgress}
						songNoteToKey={songKeyMap.toKey}
						songNoteToNote={songKeyMap.toNote}
						onReset={() => {
							setSongPos(0)
							resetChord(chordRef, setChordProgress)
						}}
						onPrev={() => cycleSong(-1)}
						onNext={() => cycleSong(1)}
					/>
				</div>

				<PianoBar
					containerRef={pianoContainerRef}
					white={white}
					black={black}
					blackPos={blackPos}
					activeKeys={activeKeys}
					onTrigger={triggerNote}
					firstNote={firstNote}
					lastNote={lastNote}
					handleWheel={handleWheel}
				/>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
