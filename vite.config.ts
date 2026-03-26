import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const penUrlRe = /^\/(p|t)\/([^#/?]+)\/?(\?.*)?$/
const isPenDir = (s: string): s is 'p' | 't' => s === 'p' || s === 't'

function penWrapperPlugin(): Plugin {
	function buildWrapper(slug: string, dir: 'p' | 't'): string {
		const base = resolve(import.meta.dirname, 'src', dir, slug)
		const fragment = existsSync(`${base}/index.html`) ? readFileSync(`${base}/index.html`, 'utf-8') : ''
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${slug}</title>
  <link rel="icon" type="image/svg+xml" href="https://trenary.dev/icon.svg" />
  <link rel="stylesheet" href="/src/index.css" />
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
${fragment}
  <script type="module" src="/src/${dir}/${slug}/pen.tsx"></script>
</body>
</html>`
	}

	return {
		name: 'pen-wrapper',

		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				const match = ctx.filename.match(/\/src\/(p|t)\/([^/]+)\/index\.html$/)
				if (!match || !isPenDir(match[1])) return html
				return buildWrapper(match[2], match[1])
			},
		},

		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = req.url ?? ''
				const match = url.match(penUrlRe)
				if (!match || !isPenDir(match[1])) return next()

				const dir = match[1]
				const slug = match[2]
				if (!existsSync(resolve(import.meta.dirname, 'src', dir, slug))) return next()

				const html = buildWrapper(slug, dir)
				const transformed = await server.transformIndexHtml(url, html)
				res.setHeader('Content-Type', 'text/html')
				res.end(transformed)
			})
		},

		configurePreviewServer(server) {
			server.middlewares.use((req, _res, next) => {
				const match = (req.url ?? '').match(penUrlRe)
				if (match) req.url = `/src/${match[1]}/${match[2]}/${match[3] ?? ''}`
				next()
			})
		},
	}
}

function esmShToNpm(url: string): string {
	const spec = url.slice('https://esm.sh/'.length)

	if (spec.startsWith('@')) {
		const [scope, nameAndVersion, ...rest] = spec.split('/')
		return [scope, nameAndVersion.replace(/@.*$/, ''), ...rest].join('/')
	}

	const [nameAndVersion, ...rest] = spec.split('/')
	return [nameAndVersion.replace(/@.*$/, ''), ...rest].join('/')
}

function esmShToLocal(id: string): string | undefined {
	const npmSpec = esmShToNpm(id)
	const pkgRoot = npmSpec.startsWith('@') ? npmSpec.split('/').slice(0, 2).join('/') : npmSpec.split('/')[0]
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
	plugins: [tailwindcss(), react(), esmShPlugin(), penWrapperPlugin()],
	build: {
		rollupOptions: {
			input: discoverPenEntries(),
		},
	},
})
