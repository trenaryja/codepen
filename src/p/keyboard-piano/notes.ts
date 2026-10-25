export type NoteConfig = { black?: boolean; frequency: number; key: string; note: string }

export type ChromaticNote = { black: boolean; frequency: number; note: string }

export type StepState = 'current' | 'played' | 'upcoming'

export const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const ALL_NOTES: ChromaticNote[] = []

for (let octave = 1; octave <= 8; octave++)
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

// Home row = white keys, top row = black keys (spatially matched to QWERTY stagger)
export const HOME_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"]
// Top-row key between home key i and i+1 (maps to the sharp between those white notes)
export const SLOT_KEYS = ['w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']']
export const MAX_WHITE_COUNT = HOME_KEYS.length
export const MIN_KEY_WIDTH_REM = 3
export const REM_PX =
	typeof document === 'undefined' ? 16 : Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

export function maxOffset(whiteCount: number) {
	for (let i = ALL_NOTES.length - 1; i >= 0; i--) {
		const whites = ALL_NOTES.slice(i).filter((note) => !note.black).length

		if (whites >= whiteCount) return i
	}

	return 0
}

export const NOTE_INDEX: Record<string, number> = Object.fromEntries(ALL_NOTES.map((note, i) => [note.note, i]))
export const DEFAULT_OFFSET = ALL_NOTES.findIndex((note) => note.note === 'C4')
