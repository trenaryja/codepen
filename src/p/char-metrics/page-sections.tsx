import { RadioGroup } from 'https://esm.sh/@trenaryja/ui'
import type { Dispatch, SetStateAction } from 'https://esm.sh/react'
import React from 'https://esm.sh/react'
import * as R from 'https://esm.sh/remeda'
import { Char } from './diagram-parts'
import { FG, MONO } from './font-metrics'
import { GROUPS } from './glossary-lookup'
import type { Specimen } from './layout'
import { computeLayout } from './layout'
import type { FontWeightSize, LeadingSize, TextBoxTrim, TrackingSize } from './specimen-options'
import { FONT_WEIGHTS, LEADING_RATIOS, radioProps, TEXT_BOX_TRIMS, TRACKING_EMS } from './specimen-options'

export function Idle({ width, height, family, fontWeight }: Specimen) {
	const layout = computeLayout({ sample: 'Ag', fontSize: 140, family, fontWeight, width, height })
	const lines: [number, string][] = [
		[layout.baselineY, 'baseline'],
		[layout.baselineY - layout.xHeight, 'x-height'],
		[layout.baselineY - layout.capHeight, 'cap height'],
		[layout.baselineY - layout.fontAscent, 'ascent'],
		[layout.baselineY + layout.fontDescent, 'descent'],
		[layout.baselineY + layout.descenderDepth, 'descender'],
	]
	return (
		<>
			<Char text='Ag' font={layout.font} x={layout.charX} baseline={layout.baselineY} color={FG} alpha={0.08} />
			{lines.map(([y, label]) => (
				<g key={label}>
					<line x1={0} y1={y} x2={width} y2={y} stroke={FG} strokeWidth={1} strokeDasharray='3 6' opacity={0.08} />
					<text x={width - 8} y={y - 3} fill={FG} opacity={0.12} fontSize={10} fontFamily={MONO} textAnchor='end'>
						{label}
					</text>
				</g>
			))}
		</>
	)
}

export function PageIntro() {
	return (
		<header className='border-base-300 border-b px-8 pt-14 pb-10'>
			<p className='text-base-content/40 mb-3 font-mono text-xs tracking-[.18em] uppercase'>
				OpenType · CSS · Reference
			</p>
			<h1 className='mb-3 font-[Instrument_Serif] text-[clamp(2.6rem,4.5vw,3.8rem)] leading-[1.1] tracking-tight'>
				Typography Metrics
			</h1>
			<p className='text-base-content/60 max-w-prose text-sm leading-relaxed'>
				A visual glossary of the measurements and terminology used to describe the anatomy of a typeface. Hover any term
				to see it illustrated.
			</p>
		</header>
	)
}

export function FontControls({
	family,
	setFamily,
	fontWeightSize,
	setFontWeightSize,
}: {
	family: string
	setFamily: (family: string) => void
	fontWeightSize: FontWeightSize
	setFontWeightSize: (fontWeightSize: FontWeightSize) => void
}) {
	return (
		<div className='border-base-300 border-b'>
			<div className='border-base-300/50 flex items-center border-b px-4 py-2'>
				<div className='join'>
					{(['serif', 'sans', 'mono'] as const).map((key) => (
						<button
							key={key}
							type='button'
							className={`join-item btn btn-xs${family === key ? 'btn-active' : ''}`}
							onClick={() => setFamily(key)}
						>
							{key.charAt(0).toUpperCase() + key.slice(1)}
						</button>
					))}
				</div>
			</div>
			<div className='flex items-center px-4 py-2'>
				<RadioGroup
					variant='btn'
					value={fontWeightSize}
					{...radioProps(R.keys(FONT_WEIGHTS), setFontWeightSize)}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			</div>
		</div>
	)
}

// The strip under the diagram: the active term's name, plus whichever control that
// term is adjustable by — leading, tracking, or text-box trim.
export function DiagramFooter({
	activeId,
	activeName,
	leadingSize,
	setLeadingSize,
	trackingSize,
	setTrackingSize,
	textBoxTrim,
	setTextBoxTrim,
}: {
	activeId: string | null
	activeName: string
	leadingSize: LeadingSize
	setLeadingSize: (leadingSize: LeadingSize) => void
	trackingSize: TrackingSize
	setTrackingSize: (trackingSize: TrackingSize) => void
	textBoxTrim: TextBoxTrim
	setTextBoxTrim: (textBoxTrim: TextBoxTrim) => void
}) {
	return (
		<div className='border-base-300 flex min-h-10 items-center justify-between border-t px-4 py-2.5'>
			<span className='text-base-content/50 font-mono text-xs'>{activeName}</span>
			{(activeId === 'leading' || activeId === 'lineheight') && (
				<RadioGroup
					variant='btn'
					value={leadingSize}
					{...radioProps(R.keys(LEADING_RATIOS), setLeadingSize)}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			)}
			{activeId === 'tracking' && (
				<RadioGroup
					variant='btn'
					value={trackingSize}
					{...radioProps(R.keys(TRACKING_EMS), setTrackingSize)}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			)}
			{activeId === 'textboxtrim' && (
				<RadioGroup
					variant='btn'
					value={textBoxTrim}
					{...radioProps(TEXT_BOX_TRIMS, setTextBoxTrim)}
					className='join'
					classNames={{ item: 'join-item btn-xs' }}
				/>
			)}
		</div>
	)
}

export function Glossary({
	activeId,
	pinned,
	isMobile,
	setHovered,
	setPinned,
}: {
	activeId: string | null
	pinned: string | null
	isMobile: boolean
	setHovered: (id: string | null) => void
	setPinned: Dispatch<SetStateAction<string | null>>
}) {
	return (
		<div className={isMobile ? 'px-4 pt-5' : ''}>
			{GROUPS.map((group) => (
				<div key={group.name} className='mb-11'>
					<h2 className='text-base-content/40 border-base-300 mb-1 border-b pb-3 font-mono text-xs tracking-[.18em] uppercase'>
						{group.name}
					</h2>
					{group.terms.map((term) => (
						<button
							key={term.id}
							type='button'
							className={`hover:bg-base-200 hover:border-base-300 mt-1 block w-full rounded-lg border p-3 text-left transition-colors ${activeId === term.id ? 'bg-base-200 border-base-300' : 'border-transparent'}`}
							onMouseEnter={() => !pinned && setHovered(term.id)}
							onMouseLeave={() => !pinned && setHovered(null)}
							onClick={() => setPinned((current) => (current === term.id ? null : term.id))}
						>
							<p className='mb-1 font-mono text-sm font-medium'>{term.name}</p>
							<p className='text-base-content/60 text-xs leading-relaxed'>{term.definition}</p>
						</button>
					))}
				</div>
			))}
		</div>
	)
}
