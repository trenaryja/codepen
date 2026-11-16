import { useDebouncedValue } from 'https://esm.sh/@mantine/hooks'
import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'
import { getQRInfo, optimizeForQR } from './qr-info'
import {
	QR_CODE_ECC_RECOVERY,
	QR_CODE_PARAMS,
	QR_CODE_VARIANTS,
	QRCode,
	type QRCodeEccLevel,
	type QRCodeParams,
	type QRCodeVariant,
} from './QRCode'

type ParamName = keyof QRCodeParams

const PARAM_SPECS = {
	blur: { variant: 'blob', label: 'Blur', min: 0.05, max: 1.5, step: 0.05 },
	threshold: { variant: 'blob', label: 'Threshold', min: 5, max: 50, step: 1 },
	minDotRadius: { variant: 'halftone', label: 'Min size', min: 0, max: 1, step: 0.01 },
	dotRadiusRange: { variant: 'halftone', label: 'Range', min: 0, max: 1, step: 0.01 },
	depth: { variant: 'isometric', label: 'Depth', min: 0, max: 1, step: 0.05 },
	hexRadius: { variant: 'hex', label: 'Hex radius', min: 0.2, max: 0.9, step: 0.01 },
} as const satisfies Record<
	ParamName,
	{ label: string; max: number; min: number; step: number; variant: QRCodeVariant }
>

type SliderProps = {
	params: QRCodeParams
	setParam: (name: ParamName, value: number) => void
	variant: QRCodeVariant
}

const Sliders = ({ params, variant, setParam }: SliderProps) => {
	const variantSpecs = R.entries(PARAM_SPECS).filter(([, spec]) => spec.variant === variant)
	if (!variantSpecs.length) return null

	return (
		<div className='flex w-full max-w-xs flex-col gap-2'>
			{variantSpecs.map(([name, spec]) => (
				<label key={name} className='flex items-center gap-3'>
					<span className='w-28 shrink-0 text-sm opacity-60'>{spec.label}</span>
					<input
						type='range'
						className='range range-sm flex-1'
						min={spec.min}
						max={spec.max}
						step={spec.step}
						value={params[name]}
						onChange={(e) => setParam(name, +e.target.value)}
					/>
					<span className='w-10 text-right font-mono text-xs tabular-nums'>
						{params[name].toFixed(spec.step >= 1 ? 0 : 2)}
					</span>
				</label>
			))}
		</div>
	)
}

type StatsPanelProps = { capacity: number | null; charCount: number; moduleCount: number; version: number }

const StatsPanel = ({ version, moduleCount, charCount, capacity }: StatsPanelProps) => (
	<div className='stats stats-vertical sm:stats-horizontal shadow'>
		<div className='stat'>
			<div className='stat-title'>Version</div>
			<div className='stat-value'>{version}</div>
			<div className='stat-desc'>
				{moduleCount} × {moduleCount} modules
			</div>
		</div>
		<div className='stat'>
			<div className='stat-title'>Capacity</div>
			<div className='stat-value'>
				{charCount}
				{capacity !== null && <span className='text-lg font-normal opacity-40'>/{capacity}</span>}
			</div>
			<div className='stat-desc'>
				{capacity === null ? 'mixed mode — varies by segment' : `${capacity - charCount} chars remaining`}
			</div>
		</div>
	</div>
)

const Root = () => {
	const [text, setText] = useState('https://example.com')
	const [undoText, setUndoText] = useState<string | null>(null)
	const [variant, setVariant] = useState<QRCodeVariant>('classic')
	const [ecc, setEcc] = useState<QRCodeEccLevel>('L')
	const [params, setParams] = useState(QR_CODE_PARAMS)
	const [debouncedText] = useDebouncedValue(text, 250)
	const textInfo = getQRInfo(debouncedText, ecc)
	const optText = optimizeForQR(debouncedText)
	const optInfo = getQRInfo(optText, ecc)
	const canOptimize = optText !== debouncedText && !!textInfo && !!optInfo && optInfo.version < textInfo.version
	const setParam = (name: ParamName, value: number) => setParams((prev) => ({ ...prev, [name]: value }))

	const applyOptimize = () => {
		setUndoText(text)
		setText(optText)
	}

	return (
		<ThemeProvider>
			<main className='grid min-h-screen place-items-center content-center gap-8 p-10'>
				<div className='join'>
					<input
						className='input join-item'
						type='url'
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder='Enter URL'
					/>
					{undoText && (
						<button
							type='button'
							className='btn join-item'
							onClick={() => {
								setText(undoText)
								setUndoText(null)
							}}
						>
							Undo
						</button>
					)}
				</div>

				<div className='join flex-wrap justify-center'>
					{QR_CODE_VARIANTS.map((option) => (
						<button
							key={option}
							type='button'
							className={`btn join-item btn-sm capitalize ${variant === option ? 'btn-active' : ''}`}
							onClick={() => setVariant(option)}
						>
							{option}
						</button>
					))}
				</div>

				<div className='join'>
					{R.entries(QR_CODE_ECC_RECOVERY).map(([level, recovery]) => (
						<button
							key={level}
							type='button'
							title={`ECC ${level} — recovers up to ${recovery}% damage`}
							className={`btn join-item btn-sm ${ecc === level ? 'btn-active' : ''}`}
							onClick={() => setEcc(level)}
						>
							{level}
						</button>
					))}
				</div>

				<Sliders params={params} variant={variant} setParam={setParam} />

				{textInfo && (
					<>
						<div className={`flex items-start gap-8 ${canOptimize ? 'flex-row' : 'flex-col items-center'}`}>
							<div className='flex flex-col items-center gap-2'>
								<QRCode className='shadow' value={debouncedText} ecc={ecc} variant={variant} params={params} />
								{canOptimize && <span className='max-w-40 truncate font-mono text-xs opacity-40'>{debouncedText}</span>}
							</div>
							{canOptimize && (
								<div className='flex flex-col items-center gap-2'>
									<QRCode className='shadow' value={optText} ecc={ecc} variant={variant} params={params} />
									<span className='max-w-40 truncate font-mono text-xs opacity-40'>{optText}</span>
									<button type='button' className='btn btn-success btn-xs' onClick={applyOptimize}>
										Apply · {optInfo.mode} v{optInfo.version}
									</button>
								</div>
							)}
						</div>
						<StatsPanel
							version={textInfo.version}
							moduleCount={textInfo.moduleCount}
							charCount={debouncedText.length}
							capacity={textInfo.capacity}
						/>
					</>
				)}
			</main>
		</ThemeProvider>
	)
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(<Root />)
