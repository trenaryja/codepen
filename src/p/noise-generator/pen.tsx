import { useHotkeys } from 'https://esm.sh/@mantine/hooks'
import { Button, Field, Range, ThemeProvider, tailwindColors } from 'https://esm.sh/@trenaryja/ui'
import chroma from 'https://esm.sh/chroma-js'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuPause, LuPlay } from 'https://esm.sh/react-icons/lu'

type NoiseEntry = {
	type: string
	color: keyof typeof tailwindColors
	description: string
	generate: (s: Float32Array) => void
}

const SPECTRUM: NoiseEntry[] = [
	{
		type: 'brown',
		color: 'stone',
		description: '1/f² — deep rumble',
		// Leaky integration of white noise (bounded approximation of Brownian motion).
		generate(samples) {
			let last = 0

			for (let i = 0; i < samples.length; i++) {
				const white = Math.random() * 2 - 1
				last = (last + 0.02 * white) / 1.02
				samples[i] = last * 3.5
			}
		},
	},
	{
		type: 'pink',
		color: 'pink',
		description: '1/f — natural, waterfall-like',
		// Paul Kellet's IIR filter approximation for 1/f noise.
		generate(samples) {
			let b0 = 0
			let b1 = 0
			let b2 = 0
			let b3 = 0
			let b4 = 0
			let b5 = 0
			let b6 = 0

			for (let i = 0; i < samples.length; i++) {
				const white = Math.random() * 2 - 1
				b0 = 0.99886 * b0 + white * 0.0555179
				b1 = 0.99332 * b1 + white * 0.0750759
				b2 = 0.969 * b2 + white * 0.153852
				b3 = 0.8665 * b3 + white * 0.3104856
				b4 = 0.55 * b4 + white * 0.5329522
				b5 = -0.7616 * b5 + white * 0.016898
				samples[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
				b6 = white * 0.115926
			}
		},
	},
	{
		type: 'white',
		color: 'neutral',
		description: 'Flat — equal power at every frequency',
		generate(samples) {
			for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
		},
	},
	{
		type: 'blue',
		color: 'blue',
		description: 'f — hissy, bright',
		// First derivative of white noise.
		generate(samples) {
			let prev = Math.random() * 2 - 1

			for (let i = 0; i < samples.length; i++) {
				const white = Math.random() * 2 - 1
				samples[i] = white - prev
				prev = white
			}
		},
	},
	{
		type: 'violet',
		color: 'violet',
		description: 'f² — harsh high frequencies',
		// Second derivative of white noise.
		generate(samples) {
			let prev1 = Math.random() * 2 - 1
			let prev2 = Math.random() * 2 - 1

			for (let i = 0; i < samples.length; i++) {
				const white = Math.random() * 2 - 1
				samples[i] = white - 2 * prev1 + prev2
				prev2 = prev1
				prev1 = white
			}
		},
	},
]

const SPECTRUM_ENTRIES = SPECTRUM.map((entry, i) => ({
	...entry,
	position: i / (SPECTRUM.length - 1),
	label: entry.type[0].toUpperCase() + entry.type.slice(1),
	colors: ([800, 600, 400] as const).map((shade) => tailwindColors[entry.color][shade]),
}))

function getSpectrumNeighbors(position: number) {
	const scaled = position * (SPECTRUM_ENTRIES.length - 1)
	const i = Math.min(Math.floor(scaled), SPECTRUM_ENTRIES.length - 2)
	return { lower: SPECTRUM_ENTRIES[i], upper: SPECTRUM_ENTRIES[i + 1], t: scaled - i }
}

function fillBlendedBuffer(position: number, samples: Float32Array) {
	const { lower, upper, t } = getSpectrumNeighbors(position)
	lower.generate(samples)

	if (t === 0) return

	const temp = new Float32Array(samples.length)
	upper.generate(temp)
	for (let i = 0; i < samples.length; i++) samples[i] = samples[i] * (1 - t) + temp[i] * t
}

const SVG_HEIGHT = 50
const BIN_COUNT = 128
const GAP_RATIO = 0.15
const CELL_WIDTH = 100 / BIN_COUNT
const BAR_WIDTH = CELL_WIDTH * (1 - GAP_RATIO)
const BAR_OFFSET = CELL_WIDTH * (GAP_RATIO / 2)

function buildBlendedColorArray(position: number) {
	const { lower, upper, t } = getSpectrumNeighbors(position)
	const colorsA = chroma.scale([...lower.colors]).colors(256)

	if (t === 0) return colorsA

	const colorsB = chroma.scale([...upper.colors]).colors(256)
	return colorsA.map((c: string, i: number) => chroma.mix(c, colorsB[i], t).hex())
}

function getSpectrumLabel(position: number) {
	const { lower, upper, t } = getSpectrumNeighbors(position)

	if (t < 0.02) return lower.description
	if (t > 0.98) return upper.description

	const pctUpper = Math.round(t * 100)
	return `${100 - pctUpper}% ${lower.label} / ${pctUpper}% ${upper.label}`
}

// Maps a frequency bin value (0–255) to a bar height with bezier easing.
function scaleBarHeight(value: number) {
	const t = value / 255
	return SVG_HEIGHT * t * (0.2 + 0.8 * t)
}

function createNoiseEngine() {
	const ctx = new AudioContext()
	ctx.suspend()

	const gain = ctx.createGain()
	gain.gain.value = 0.5

	const analyser = ctx.createAnalyser()
	analyser.fftSize = 256

	gain.connect(analyser).connect(ctx.destination)

	let source: AudioBufferSourceNode | null = null

	return {
		setSpectrum(position: number) {
			if (source) {
				source.disconnect()
				source.stop()
			}

			const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
			fillBlendedBuffer(position, buffer.getChannelData(0))

			source = ctx.createBufferSource()
			source.buffer = buffer
			source.loop = true
			source.connect(gain)
			source.start()
		},
		setPaused: (paused: boolean) => (paused ? ctx.suspend() : ctx.resume()),
		setGain: (val: number) => {
			gain.gain.value = val
		},
		getFrequencyData: () => {
			const arr = new Uint8Array(analyser.frequencyBinCount)
			analyser.getByteFrequencyData(arr)
			return arr
		},
		close: () => ctx.state !== 'closed' && ctx.close(),
	}
}

function Root() {
	const [volume, setVolume] = useState(0.5)
	const [spectrum, setSpectrum] = useState(0)
	const [isPaused, setIsPaused] = useState(true)
	const togglePause = () => setIsPaused((p) => !p)

	useHotkeys([['space', togglePause]])

	const engineRef = useRef<ReturnType<typeof createNoiseEngine> | null>(null)
	const barsRef = useRef<(SVGRectElement | null)[]>([])
	const animRef = useRef(0)
	const colorArrayRef = useRef(buildBlendedColorArray(0.25))

	useEffect(() => {
		const engine = createNoiseEngine()
		engineRef.current = engine

		const animate = () => {
			const data = engine.getFrequencyData()
			const colors = colorArrayRef.current

			for (let i = 0; i < data.length; i++) {
				const bar = barsRef.current[i]
				if (!bar) continue

				const barHeight = scaleBarHeight(data[i])
				bar.setAttribute('height', String(barHeight))
				bar.setAttribute('y', String((SVG_HEIGHT - barHeight) / 2))
				bar.setAttribute('fill', colors[data[i]])
			}

			animRef.current = requestAnimationFrame(animate)
		}

		animRef.current = requestAnimationFrame(animate)

		return () => {
			cancelAnimationFrame(animRef.current)
			engine.close()
		}
	}, [])

	useEffect(() => {
		engineRef.current?.setSpectrum(spectrum)
		colorArrayRef.current = buildBlendedColorArray(spectrum)
	}, [spectrum])

	useEffect(() => {
		const engine = engineRef.current
		if (!engine) return

		engine.setPaused(isPaused)
		engine.setGain(volume)
	}, [isPaused, volume])

	return (
		<ThemeProvider>
			<main className='grid grid-rows-[auto_auto_1fr] h-screen gap-4 overflow-hidden p-4'>
				<h1 className='text-2xl font-bold text-center'>Noise Generator</h1>

				<div className='grid'>
					<Range
						className='w-full'
						max={1}
						step={0.005}
						value={spectrum}
						onChange={(e) => setSpectrum(+e.target.value)}
					/>
					<div className='flex justify-between py-2'>
						{SPECTRUM_ENTRIES.map((s) => (
							<Button key={s.type} className='btn btn-ghost btn-xs' onClick={() => setSpectrum(s.position)}>
								{s.label}
							</Button>
						))}
					</div>

					<p className='text-xs opacity-75 text-center'>{getSpectrumLabel(spectrum)}</p>

					<Field label={`Volume: ${Math.round(volume * 100)}%`} labelPlacement='top-center'>
						<Range className='w-full' max={1} step={0.01} value={volume} onChange={(e) => setVolume(+e.target.value)} />
					</Field>
				</div>

				<svg
					aria-label='Noise frequency spectrum'
					className='h-full min-h-0 w-full max-w-full'
					preserveAspectRatio='none'
					viewBox={`0 0 100 ${SVG_HEIGHT}`}
				>
					{[...Array(BIN_COUNT).keys()].map((i) => (
						<rect
							key={i}
							rx={BAR_WIDTH / 2}
							ref={(el) => {
								barsRef.current[i] = el
							}}
							width={BAR_WIDTH}
							x={CELL_WIDTH * i + BAR_OFFSET}
							height={0}
							y={SVG_HEIGHT / 2}
						/>
					))}
				</svg>

				<div className='fab'>
					<Button className='fab-main-action btn-circle btn-lg' onClick={togglePause}>
						{isPaused ? <LuPlay /> : <LuPause />}
					</Button>
				</div>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
