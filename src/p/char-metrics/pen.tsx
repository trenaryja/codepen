import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useRef, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { BASE_HEIGHT } from './font-metrics'
import { findTerm, renderTerm } from './glossary-lookup'
import { DiagramFooter, FontControls, Glossary, Idle, PageIntro } from './page-sections'
import type { FontWeightSize, LeadingSize, TextBoxTrim, TrackingSize } from './specimen-options'
import { FONT_WEIGHTS, LEADING_RATIOS, TRACKING_EMS } from './specimen-options'

function App() {
	const panelRef = useRef<HTMLDivElement>(null)
	const [family, setFamily] = useState('serif')
	const [pinned, setPinned] = useState<string | null>(null)
	const [hovered, setHovered] = useState<string | null>(null)
	const [size, setSize] = useState({ width: 330, height: 400, isMobile: false })
	const { width, height, isMobile } = size
	const [fontWeightSize, setFontWeightSize] = useState<FontWeightSize>('normal')
	const [leadingSize, setLeadingSize] = useState<LeadingSize>('md')
	const [trackingSize, setTrackingSize] = useState<TrackingSize>('widest')
	const [textBoxTrim, setTextBoxTrim] = useState<TextBoxTrim>('both')

	const specimen = {
		family,
		width,
		height,
		fontWeight: FONT_WEIGHTS[fontWeightSize],
		lineHeightRatio: LEADING_RATIOS[leadingSize],
		trackingEm: TRACKING_EMS[trackingSize],
		textBoxTrim,
	}

	const activeId = pinned ?? hovered
	const activeTerm = activeId ? findTerm(activeId) : null

	useEffect(() => {
		const panel = panelRef.current
		if (!panel) return
		let rafId: number | null = null
		const observer = new ResizeObserver(() => {
			if (rafId !== null) cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(() => {
				rafId = null
				const style = getComputedStyle(panel)
				const mobile = style.getPropertyValue('--mobile').trim() === '1'
				const panelWidth = Math.round(
					panel.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
				)
				if (panelWidth)
					setSize({
						width: panelWidth,
						height: mobile ? Math.round(panelWidth * 0.48) : BASE_HEIGHT,
						isMobile: mobile,
					})
			})
		})
		observer.observe(panel)

		return () => {
			observer.disconnect()
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [])

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setPinned(null)
		}

		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Reset the specimen controls whenever a new glossary term becomes active
	const [prevActiveId, setPrevActiveId] = useState(activeId)

	if (prevActiveId !== activeId) {
		setPrevActiveId(activeId)
		setLeadingSize('md')
		setTrackingSize('widest')
		setTextBoxTrim('both')
	}

	return (
		<ThemeProvider>
			<div className='full-bleed-container bg-base-100 text-base-content min-h-screen'>
				<div className='content-root'>
					<PageIntro />
					<div className={`main-grid${isMobile ? 'mobile' : ''}`}>
						<div ref={panelRef} className='diagram-panel sticky top-6' style={isMobile ? { width: '100%' } : undefined}>
							<div className='rounded-box border-base-300 bg-base-200 overflow-hidden border'>
								<FontControls
									family={family}
									setFamily={setFamily}
									fontWeightSize={fontWeightSize}
									setFontWeightSize={setFontWeightSize}
								/>
								<svg
									viewBox={`0 0 ${width} ${height}`}
									width={width}
									height={height}
									style={{ display: 'block' }}
									aria-label={activeTerm?.name ?? 'Typography metrics diagram'}
								>
									{activeTerm ? renderTerm(activeTerm, specimen) : <Idle {...specimen} />}
								</svg>
								<DiagramFooter
									activeId={activeId}
									activeName={activeTerm?.name ?? ''}
									leadingSize={leadingSize}
									setLeadingSize={setLeadingSize}
									trackingSize={trackingSize}
									setTrackingSize={setTrackingSize}
									textBoxTrim={textBoxTrim}
									setTextBoxTrim={setTextBoxTrim}
								/>
							</div>
							{!isMobile && (
								<p className='pin-hint text-base-content/25 mt-2 text-center font-mono text-xs'>
									Click to pin · <kbd className='kbd kbd-xs'>Esc</kbd> to unpin
								</p>
							)}
						</div>
						<Glossary
							activeId={activeId}
							pinned={pinned}
							isMobile={isMobile}
							setHovered={setHovered}
							setPinned={setPinned}
						/>
					</div>
				</div>
			</div>
		</ThemeProvider>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(<App />)
