// TODO: move to @trenaryja/ui/utils

/** Full printable ASCII minus space — 94 chars, most compact for typeable strings. */
export const BASE94 = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)).join('')
/** URL-safe base-64 (no padding) — all chars pass unescaped in query strings. */
export const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
/** Alphanumeric — safe in filenames, HTML ids, and case-sensitive contexts. */
export const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Prepend a sentinel 1-bit then write the bit array as big-endian base-N digits. */
export const bitsToString = (bits: boolean[], alphabet = BASE94) => {
	const base = BigInt(alphabet.length)
	let n = 1n
	for (const bit of bits) n = (n << 1n) | (bit ? 1n : 0n)
	let result = ''
	while (n > 0n) {
		result = alphabet[Number(n % base)] + result
		n /= base
	}
	return result
}

/** Inverse of bitsToString — recover the original bit array from an encoded string. */
export const stringToBits = (str: string, alphabet = BASE94) => {
	const lookup = new Map(alphabet.split('').map((ch, i) => [ch, i]))
	const base = BigInt(alphabet.length)
	let n = 0n
	for (const ch of str) n = n * base + BigInt(lookup.get(ch)!)
	return Array.from(n.toString(2).slice(1), (ch) => ch === '1')
}

/** Append the Elias gamma encoding of n (≥ 1) to a bit array. */
const egEncode = (n: number, bits: boolean[]) => {
	const bin = n.toString(2)
	for (let i = 1; i < bin.length; i++) bits.push(false)
	for (const ch of bin) bits.push(ch === '1')
}
/** Decode one Elias gamma value from bits at position; returns [value, nextPosition]. */
const egDecode = (bits: boolean[], position: number): [number, number] => {
	let k = 0
	while (position + k < bits.length && !bits[position + k]) k++
	let n = 0
	for (let i = 0; i <= k; i++) n = (n << 1) | (bits[position + k + i] ? 1 : 0)
	return [n, position + 2 * k + 1]
}

/** Elias-gamma encode an array of positive integers (≥ 1) to a compact string. */
export const encodeIntegers = (values: number[], alphabet = BASE94): string => {
	const bits: boolean[] = []
	for (const v of values) egEncode(v, bits)
	return bitsToString(bits, alphabet)
}

/** Decode a string produced by encodeIntegers back to its integer array. */
export const decodeIntegers = (str: string, alphabet = BASE94): number[] => {
	const bits = stringToBits(str, alphabet)
	const values: number[] = []
	let pos = 0
	while (pos < bits.length) {
		const [v, next] = egDecode(bits, pos)
		values.push(v)
		pos = next
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
