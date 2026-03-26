import { Button, Field, Input, Modal, Range, Select, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { defineHex, Grid, hexToPoint, Orientation, rectangle } from 'https://esm.sh/honeycomb-grid'
import { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuDownload, LuSettings } from 'https://esm.sh/react-icons/lu'

const mapValue = (v: number, [inMin, inMax]: [number, number], [outMin, outMax]: [number, number]) =>
	((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin

type ColorCtx = { pH: number; s: number; w: number; x: number; y: number }

type StrategyDef = { fn: (ctx: ColorCtx) => { ht: number; t: number }; label: string }

const STRATEGIES = {
	cosineWave: {
		fn: ({ pH, w, x, y }) => {
			const cosX = -Math.cos(mapValue(x, [0, w], [0, 2 * Math.PI])) + 1
			const cosY = -Math.cos(mapValue(y, [0, pH], [0, 2 * Math.PI])) + 1
			return { ht: mapValue(x, [0, w], [0, 1]), t: (cosX + cosY) / 4 + Math.random() * 0.15 }
		},
		label: 'Cosine Wave',
	},
	plasma: {
		fn: ({ pH, w, x, y }) => {
			const nx = x / w
			const ny = y / pH
			const v1 = Math.sin(nx * 4 * Math.PI)
			const v2 = Math.sin(ny * 4 * Math.PI)
			const v3 = Math.sin((nx + ny) * 3 * Math.PI)
			const v4 = Math.sin(Math.sqrt(nx * nx + ny * ny) * 6 * Math.PI)
			const t = (v1 + v2 + v3 + v4 + 4) / 8
			return { ht: t, t: t + Math.random() * 0.1 }
		},
		label: 'Plasma',
	},
	metaHex: {
		fn: ({ s, x, y }) => {
			const macroSize = s * 3
			const sqrt3 = Math.sqrt(3)
			const q = ((2 / 3) * x) / macroSize
			const r = ((-1 / 3) * x + (sqrt3 / 3) * y) / macroSize
			const s2 = -q - r
			let rq = Math.round(q)
			let rr = Math.round(r)
			const rs = Math.round(s2)
			const dq = Math.abs(rq - q)
			const dr = Math.abs(rr - r)
			const ds = Math.abs(rs - s2)

			if (dq > dr && dq > ds) rq = -rr - rs
			else if (dr > ds) rr = -rq - rs

			const cx = macroSize * (3 / 2) * rq
			const cy = macroSize * sqrt3 * (rr + rq / 2)
			const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / macroSize
			const seed = rq * 7919 + rr * 6271
			const cellVal = (((Math.sin(seed) * 43758.5453) % 1) + 1) % 1
			const edge = Math.min(1, dist / 0.9)
			const t = cellVal * 0.6 + edge * 0.3 + Math.random() * 0.1
			return { ht: cellVal, t }
		},
		label: 'Meta Hex',
	},
	waveInterference: {
		fn: ({ pH, w, x, y }) => {
			const nx = (x / w) * Math.PI * 2
			const ny = (y / pH) * Math.PI * 2
			const w1 = Math.sin(nx * 3 + ny * 1.5)
			const w2 = Math.sin(nx * 1.5 - ny * 3)
			const w3 = Math.cos(nx * 2 + ny * 2)
			const t = (w1 + w2 + w3 + 3) / 6
			return { ht: (w1 + w2 + 2) / 4, t: t + Math.random() * 0.08 }
		},
		label: 'Wave Interference',
	},
} satisfies Record<string, StrategyDef>

type Strategy = keyof typeof STRATEGIES

type Params = {
	border: number
	chromaMax: number
	chromaMin: number
	hueEnd: number
	hueStart: number
	lightnessMax: number
	lightnessMin: number
	orientation: 'flat' | 'pointy'
	pHeight: number
	pWidth: number
	sideLength: number
	strategy: Strategy
	strokeMultiplier: number
}

const DEFAULTS: Params = {
	border: 2,
	chromaMax: 0.2,
	chromaMin: 0.05,
	hueEnd: 300,
	hueStart: 180,
	lightnessMax: 0.25,
	lightnessMin: 0.01,
	orientation: 'pointy',
	pHeight: screen.height * window.devicePixelRatio,
	pWidth: screen.width * window.devicePixelRatio,
	sideLength: 15,
	strategy: 'cosineWave',
	strokeMultiplier: 0.85,
}

const oklch = ({ c, h, l }: { c: number; h: number; l: number }) => `oklch(${l} ${c} ${h})`

const drawGrid = (canvas: HTMLCanvasElement, params: Params) => {
	const {
		border,
		chromaMax,
		chromaMin,
		hueEnd,
		hueStart,
		lightnessMax,
		lightnessMin,
		orientation,
		pHeight,
		pWidth,
		sideLength,
		strategy,
		strokeMultiplier,
	} = params

	canvas.width = pWidth
	canvas.height = pHeight
	const ctx = canvas.getContext('2d')!
	const colorFn = STRATEGIES[strategy].fn

	const Hex = defineHex({
		dimensions: sideLength,
		orientation: orientation === 'pointy' ? Orientation.POINTY : Orientation.FLAT,
	})

	const grid = new Grid(
		Hex,
		rectangle({ width: Math.ceil(pWidth / sideLength), height: Math.ceil(pHeight / sideLength) }),
	)

	const { corners } = new Hex()
	ctx.clearRect(0, 0, pWidth, pHeight)

	grid.forEach((hex) => {
		const { x, y } = hexToPoint(hex)
		const { ht, t } = colorFn({ pH: pHeight, s: sideLength, w: pWidth, x, y })
		const clampedT = Math.min(1, Math.max(0, t))
		const fill = {
			c: mapValue(clampedT, [0, 1], [chromaMin, chromaMax]),
			h: mapValue(Math.min(1, Math.max(0, ht)), [0, 1], [hueStart, hueEnd]),
			l: mapValue(clampedT, [0, 1], [lightnessMin, lightnessMax]),
		}
		const stroke = { ...fill, l: Math.max(0, fill.l * strokeMultiplier) }

		ctx.beginPath()
		ctx.moveTo(x + corners[0].x, y + corners[0].y)
		for (const c of corners.values().drop(1)) ctx.lineTo(x + c.x, y + c.y)
		ctx.closePath()
		ctx.fillStyle = oklch(fill)
		ctx.fill()
		ctx.lineWidth = border
		ctx.strokeStyle = oklch(stroke)
		ctx.stroke()
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
	onOpenChange: (v: boolean) => void
	open: boolean
	params: Params
	setParams: React.Dispatch<React.SetStateAction<Params>>
}) {
	const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }))

	return (
		<Modal open={open} onOpenChange={onOpenChange} className='w-fit'>
			<Field label='Strategy'>
				<Select value={params.strategy} onChange={(e) => set('strategy', e.target.value as Strategy)}>
					{Object.entries(STRATEGIES).map(([k, v]) => (
						<option key={k} value={k}>
							{v.label}
						</option>
					))}
				</Select>
			</Field>
			<Field label='Width'>
				<Input type='number' value={params.pWidth} onChange={(e) => set('pWidth', +e.target.value)} />
			</Field>
			<Field label='Height'>
				<Input type='number' value={params.pHeight} onChange={(e) => set('pHeight', +e.target.value)} />
			</Field>
			<Field label={`Side Length: ${params.sideLength}`}>
				<Range min={5} max={50} value={params.sideLength} onChange={(e) => set('sideLength', +e.target.value)} />
			</Field>
			<Field label={`Border: ${params.border}`}>
				<Range min={0} max={10} value={params.border} onChange={(e) => set('border', +e.target.value)} />
			</Field>
			<Field label={`Stroke Multiplier: ${params.strokeMultiplier}`}>
				<Range
					min={0}
					max={2}
					step={0.05}
					value={params.strokeMultiplier}
					onChange={(e) => set('strokeMultiplier', +e.target.value)}
				/>
			</Field>
			<Field label={`Hue Start: ${params.hueStart}`}>
				<Range min={0} max={360} value={params.hueStart} onChange={(e) => set('hueStart', +e.target.value)} />
			</Field>
			<Field label={`Hue End: ${params.hueEnd}`}>
				<Range min={0} max={360} value={params.hueEnd} onChange={(e) => set('hueEnd', +e.target.value)} />
			</Field>
			<Field label={`Lightness Min: ${params.lightnessMin}`}>
				<Range
					min={0}
					max={1}
					step={0.01}
					value={params.lightnessMin}
					onChange={(e) => set('lightnessMin', +e.target.value)}
				/>
			</Field>
			<Field label={`Lightness Max: ${params.lightnessMax}`}>
				<Range
					min={0}
					max={1}
					step={0.01}
					value={params.lightnessMax}
					onChange={(e) => set('lightnessMax', +e.target.value)}
				/>
			</Field>
			<Field label={`Chroma Min: ${params.chromaMin}`}>
				<Range
					min={0}
					max={0.4}
					step={0.01}
					value={params.chromaMin}
					onChange={(e) => set('chromaMin', +e.target.value)}
				/>
			</Field>
			<Field label={`Chroma Max: ${params.chromaMax}`}>
				<Range
					min={0}
					max={0.4}
					step={0.01}
					value={params.chromaMax}
					onChange={(e) => set('chromaMax', +e.target.value)}
				/>
			</Field>
			<Field label='Orientation'>
				<Select
					value={params.orientation}
					onChange={(e) => set('orientation', e.target.value as Params['orientation'])}
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
