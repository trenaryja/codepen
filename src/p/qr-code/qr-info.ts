import QRCode, { type ModeId } from 'https://esm.sh/qrcode'

export const CELL = 10

export const ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const

export type EccLevel = (typeof ECC_LEVELS)[number]

export const capacityCache = new Map<string, number>()

/**
 * Capacity is a pure function of (version, ecc, mode) — cache so each combo only probes once.
 * There are only 4 × 40 × 3 = 480 unique combos, so this could be fully pre-computed and
 * exported as a static nested object (ecc → mode → version[]) for O(1) lookups with no runtime
 * cost — preferable if this moves to a library.
 */
export const probeCapacity = (version: number, ecc: EccLevel, modeId: ModeId) =>
	capacityCache.getOrInsertComputed(`${version}:${ecc}:${modeId}`, () => {
		const sampleChar = modeId === 'Numeric' ? '1' : modeId === 'Alphanumeric' ? 'A' : 'x'
		let high = 7090
		let low = 1

		while (low < high) {
			const middle = Math.floor((low + high + 1) / 2)

			try {
				if (QRCode.create(sampleChar.repeat(middle), { errorCorrectionLevel: ecc }).version <= version) low = middle
				else high = middle - 1
			} catch {
				high = middle - 1
			}
		}

		return low
	})

export const optimizeForQR = (raw: string) => {
	try {
		const url = new URL(raw)
		// Uppercasing percent-escapes lets more of the URL encode in QR's alphanumeric mode.
		const upperEscapes = (text: string) => text.replaceAll(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase())
		const scheme = url.protocol.slice(0, -1).toUpperCase()
		const host = url.hostname.toUpperCase()
		const port = url.port ? `:${url.port}` : ''

		return `${scheme}://${host}${port}${upperEscapes(url.pathname)}${upperEscapes(url.search)}${upperEscapes(url.hash)}`
	} catch {
		return raw
	}
}

export const getQRInfo = (text: string, ecc: EccLevel) => {
	try {
		const qr = QRCode.create(text, { errorCorrectionLevel: ecc })
		const [firstMode, ...otherModes] = qr.segments.map((segment) => segment.mode.id)
		const mode = firstMode && otherModes.every((modeId) => modeId === firstMode) ? firstMode : 'Mixed'
		const capacity = mode === 'Mixed' ? null : probeCapacity(qr.version, ecc, mode)

		return { version: qr.version, moduleCount: qr.modules.size, mode, capacity }
	} catch {
		return null
	}
}
