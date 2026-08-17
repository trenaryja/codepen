import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Plugin } from 'vite'
import { defineConfig, transformWithOxc } from 'vite'
import type { PenMeta } from './src/pen-meta.ts'

const penUrlRe = /^\/(p|t)\/([^#/?]+)\/?(\?.*)?$/
const isPenDir = (s: string): s is 'p' | 't' => s === 'p' || s === 't'

const DEFAULT_ICON = 'https://trenary.dev/icon.svg'
const PEN_ICONS_ID = 'virtual:pen-icons'
const RESOLVED_PEN_ICONS_ID = `\0${PEN_ICONS_ID}`

// Same trick as trenary.dev/icon.svg. react-icons paint with `currentColor`, so setting `color` on
// the root element flips the whole glyph without disturbing lucide's `fill="none"` strokes.
const COLOR_SCHEME_STYLE =
	'<style>svg { color: #000 } @media (prefers-color-scheme: dark) { svg { color: #fff } }</style>'

/** `'lu/LuClock'` → the pack subpath and the component that pack exports. */
function parseIcon(icon: string) {
	const [pack = '', name = ''] = icon.split('/')
	return { pack, name }
}

/**
 * Reads a pen's `meta.ts`. The sidecar is pure data (its only import is a type), so Oxc
 * type-stripping is enough — no bundling, and the same path serves dev and build.
 */
async function readPenMeta(base: string): Promise<PenMeta | undefined> {
	const metaPath = `${base}/meta.ts`
	if (!existsSync(metaPath)) return undefined

	const { code } = await transformWithOxc(readFileSync(metaPath, 'utf-8'), 'meta.ts', { lang: 'ts' })
	return (await import(`data:text/javascript,${encodeURIComponent(code)}`)).default
}

/** Renders a pen's icon to an inline data URI for use as its favicon. */
async function resolveIcon(base: string) {
	const meta = await readPenMeta(base)
	if (!meta?.icon) return DEFAULT_ICON

	const { pack, name } = parseIcon(meta.icon)
	const icons = await import(`react-icons/${pack}`)
	if (!icons[name]) throw new Error(`${base}/meta.ts: no icon "${name}" in react-icons/${pack}`)

	// An explicit `color` renders as an inline style, which beats the stylesheet; without one the
	// glyph follows the reader's light/dark preference. The `<style>` can't be passed as children —
	// `GenIcon` overwrites them with the icon's own paths.
	const svg = renderToStaticMarkup(createElement(icons[name], { size: 32, color: meta.color }))
	return `data:image/svg+xml,${encodeURIComponent(svg.replace('>', `>${COLOR_SCHEME_STYLE}`))}`
}

/** Slug → icon, as static named imports so the gallery bundles only the icons it uses. */
async function buildPenIconsModule() {
	const penBase = resolve(import.meta.dirname, 'src', 'p')
	const icons = new Map<string, string>()

	await Promise.all(
		readdirSync(penBase).map(async (slug) => {
			const meta = await readPenMeta(resolve(penBase, slug))
			if (meta?.icon) icons.set(slug, meta.icon)
		}),
	)

	// One import per icon rather than one per pack — duplicate specifiers are legal, and the
	// bundler collapses them, so no grouping is needed.
	const imports = [...new Set(icons.values())].map((icon) => {
		const { pack, name } = parseIcon(icon)
		return `import { ${name} } from 'react-icons/${pack}'`
	})
	const members = [...icons].map(([slug, icon]) => `\t${JSON.stringify(slug)}: ${parseIcon(icon).name},`)

	return `${imports.join('\n')}\n\nexport const penIcons = {\n${members.join('\n')}\n}\n`
}

function penPlugin(): Plugin {
	async function buildWrapper(slug: string, dir: 'p' | 't') {
		const base = resolve(import.meta.dirname, 'src', dir, slug)
		const fragment = existsSync(`${base}/index.html`) ? readFileSync(`${base}/index.html`, 'utf-8') : ''
		const penFile = existsSync(`${base}/pen.ts`) ? 'pen.ts' : 'pen.tsx'
		const icon = await resolveIcon(base)
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${slug}</title>
  <link rel="icon" type="image/svg+xml" href="${icon}" />
  <link rel="stylesheet" href="/src/index.css" />
  <link rel="stylesheet" href="/src/${dir}/${slug}/style.css" />
</head>
<body>
${fragment}
  <script type="module" src="/src/${dir}/${slug}/${penFile}"></script>
</body>
</html>`
	}

	return {
		name: 'pen',

		resolveId: (id) => (id === PEN_ICONS_ID ? RESOLVED_PEN_ICONS_ID : undefined),

		load: (id) => (id === RESOLVED_PEN_ICONS_ID ? buildPenIconsModule() : undefined),

		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				const match = /\/src\/(p|t)\/([^/]+)\/index\.html$/.exec(ctx.filename)
				if (!match || !isPenDir(match[1]!)) return html
				return buildWrapper(match[2]!, match[1])
			},
		},

		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = req.url ?? ''
				const match = penUrlRe.exec(url)
				if (!match || !isPenDir(match[1]!)) return next()

				const dir = match[1]
				const slug = match[2]!
				if (!existsSync(resolve(import.meta.dirname, 'src', dir, slug))) return next()

				const html = await buildWrapper(slug, dir)
				const transformed = await server.transformIndexHtml(url, html)
				res.setHeader('Content-Type', 'text/html')
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
				res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
				res.end(transformed)
			})
		},

		configurePreviewServer(server) {
			server.middlewares.use((req, _res, next) => {
				const match = penUrlRe.exec(req.url ?? '')
				if (match) req.url = `/src/${match[1]}/${match[2]}/${match[3] ?? ''}`
				next()
			})
		},
	}
}

function esmShToNpm(url: string): string {
	const spec = url.slice('https://esm.sh/'.length).replace(/\?.*$/, '')

	if (spec.startsWith('@')) {
		// scoped esm.sh specs are always @scope/name[/subpath]
		const [scope, nameAndVersion, ...rest] = spec.split('/')
		return [scope, nameAndVersion!.replace(/@.*$/, ''), ...rest].join('/')
	}

	const [nameAndVersion, ...rest] = spec.split('/')
	return [nameAndVersion!.replace(/@.*$/, ''), ...rest].join('/')
}

function esmShToLocal(id: string) {
	const npmSpec = esmShToNpm(id)
	const pkgRoot = npmSpec.startsWith('@') ? npmSpec.split('/').slice(0, 2).join('/') : npmSpec.split('/')[0]!
	return existsSync(resolve(import.meta.dirname, 'node_modules', pkgRoot)) ? npmSpec : undefined
}

function esmShPlugin(): Plugin {
	return {
		name: 'esm-sh-to-local',
		enforce: 'pre',
		resolveId(id) {
			if (!id.startsWith('https://esm.sh/')) {
				if (id.startsWith('https://')) return { id, external: true }
				return
			}

			const local = esmShToLocal(id)
			return local ? { id: local, external: false } : { id, external: true }
		},
		transform(code) {
			if (!code.includes('https://esm.sh/')) return

			return code.replace(/(["'])https:\/\/esm\.sh\/([^"']+)\1/g, (match, quote, spec) => {
				const local = esmShToLocal(`https://esm.sh/${spec}`)
				return local ? `${quote}${local}${quote}` : match
			})
		},
	}
}

function discoverPenEntries(): Record<string, string> {
	const entries: Record<string, string> = {
		main: resolve(import.meta.dirname, 'index.html'),
	}

	for (const dir of ['p', 't'] as const) {
		const base = resolve(import.meta.dirname, 'src', dir)
		if (!existsSync(base)) continue

		for (const slug of readdirSync(base)) {
			const htmlPath = resolve(base, slug, 'index.html')

			if (existsSync(htmlPath)) {
				entries[`${dir}/${slug}`] = htmlPath
			}
		}
	}

	return entries
}

export default defineConfig({
	// `esmShPlugin` is `enforce: 'pre'`, so pen imports are rewritten from esm.sh URLs to bare
	// specifiers before the compiler pass — it then emits `react/compiler-runtime`, which resolves
	// to the same local React instance the pens render with.
	plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] }), esmShPlugin(), penPlugin()],
	build: {
		rollupOptions: {
			input: discoverPenEntries(),
		},
	},
})
