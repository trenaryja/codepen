import { Button, Field, Input, Modal, Range, Select, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { defineHex, Grid, hexToPoint, Orientation, rectangle } from 'https://esm.sh/honeycomb-grid'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuDownload, LuSettings } from 'https://esm.sh/react-icons/lu'

const mapValue = (value: number, [inMin, inMax]: [number, number], [outMin, outMax]: [number, number]) =>
	((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

type StrategyInput = { height: number; sideLength: number; width: number; x: number; y: number }

// `t` drives lightness/chroma, `hueT` drives hue; both are 0..1 before clamping.
type Strategy = { getColor: (input: StrategyInput) => { hueT: number; t: number }; label: string }

const STRATEGIES = {
	cosineWave: {
		getColor: ({ height, width, x, y }) => {
			const cosineX = -Math.cos(mapValue(x, [0, width], [0, 2 * Math.PI])) + 1
			const cosineY = -Math.cos(mapValue(y, [0, height], [0, 2 * Math.PI])) + 1
			return { hueT: mapValue(x, [0, width], [0, 1]), t: (cosineX + cosineY) / 4 + Math.random() * 0.15 }
		},
		label: 'Cosine Wave',
	},
	plasma: {
		getColor: ({ height, width, x, y }) => {
			const normalizedX = x / width
			const normalizedY = y / height
			const horizontal = Math.sin(normalizedX * 4 * Math.PI)
			const vertical = Math.sin(normalizedY * 4 * Math.PI)
			const diagonal = Math.sin((normalizedX + normalizedY) * 3 * Math.PI)
			const radial = Math.sin(Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY) * 6 * Math.PI)
			const t = (horizontal + vertical + diagonal + radial + 4) / 8
			return { hueT: t, t: t + Math.random() * 0.1 }
		},
		label: 'Plasma',
	},
	metaHex: {
		getColor: ({ sideLength, x, y }) => {
			// Pixel -> fractional axial (q, r) -> cube rounding, per Red Blob Games' hex guide:
			// round all three cube coords, then fix up whichever drifted most so q + r + s === 0.
			const macroSize = sideLength * 3
			const sqrt3 = Math.sqrt(3)
			const q = ((2 / 3) * x) / macroSize
			const r = ((-1 / 3) * x + (sqrt3 / 3) * y) / macroSize
			const s = -q - r
			let roundedQ = Math.round(q)
			let roundedR = Math.round(r)
			const roundedS = Math.round(s)
			const deltaQ = Math.abs(roundedQ - q)
			const deltaR = Math.abs(roundedR - r)
			const deltaS = Math.abs(roundedS - s)

			if (deltaQ > deltaR && deltaQ > deltaS) roundedQ = -roundedR - roundedS
			else if (deltaR > deltaS) roundedR = -roundedQ - roundedS

			const centerX = macroSize * (3 / 2) * roundedQ
			const centerY = macroSize * sqrt3 * (roundedR + roundedQ / 2)
			const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2) / macroSize
			// Hash the macro-hex coords into a stable 0..1 value so each macro cell keeps its tint
			const seed = roundedQ * 7919 + roundedR * 6271
			const cellValue = (((Math.sin(seed) * 43758.5453) % 1) + 1) % 1
			const edge = Math.min(1, distance / 0.9)
			return { hueT: cellValue, t: cellValue * 0.6 + edge * 0.3 + Math.random() * 0.1 }
		},
		label: 'Meta Hex',
	},
	waveInterference: {
		getColor: ({ height, width, x, y }) => {
			const angleX = (x / width) * Math.PI * 2
			const angleY = (y / height) * Math.PI * 2
			const wave1 = Math.sin(angleX * 3 + angleY * 1.5)
			const wave2 = Math.sin(angleX * 1.5 - angleY * 3)
			const wave3 = Math.cos(angleX * 2 + angleY * 2)
			return { hueT: (wave1 + wave2 + 2) / 4, t: (wave1 + wave2 + wave3 + 3) / 6 + Math.random() * 0.08 }
		},
		label: 'Wave Interference',
	},
} satisfies Record<string, Strategy>

type StrategyName = keyof typeof STRATEGIES

type Params = {
	border: number
	chromaMax: number
	chromaMin: number
	height: number
	hueEnd: number
	hueStart: number
	lightnessMax: number
	lightnessMin: number
	orientation: 'flat' | 'pointy'
	sideLength: number
	strategy: StrategyName
	strokeMultiplier: number
	width: number
}

const DEFAULTS: Params = {
	border: 2,
	chromaMax: 0,
	chromaMin: 0,
	height: screen.height * window.devicePixelRatio,
	hueEnd: 300,
	hueStart: 180,
	lightnessMax: 1,
	lightnessMin: 0,
	orientation: 'pointy',
	sideLength: 15,
	strategy: 'metaHex',
	strokeMultiplier: 0.5,
	width: screen.width * window.devicePixelRatio,
}

type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params]

