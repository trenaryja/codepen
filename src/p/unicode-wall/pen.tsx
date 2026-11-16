/** Unassigned, private use (no agreed glyph yet) and lone surrogates (UTF-16 halves, never characters on their own). */
const excluded = /[\p{Cn}\p{Co}\p{Cs}]/u
/** Chrome hides 397 of these even when the font has a glyph, and bidi controls reorder what follows (Chrome 157, measured). */
const invisible = /[\p{Cc}\p{Cf}\p{Z}\p{DI}]/u

/** Unicode Character Database rows; unicode.org sends no CORS header. */
const ucd = async (file: string) => {
	const text = await fetch(
		`https://raw.githubusercontent.com/unicode-org/unicodetools/main/unicodetools/data/ucd/dev/${file}`,
	)
		.then(async (res) => res.text())
		.catch(() => '')
	return text
		.split('\n')
		.filter((line) => /^[\dA-F]/.test(line))
		.map((line) => line.split(';').map((field) => field.trim()))
}
const [aliases, shaping] = await Promise.all([ucd('NameAliases.txt'), ucd('ArabicShaping.txt')])
const abbreviations = new Map(
	aliases
		.filter((fields) => fields[2] === 'abbreviation')
		.map(([hex = '', abbreviation]) => [Number.parseInt(hex, 16), abbreviation]),
)
/** Letters that join their neighbours (Joining_Type D/R/L/C): JS regex has no `\p{Joining_Type}`. */
const joining = new Set(
	shaping.filter((fields) => /^[DRLC]$/.test(fields[2] ?? '')).map(([hex = '']) => Number.parseInt(hex, 16)),
)

/** Merging code points (marks, Hangul jamo) fuse whole blocks into one unbreakable cluster: the jamo alone overflowed 2,427px. */
const graphemes = new Intl.Segmenter()
const mark = /\p{M}/u

const wall = document.getElementById('wall')
let total = 0
let run = ''
let prev = ''
for (let codePoint = 0; codePoint <= 0x10_ff_ff; codePoint++) {
	const char = String.fromCodePoint(codePoint)
	if (excluded.test(char)) continue
	total++
	const isInvisible = invisible.test(char)
	const merges = [...graphemes.segment(prev + char)].length === 1
	prev = char
	if (!isInvisible && !merges && !joining.has(codePoint)) {
		run += char
		continue
	}
	/** An inline-block keeps the real character for copying while it breaks clusters and joining and isolates bidi; CSS draws labels and ◌ bases. */
	const span = document.createElement('span')
	if (isInvisible)
		span.dataset.label = abbreviations.get(codePoint) ?? codePoint.toString(16).toUpperCase().padStart(4, '0')
	else if (mark.test(char)) span.dataset.mark = ''
	span.textContent = char
	wall?.append(run, span)
	run = ''
}
wall?.append(run)

const isEmojiPresentation = /\p{Emoji_Presentation}/u
const emojiRanges: [number, number][] = []
for (let codePoint = 0; codePoint <= 0x10_ff_ff; codePoint++) {
	if (!isEmojiPresentation.test(String.fromCodePoint(codePoint))) continue
	const last = emojiRanges.at(-1)
	if (last?.[1] === codePoint - 1) last[1] = codePoint
	else emojiRanges.push([codePoint, codePoint])
}
const unicodeRange = emojiRanges.map(([lo, hi]) => `U+${lo.toString(16)}-${hi.toString(16)}`).join(',')
/** UTS #51: only `Emoji_Presentation=Yes` defaults to color; text-default emoji (♥☀☎▶) fall through to text fonts. */
document.fonts.add(
	new FontFace('EmojiPresentation', "local('Apple Color Emoji'), local('Segoe UI Emoji'), local('Noto Color Emoji')", {
		unicodeRange,
	}),
)

const count = document.getElementById('count')
if (count) count.textContent = `${total.toLocaleString()} code points, U+0000 → U+10FFFF`
