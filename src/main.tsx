import { Input, ThemePicker, ThemeProvider } from '@trenaryja/ui'
import { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FiChevronRight } from 'react-icons/fi'

const penModules = import.meta.glob('./p/*/index.html', { query: '?raw', import: 'default', eager: false })

const slugFromPath = (path: string) => path.split('/').at(-2) ?? path

type Item = { slug: string; href: string }

const items: Item[] = Object.keys(penModules)
	.map(slugFromPath)
	.sort((a, b) => a.localeCompare(b))
	.map((slug) => ({ slug, href: `/p/${slug}/` }))

const IFRAME_W = 1024
const IFRAME_H = 768

const PenCard = ({ slug, href }: Item) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const [scale, setScale] = useState(0)

	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const obs = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / IFRAME_W))
		obs.observe(el)
		return () => obs.disconnect()
	}, [])

	return (
		<a
			href={href}
			className='group rounded-box border border-current/25 overflow-hidden shadow-md transition-all hover:-translate-y-1 hover:shadow-xl'
		>
			<div ref={containerRef} className='relative overflow-hidden' style={{ aspectRatio: `${IFRAME_W}/${IFRAME_H}` }}>
				{scale > 0 && (
					<iframe
						src={href}
						title={slug}
						loading='lazy'
						tabIndex={-1}
						className='pointer-events-none absolute inset-0 origin-top-left'
						style={{ width: IFRAME_W, height: IFRAME_H, transform: `scale(${scale})` }}
					/>
				)}
			</div>
			<div className='flex items-center justify-between gap-2 p-4 bg-base-300'>
				<span className='truncate text-sm font-semibold'>{slug}</span>
				<FiChevronRight className='opacity-0 transition-opacity group-hover:opacity-100' />
			</div>
		</a>
	)
}

const App = () => {
	const [query, setQuery] = useState('')
	const q = query.toLowerCase()
	const filtered = items.filter((item) => item.slug.includes(q))

	return (
		<ThemeProvider>
			<div className='min-h-screen full-bleed-container content-start gap-y-4 p-4'>
				<div className='flex gap-4 items-center'>
					<ThemePicker variant='modal' />
					<Input placeholder='Search…' value={query} onChange={(e) => setQuery(e.target.value)} />
				</div>

				{filtered.length === 0 ? (
					<p className='text-base-content/50'>No results.</p>
				) : (
					<div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
						{filtered.map((item) => (
							<PenCard key={item.href} {...item} />
						))}
					</div>
				)}
			</div>
		</ThemeProvider>
	)
}

const container = document.getElementById('root')!
const extended = container as unknown as Record<string, Root>
extended.__root = extended.__root ?? createRoot(container)
extended.__root.render(<App />)
