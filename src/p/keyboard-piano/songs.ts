import * as R from 'https://esm.sh/remeda'
import { type NoteConfig, ALL_NOTES, NOTE_INDEX } from './notes'

// Song encoding: "C4 D4 [C4 E4 G4]|F4" — brackets group a chord, pipes split phrases.
// A step is one array of note names: ['C4'] for a single note, ['C4','E4','G4'] for a chord.
export type ParsedSong = { phrases: string[][][]; steps: string[][] }

export function parsePhrase(phrase: string) {
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

export function parseSong(data: string) {
	const phrases = data.split('|').map((phrase) => parsePhrase(phrase.trim()))

	return { phrases, steps: phrases.flat() }
}

export const SONGS = {
	'Mary Had a Little Lamb': 'E4 D4 C4 D4 E4 E4 E4|D4 D4 D4|E4 G4 G4|E4 D4 C4 D4 E4 E4 E4|E4 D4 D4 E4 D4 C4',
	'Twinkle Twinkle Little Star':
		'C4 C4 G4 G4 A4 A4 G4|F4 F4 E4 E4 D4 D4 C4|G4 G4 F4 F4 E4 E4 D4|G4 G4 F4 F4 E4 E4 D4|C4 C4 G4 G4 A4 A4 G4|F4 F4 E4 E4 D4 D4 C4',
	'Hot Cross Buns': 'E4 D4 C4|E4 D4 C4|C4 C4 D4 D4 E4 D4 C4',
	'Ode to Joy': 'E4 E4 F4 G4 G4 F4 E4 D4|C4 C4 D4 E4 E4 D4 D4|E4 E4 F4 G4 G4 F4 E4 D4|C4 C4 D4 E4 D4 C4 C4',
	'Jingle Bells (Chorus)': 'E4 E4 E4|E4 E4 E4|E4 G4 C4 D4 E4|F4 F4 F4 F4 F4 E4 E4 E4|E4 D4 D4 E4 D4 G4',
	'Chord Progression (I–IV–V–I)': '[C4 E4 G4] [C4 E4 G4]|[C4 F4 A4] [C4 F4 A4]|[D4 G4 B4] [D4 G4 B4]|[C4 E4 G4]',
} satisfies Record<string, string>

export type SongName = keyof typeof SONGS
export const SONG_NAMES = R.keys(SONGS)

export function getSongKeyMap(song: ParsedSong, notes: NoteConfig[], noteToKey: Record<string, string>) {
	const allSongNotes = song.steps.flat()
	const empty: { toKey: Record<string, string>; toNote: Record<string, string> } = { toKey: {}, toNote: {} }

	if (allSongNotes.length === 0) return empty

	const uniqueSongNotes = new Set(allSongNotes).values().toArray()
	const songIndices = uniqueSongNotes
		.map((note) => NOTE_INDEX[note])
		.filter((index): index is number => index !== undefined)

	if (songIndices.length === 0) return empty

	const visibleNoteSet = new Set(notes.map((note) => note.note))

	const fitShift = (shift: number) => {
		const toKey: Record<string, string> = {}
		const toNote: Record<string, string> = {}

		for (const note of uniqueSongNotes) {
			const index = NOTE_INDEX[note]
			const transposed = index === undefined ? undefined : ALL_NOTES[index + shift]
			if (!transposed || !visibleNoteSet.has(transposed.note)) return null
			toKey[note] = noteToKey[transposed.note] ?? '?'
			toNote[note] = transposed.note
		}

		return { toKey, toNote }
	}

	// Try every octave shift (-8 to +8) and pick the first where ALL song notes land on visible keys
	for (let octaveShift = -8; octaveShift <= 8; octaveShift += 1) {
		const fit = fitShift(octaveShift * 12)
		if (fit) return fit
	}

	// No perfect fit — fall back to closest octave shift and show ? for missing notes
	const lowestSongIndex = Math.min(...songIndices)
	const lowestVisibleIndex = Math.min(...notes.flatMap((note) => NOTE_INDEX[note.note] ?? []))
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
