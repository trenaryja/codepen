import { useState } from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import { type NoteConfig, ALL_NOTES, DEFAULT_OFFSET, HOME_KEYS, MAX_WHITE_COUNT, maxOffset, SLOT_KEYS } from './notes'

export function useVisibleNotes(whiteCount: number) {
	const [offset, setOffset] = useState(DEFAULT_OFFSET)

	const count = Math.max(1, Math.min(whiteCount, MAX_WHITE_COUNT))

	const notes: NoteConfig[] = []
	const blackPositions: Record<string, number> = {}
	let whitesFound = 0

	for (const note of ALL_NOTES.slice(offset)) {
		if (note.black) {
			// SLOT_KEYS[-1] is undefined: a black key before the first white has no slot and is skipped
			const key = SLOT_KEYS[whitesFound - 1]

			if (key !== undefined) {
				notes.push({ ...note, key })
				blackPositions[key] = whitesFound - 1
			}

			// Trailing black key fills the top-row slot past the last white key
			if (whitesFound === count) break
			continue
		}

		const key = HOME_KEYS[whitesFound]
		if (whitesFound === count || key === undefined) break
		notes.push({ ...note, key })
		whitesFound += 1
	}

	const white = notes.filter((note) => !note.black)
	const black = notes.filter((note) => note.black)
	const noteToKey = R.fromEntries(notes.map((note) => [note.note, note.key] as const))

	const handleWheel = (e: WheelEvent) => {
		const direction = e.deltaY > 0 ? -1 : 1
		setOffset((prev) => Math.max(0, Math.min(maxOffset(count), prev + direction)))
	}

	const firstNote = notes[0]?.note ?? ''
	const lastNote = notes.at(-1)?.note ?? ''

	return { black, blackPositions, firstNote, handleWheel, lastNote, noteToKey, notes, white }
}
