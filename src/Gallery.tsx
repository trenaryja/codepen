// Vite's import.meta.glob to discover pens and templates at build time
const penModules = import.meta.glob('./p/*/index.html', {
	query: '?raw',
	import: 'default',
	eager: false,
})
const templateModules = import.meta.glob('./t/*/index.html', {
	query: '?raw',
	import: 'default',
	eager: false,
})

function slugFromPath(path: string): string {
	// "../p/hello-react/index.html" → "hello-react"
	return path.split('/').at(-2) ?? path
}

const pens = Object.keys(penModules).map(slugFromPath)
const templates = Object.keys(templateModules).map(slugFromPath)

export default function Gallery() {
	return (
		<div
			style={{
				fontFamily: 'system-ui, sans-serif',
				maxWidth: 900,
				margin: '0 auto',
				padding: '2rem 1rem',
			}}
		>
			<h1
				style={{
					fontSize: '1.75rem',
					fontWeight: 700,
					marginBottom: '0.25rem',
				}}
			>
				CodePen Local
			</h1>
			<p style={{ color: '#666', marginBottom: '2rem' }}>
				{pens.length} pen{pens.length !== 1 ? 's' : ''} · run <code>bun run penx new</code> to create one
			</p>

			<section>
				<h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Pens</h2>
				{pens.length === 0 ? (
					<p style={{ color: '#999' }}>No pens yet.</p>
				) : (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
							gap: '1rem',
						}}
					>
						{pens.map((slug) => (
							<PenCard key={slug} slug={slug} href={`/p/${slug}/`} />
						))}
					</div>
				)}
			</section>

			<section style={{ marginTop: '3rem' }}>
				<h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Templates</h2>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
						gap: '1rem',
					}}
				>
					{templates.map((name) => (
						<PenCard key={name} slug={name} href={`/t/${name}/`} label='template' />
					))}
				</div>
			</section>
		</div>
	)
}

function PenCard({ slug, href, label }: { slug: string; href: string; label?: string }) {
	return (
		<a
			href={href}
			style={{
				display: 'block',
				padding: '1rem',
				border: '1px solid #e2e8f0',
				borderRadius: '0.5rem',
				textDecoration: 'none',
				color: 'inherit',
				transition: 'box-shadow 0.15s',
			}}
			onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
			onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '')}
		>
			<div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{slug}</div>
			{label && <div style={{ fontSize: '0.75rem', color: '#888' }}>{label}</div>}
		</a>
	)
}
