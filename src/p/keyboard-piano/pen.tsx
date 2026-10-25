import { useElementSize } from 'https://esm.sh/@mantine/hooks'
import { ThemePicker, ThemeProvider, toast, Toaster } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useEffectEvent, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { playNote, resumeAudioContext } from './audio'
import { MAX_WHITE_COUNT, MIN_KEY_WIDTH_REM, REM_PX } from './notes'
import { PianoDock } from './piano'
import { SongGuide } from './song-guide'
import { getSongKeyMap, parseSong, SONG_NAMES, SONGS, type SongName } from './songs'
import { useVisibleNotes } from './use-visible-notes'

function resetChord(ref: React.RefObject<Set<string>>, setter: (chord: Set<string>) => void) {
	ref.current = new Set()
	setter(new Set())
}

function Root() {
	const audioContextRef = useRef<AudioContext | null>(null)
	const { ref: pianoContainerRef, width: pianoWidth } = useElementSize<HTMLDivElement>()
	const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set())
	const [songName, setSongName] = useState<SongName>('Mary Had a Little Lamb')
	const [songPosition, setSongPosition] = useState(0)
	const [chordProgress, setChordProgress] = useState<Set<string>>(() => new Set())
	const chordRef = useRef<Set<string>>(new Set())

	const whiteCount = pianoWidth ? Math.floor(pianoWidth / (MIN_KEY_WIDTH_REM * REM_PX)) : MAX_WHITE_COUNT
	const { black, blackPositions, firstNote, handleWheel, lastNote, noteToKey, notes, white } =
		useVisibleNotes(whiteCount)

	const song = parseSong(SONGS[songName])
	const songKeyMap = getSongKeyMap(song, notes, noteToKey)

	const triggerNote = (key: string, frequency: number) => {
		playNote(resumeAudioContext(audioContextRef), frequency)
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
			const step = song.steps[prev]
			if (!step) return prev
			const stepKeys = step.map((note) => songKeyMap.toKey[note] ?? '?')

			if (stepKeys.length === 1) {
				if (key !== stepKeys[0]) return prev
			} else {
				if (!stepKeys.includes(key)) return prev
				chordRef.current.add(key)
				const updated = new Set(chordRef.current)

				setChordProgress(updated)

				// Hold the position until every note of the chord has been struck
				if (stepKeys.some((stepKey) => !updated.has(stepKey))) return prev
			}
			resetChord(chordRef, setChordProgress)

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
		setSongName(
			(prev) => SONG_NAMES[(SONG_NAMES.indexOf(prev) + direction + SONG_NAMES.length) % SONG_NAMES.length] ?? prev,
		)
		setSongPosition(0)
		resetChord(chordRef, setChordProgress)
	}

	const onKey = useEffectEvent((e: KeyboardEvent) => {
		if (e.repeat) return
		const found = notes.find((note) => note.key === e.key.toLowerCase())

		if (!found) return

		e.preventDefault()
		triggerNote(found.key, found.frequency)
	})

	useEffect(() => {
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	return (
		<ThemeProvider>
			<Toaster />
			<main className='flex min-h-screen flex-col items-center'>
				<div className='flex flex-1 flex-col items-center justify-center gap-8 p-6 pb-0'>
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

				<PianoDock
					containerRef={pianoContainerRef}
					white={white}
					black={black}
					blackPositions={blackPositions}
					firstNote={firstNote}
					lastNote={lastNote}
					activeKeys={activeKeys}
					onTrigger={triggerNote}
					onWheel={handleWheel}
				/>
			</main>
		</ThemeProvider>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(<Root />)
