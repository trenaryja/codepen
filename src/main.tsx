import { Input, RadioGroup, ThemePicker, ThemeProvider } from '@trenaryja/ui'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

const penModules = import.meta.glob('./p/*/index.html', { query: '?raw', import: 'default', eager: false })
const templateModules = import.meta.glob('./t/*/index.html', { query: '?raw', import: 'default', eager: false })

const slugFromPath = (path: string) => path.split('/').at(-2) ?? path

const pens = Object.keys(penModules).map(slugFromPath)
const templates = Object.keys(templateModules).map(slugFromPath)

type Item = { slug: string; href: string; tag?: string }

const all: Item[] = [
	...pens.map((slug) => ({ slug, href: `/p/${slug}/` })),
	...templates.map((slug) => ({ slug, href: `/t/${slug}/`, tag: 'template' })),
].sort((a, b) => a.slug.localeCompare(b.slug))

const PenCard = ({ slug, href, tag }: Item) => (
	<div className='relative'>
		{tag && (
			<span className='badge badge-soft badge-sm absolute -top-2 right-2 z-10'>
				<span>{tag}</span>
				<span className='status status-primary' />
			</span>
		)}
		<a href={href} className='btn btn-lg btn-block justify-start'>
			{slug}
		</a>
	</div>
)

const filterOptions = ['all', 'pens', 'templates'] as const
type FilterOption = (typeof filterOptions)[number]

const App = () => {
	const [query, setQuery] = useState('')
	const [filter, setFilter] = useState<FilterOption>('all')
	const q = query.toLowerCase()

	const items = all.filter((item) => {
		if (filter === 'pens' && item.tag) return false
		if (filter === 'templates' && !item.tag) return false
		return item.slug.includes(q)
	})

	return (
		<ThemeProvider>
			<div className='min-h-screen full-bleed-container content-start gap-10 p-10'>
				<header className='flex items-start justify-between gap-4'>
					<div className='grid gap-1'>
						<h1 className='text-3xl font-bold'>CodePen Local</h1>
						<span className='flex items-center gap-1'>
							<kbd className='kbd'>bun run penx new</kbd>
							<span>to create new pens</span>
						</span>
					</div>
					<ThemePicker variant='modal' />
				</header>

				<div className='flex gap-4 items-center'>
					<Input placeholder='Search…' value={query} onChange={(e) => setQuery(e.target.value)} />
					<RadioGroup
						variant='btn'
						options={[...filterOptions]}
						value={filter}
						onChange={(e) => setFilter(e.target.value as FilterOption)}
					/>
				</div>

				{items.length === 0 ? (
					<p className='text-base-content/50'>No results.</p>
				) : (
					<div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'>
						{items.map((item) => (
							<PenCard key={item.href} {...item} />
						))}
					</div>
				)}
			</div>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
