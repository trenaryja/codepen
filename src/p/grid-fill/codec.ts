// TODO: move to @trenaryja/ui/utils

/** Full printable ASCII minus space — 94 chars, most compact for typeable strings. */
export const BASE94 = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)).join('')
/** Alphanumeric — safe in filenames, HTML ids, and case-sensitive contexts. */
export const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Prepend a sentinel 1-bit then write the bit array as big-endian base-N digits. */
export const bitsToString = (bits: boolean[], alphabet = BASE94) => {
	const base = BigInt(alphabet.length)
	let accumulator = 1n
	for (const bit of bits) accumulator = (accumulator << 1n) | (bit ? 1n : 0n)
	let result = ''

	while (accumulator > 0n) {
		result = alphabet[Number(accumulator % base)] + result
		accumulator /= base
	}

	return result
}

/** Inverse of bitsToString — recover the original bit array from an encoded string. */
export const stringToBits = (encoded: string, alphabet = BASE94) => {
	const lookup = new Map(alphabet.split('').map((char, i) => [char, i]))
	const base = BigInt(alphabet.length)
	let accumulator = 0n
	for (const char of encoded) accumulator = accumulator * base + BigInt(lookup.get(char)!)
	return Array.from(accumulator.toString(2).slice(1), (char) => char === '1')
}

/** Append the Elias gamma encoding of `value` (≥ 1) to a bit array. */
const eliasGammaEncode = (value: number, bits: boolean[]) => {
	const binary = value.toString(2)
	for (let i = 1; i < binary.length; i++) bits.push(false)
	for (const char of binary) bits.push(char === '1')
}

/** Decode one Elias gamma value from bits at position; returns [value, nextPosition]. */
const eliasGammaDecode = (bits: boolean[], position: number): [number, number] => {
	let leadingZeros = 0
	while (position + leadingZeros < bits.length && !bits[position + leadingZeros]) leadingZeros++
	let value = 0
	for (let i = 0; i <= leadingZeros; i++) value = (value << 1) | (bits[position + leadingZeros + i] ? 1 : 0)
	return [value, position + 2 * leadingZeros + 1]
}

/** Elias-gamma encode an array of positive integers (≥ 1) to a compact string. */
export const encodeIntegers = (values: number[], alphabet = BASE94): string => {
	const bits: boolean[] = []
	for (const value of values) eliasGammaEncode(value, bits)
	return bitsToString(bits, alphabet)
}

/** Decode a string produced by encodeIntegers back to its integer array. */
export const decodeIntegers = (encoded: string, alphabet = BASE94): number[] => {
	const bits = stringToBits(encoded, alphabet)
	const values: number[] = []
	let position = 0

	while (position < bits.length) {
		const [value, next] = eliasGammaDecode(bits, position)
		values.push(value)
		position = next
	}

	return values
}

/** Map ordered pair (a, b) with a ≤ b to its zero-based triangular number index. */
export const triIndex = (a: number, b: number) => ((b - 1) * b) / 2 + (a - 1)

/** Inverse of triIndex — recover (a, b) from a triangular index. */
export const triInverse = (index: number): [number, number] => {
	const b = Math.floor((1 + Math.sqrt(1 + 8 * index)) / 2)
	return [index - ((b - 1) * b) / 2 + 1, b]
}
