import { useDebouncedValue } from 'https://esm.sh/@mantine/hooks'
import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import * as R from 'https://esm.sh/remeda'
import { ECC_LEVELS, type EccLevel, getQRInfo, optimizeForQR } from './qr-info'
import { ECC_LABELS, PARAM_SPECS, type ParamName, type Params, STYLES, type StyleName, renderQR } from './qr-render'

type SliderProps = {
	params: Params
	setParam: (name: ParamName, value: number) => void
	style: StyleName
}

const Sliders = ({ params, style, setParam }: SliderProps) => {
	const styleSpecs = R.entries(PARAM_SPECS).filter(([, spec]) => spec.style === style)
	if (!styleSpecs.length) return null

	return (
		<div className='flex w-full max-w-xs flex-col gap-2'>
			{styleSpecs.map(([name, spec]) => (
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
	const [style, setStyle] = useState<StyleName>('classic')
	const [ecc, setEcc] = useState<EccLevel>('L')
	const [params, setParams] = useState<Params>(R.mapValues(PARAM_SPECS, (spec) => spec.default))
	const svgRef = useRef<SVGSVGElement>(null)
	const svgOptRef = useRef<SVGSVGElement>(null)
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

	useEffect(() => {
		if (svgRef.current && debouncedText) renderQR(svgRef.current, debouncedText, { ecc, style, params })
	}, [debouncedText, ecc, style, params])

	useEffect(() => {
		if (svgOptRef.current && canOptimize) renderQR(svgOptRef.current, optText, { ecc, style, params })
	}, [optText, canOptimize, ecc, style, params])

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
					{STYLES.map((s) => (
						<button
							key={s}
							type='button'
							className={`btn join-item btn-sm capitalize ${style === s ? 'btn-active' : ''}`}
							onClick={() => setStyle(s)}
						>
							{s}
						</button>
					))}
				</div>

				<div className='join'>
					{ECC_LEVELS.map((lvl) => (
						<button
							key={lvl}
							type='button'
							title={`ECC ${lvl} — recovers up to ${ECC_LABELS[lvl]} damage`}
							className={`btn join-item btn-sm ${ecc === lvl ? 'btn-active' : ''}`}
							onClick={() => setEcc(lvl)}
						>
							{lvl}
						</button>
					))}
				</div>

				<Sliders params={params} style={style} setParam={setParam} />

				{textInfo && (
					<>
						<div className={`flex items-start gap-8 ${canOptimize ? 'flex-row' : 'flex-col items-center'}`}>
							<div className='flex flex-col items-center gap-2'>
								<svg ref={svgRef} className='shadow' />
								{canOptimize && <span className='max-w-40 truncate font-mono text-xs opacity-40'>{debouncedText}</span>}
							</div>
							{canOptimize && (
								<div className='flex flex-col items-center gap-2'>
									<svg ref={svgOptRef} className='shadow' />
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
