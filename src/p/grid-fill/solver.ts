import { type Bin, type Recipe, availableSizes, computeTags, parseSize } from './recipes'

export const solve = ({ W, H }: { W: number; H: number }) => {
	const AREA = W * H
	const FULL = (1 << W) - 1

	const sizeKeys = availableSizes(W, H).toSorted((a, b) => {
		const [wa, ha] = parseSize(a)
		const [wb, hb] = parseSize(b)
		return wb * hb - wa * ha
	})
	const K = sizeKeys.length
	const keyArea = new Int32Array(K)
	const keyDimensions: [number, number][][] = []

	for (const [keyIndex, sizeKey] of sizeKeys.entries()) {
		const [w, h] = parseSize(sizeKey)
		keyArea[keyIndex] = w * h
		const dimensions: [number, number][] = [[w, h]]
		if (w !== h) dimensions.push([h, w])
		keyDimensions.push(dimensions.filter(([width, height]) => width <= W && height <= H))
	}

	const tryPack = (targetCounts: Int8Array) => {
		const rows = new Int32Array(H)
		const pieces = sizeKeys.map((key, keyIndex) => ({
			key,
			dimensions: keyDimensions[keyIndex] ?? [],
			remaining: targetCounts[keyIndex] ?? 0,
		}))
		const layout: Bin[] = []

		const firstEmpty = (): [number, number] | null => {
			for (let y = 0; y < H; y++) {
				const emptyMask = ~(rows[y] ?? 0) & FULL
				if (emptyMask) return [31 - Math.clz32(emptyMask & -emptyMask), y]
			}

			return null
		}

		const canPlace = ({ x, y, w, h }: Omit<Bin, 'key'>) => {
			if (x + w > W || y + h > H) return false
			const mask = ((1 << w) - 1) << x
			for (let row = y; row < y + h; row++) if ((rows[row] ?? 0) & mask) return false
			return true
		}

		const recurse = (): boolean => {
			const cell = firstEmpty()
			if (!cell) return pieces.every((piece) => piece.remaining === 0)
			const [x, y] = cell

			for (const piece of pieces) {
				if (piece.remaining <= 0) continue

				for (const [w, h] of piece.dimensions) {
					if (!canPlace({ x, y, w, h })) continue
					const mask = ((1 << w) - 1) << x
					for (let row = y; row < y + h; row++) rows[row] = (rows[row] ?? 0) | mask
					piece.remaining--
					layout.push({ x, y, w, h, key: piece.key })
					if (recurse()) return true
					layout.pop()
					piece.remaining++
					for (let row = y; row < y + h; row++) rows[row] = (rows[row] ?? 0) & ~mask
				}
			}

			return false
		}

		return recurse() ? [...layout] : null
	}

	function* enumerateMultisets(uniqueTarget: number): Generator<Int8Array> {
		const counts = new Int8Array(K)

		function* emit(keyIndex: number, remainingArea: number, remainingUnique: number): Generator<Int8Array> {
			if (remainingUnique === 0) {
				if (remainingArea === 0) yield Int8Array.from(counts)
				return
			}
			const area = keyArea[keyIndex]
			if (area === undefined || K - keyIndex < remainingUnique) return
			yield* emit(keyIndex + 1, remainingArea, remainingUnique)
			const maxCount = Math.floor(remainingArea / area)

			for (let count = 1; count <= maxCount; count++) {
				counts[keyIndex] = count
				yield* emit(keyIndex + 1, remainingArea - count * area, remainingUnique - 1)
			}

			counts[keyIndex] = 0
		}

		yield* emit(0, AREA, uniqueTarget)
	}

	const found: Recipe[] = []

	for (let uniqueCount = 1; uniqueCount <= K; uniqueCount++)
		for (const counts of enumerateMultisets(uniqueCount)) {
			const layout = tryPack(counts)
			if (!layout) continue
			const recipeCounts: Record<string, number> = {}
			const parts: string[] = []

			for (let keyIndex = 0; keyIndex < K; keyIndex++) {
				const sizeKey = sizeKeys[keyIndex]
				const count = counts[keyIndex] ?? 0
				if (sizeKey === undefined || count <= 0) continue
				recipeCounts[sizeKey] = count
				parts.push(`${sizeKey}:${count}`)
			}

			found.push({ key: parts.toSorted().join('|'), counts: recipeCounts, unique: uniqueCount, layout, tags: [] })
		}

	const maxUnique = Math.max(0, ...found.map((r) => r.unique))
	for (const recipe of found) recipe.tags = computeTags(recipe, maxUnique)
	return found
}
