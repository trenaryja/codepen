import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const dirname = fileURLToPath(new URL('.', import.meta.url))

function penWrapperPlugin(): Plugin {
	function buildWrapper(slug: string, dir: 'p' | 't'): string {
		const base = resolve(dirname, 'src', dir, slug)
		const fragment = existsSync(`${base}/index.html`) ? readFileSync(`${base}/index.html`, 'utf-8') : ''
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${slug}</title>
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

		// Wrap pen index.html fragments with full HTML during build
		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				const match = ctx.filename.match(/\/src\/(p|t)\/([^/]+)\/index\.html$/)
				if (!match) return html

				return buildWrapper(match[2], match[1] as 'p' | 't')
			},
		},

		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = req.url ?? ''

				// Match /p/{slug}/ or /t/{name}/
				const match = url.match(/^\/(p|t)\/([^#/?]+)\/?(?:\?.*)?$/)
				if (!match) return next()

				const dir = match[1] as 'p' | 't'
				const slug = match[2]
				const base = resolve(dirname, 'src', dir, slug)

				if (!existsSync(base)) return next()

				const html = buildWrapper(slug, dir)
				const transformed = await server.transformIndexHtml(url, html)
				res.setHeader('Content-Type', 'text/html')
				res.end(transformed)
			})
		},

		// Rewrite /p/slug/ and /t/slug/ to /src/p/slug/ for vite preview
		configurePreviewServer(server) {
			server.middlewares.use((req, _res, next) => {
				const url = req.url ?? ''
				const match = url.match(/^\/(p|t)\/([^#/?]+)\/?(\?.*)?$/)

				if (match) {
					req.url = `/src/${match[1]}/${match[2]}/${match[3] ?? ''}`
				}

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

function esmShPlugin(): Plugin {
	return {
		name: 'esm-sh-to-local',
		enforce: 'pre',
		resolveId(id) {
			if (!id.startsWith('https://esm.sh/')) {
				if (id.startsWith('https://')) return { id, external: true }
				return
			}

			const npmSpec = esmShToNpm(id)
			const pkgRoot = npmSpec.startsWith('@') ? npmSpec.split('/').slice(0, 2).join('/') : npmSpec.split('/')[0]

			if (existsSync(resolve(dirname, 'node_modules', pkgRoot))) {
				return { id: npmSpec, external: false }
			}

			return { id, external: true }
		},
		transform(code) {
			if (!code.includes('https://esm.sh/')) return

			return code.replace(/(["'])https:\/\/esm\.sh\/([^"']+)\1/g, (match, quote, spec) => {
				const npmSpec = esmShToNpm(`https://esm.sh/${spec}`)
				const pkgRoot = npmSpec.startsWith('@') ? npmSpec.split('/').slice(0, 2).join('/') : npmSpec.split('/')[0]

				if (existsSync(resolve(dirname, 'node_modules', pkgRoot))) {
					return `${quote}${npmSpec}${quote}`
				}

				return match
			})
		},
	}
}

function discoverPenEntries(): Record<string, string> {
	const entries: Record<string, string> = {
		main: resolve(dirname, 'index.html'),
	}

	for (const dir of ['p', 't'] as const) {
		const base = resolve(dirname, 'src', dir)
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