// Omitted `step` leaves the attribute off the input, matching the browser's default of 1
const RANGE_CONTROLS: { key: NumericParam; label: string; max: number; min: number; step?: number }[] = [
	{ key: 'sideLength', label: 'Side Length', max: 50, min: 5 },
	{ key: 'border', label: 'Border', max: 10, min: 0 },
	{ key: 'strokeMultiplier', label: 'Stroke Multiplier', max: 2, min: 0, step: 0.05 },
	{ key: 'hueStart', label: 'Hue Start', max: 360, min: 0 },
	{ key: 'hueEnd', label: 'Hue End', max: 360, min: 0 },
	{ key: 'lightnessMin', label: 'Lightness Min', max: 1, min: 0, step: 0.01 },
	{ key: 'lightnessMax', label: 'Lightness Max', max: 1, min: 0, step: 0.01 },
	{ key: 'chromaMin', label: 'Chroma Min', max: 0.4, min: 0, step: 0.01 },
	{ key: 'chromaMax', label: 'Chroma Max', max: 0.4, min: 0, step: 0.01 },
]

const oklch = ({ chroma, hue, lightness }: { chroma: number; hue: number; lightness: number }) =>
	`oklch(${lightness} ${chroma} ${hue})`

const drawGrid = (canvas: HTMLCanvasElement, params: Params) => {
	const {
		border,
		chromaMax,
		chromaMin,
		height,
		hueEnd,
		hueStart,
		lightnessMax,
		lightnessMin,
		orientation,
		sideLength,
		strategy,
		strokeMultiplier,
		width,
	} = params

	canvas.width = width
	canvas.height = height
	const context = canvas.getContext('2d')!
	const { getColor } = STRATEGIES[strategy]

	const Hex = defineHex({
		dimensions: sideLength,
		orientation: orientation === 'pointy' ? Orientation.POINTY : Orientation.FLAT,
	})

	const grid = new Grid(
		Hex,
		rectangle({ width: Math.ceil(width / sideLength), height: Math.ceil(height / sideLength) }),
	)

	const { corners } = new Hex()
	context.clearRect(0, 0, width, height)

	grid.forEach((hex) => {
		const { x, y } = hexToPoint(hex)
		const { hueT, t } = getColor({ height, sideLength, width, x, y })
		const clampedT = clamp01(t)
		const fill = {
			chroma: mapValue(clampedT, [0, 1], [chromaMin, chromaMax]),
			hue: mapValue(clamp01(hueT), [0, 1], [hueStart, hueEnd]),
			lightness: mapValue(clampedT, [0, 1], [lightnessMin, lightnessMax]),
		}
		const stroke = { ...fill, lightness: Math.max(0, fill.lightness * strokeMultiplier) }

		context.beginPath()
		context.moveTo(x + corners[0]!.x, y + corners[0]!.y) // a hex always has 6 corners
		for (const corner of corners.values().drop(1)) context.lineTo(x + corner.x, y + corner.y)
		context.closePath()
		context.fillStyle = oklch(fill)
		context.fill()
		context.lineWidth = border
		context.strokeStyle = oklch(stroke)
		context.stroke()
	})
}

const download = (canvas: HTMLCanvasElement) => {
	canvas.toBlob((blob) => {
		if (!blob) return
		const link = document.createElement('a')
		link.download = `Hex-${Date.now()}.png`
		link.href = URL.createObjectURL(blob)
		link.click()
	}, 'image/png')
}

function SettingsModal({
	onOpenChange,
	open,
	params,
	setParams,
}: {
	onOpenChange: (open: boolean) => void
	open: boolean
	params: Params
	setParams: React.Dispatch<React.SetStateAction<Params>>
}) {
	const set = <K extends keyof Params>(key: K, value: Params[K]) => setParams((prev) => ({ ...prev, [key]: value }))

	return (
		<Modal open={open} onOpenChange={onOpenChange} className='w-fit'>
			<Field label='Strategy'>
				<Select value={params.strategy} onChange={(e) => set('strategy', e.target.value as StrategyName)}>
					{Object.entries(STRATEGIES).map(([name, strategy]) => (
						<option key={name} value={name}>
							{strategy.label}
						</option>
					))}
				</Select>
			</Field>
			<Field label='Width'>
				<Input type='number' value={params.width} onChange={(e) => set('width', +e.target.value)} />
			</Field>
			<Field label='Height'>
				<Input type='number' value={params.height} onChange={(e) => set('height', +e.target.value)} />
			</Field>
			{RANGE_CONTROLS.map(({ key, label, max, min, step }) => (
				<Field key={key} label={`${label}: ${params[key]}`}>
					<Range min={min} max={max} step={step} value={params[key]} onChange={(e) => set(key, +e.target.value)} />
				</Field>
			))}
			<Field label='Orientation'>
				<Select
					value={params.orientation}
					onChange={(e) => set('orientation', e.target.value === 'flat' ? 'flat' : 'pointy')}
				>
					<option value='pointy'>Pointy</option>
					<option value='flat'>Flat</option>
				</Select>
			</Field>
		</Modal>
	)
}

function Root() {
	const [params, setParams] = useState(DEFAULTS)
	const [settingsOpen, setSettingsOpen] = useState(false)
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		if (canvasRef.current) drawGrid(canvasRef.current, params)
	}, [params])

	return (
		<ThemeProvider>
			<div className='fixed left-2 top-2 z-10 flex gap-2'>
				<Button className='btn-ghost btn-square' onClick={() => setSettingsOpen(true)} title='Settings'>
					<LuSettings />
				</Button>
				<Button
					className='btn-ghost btn-square'
					onClick={() => canvasRef.current && download(canvasRef.current)}
					title='Download PNG'
				>
					<LuDownload />
				</Button>
			</div>
			<canvas ref={canvasRef} />
			<SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} params={params} setParams={setParams} />
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
