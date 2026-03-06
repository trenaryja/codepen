#!/usr/bin/env bun
/**
 * penx — local CodePen manager
 * Usage: bun run penx <command> [args]
 */

import { checkbox, input, select } from '@inquirer/prompts'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { spawnSync } from 'child_process'

const ROOT = resolve(import.meta.dir, '..')
const SRC = join(ROOT, 'src')
const PENS_DIR = join(SRC, 'p')
const TEMPLATES_DIR = join(SRC, 't')
const VERSION = '0.1.0'

// ── helpers ──────────────────────────────────────────────────────────────────

function getPens(): string[] {
	if (!existsSync(PENS_DIR)) return []
	return readdirSync(PENS_DIR).filter((d) => {
		const p = join(PENS_DIR, d)
		return statSync(p).isDirectory()
	})
}

function getTemplates(): string[] {
	if (!existsSync(TEMPLATES_DIR)) return []
	return readdirSync(TEMPLATES_DIR).filter((d) => {
		const p = join(TEMPLATES_DIR, d)
		return statSync(p).isDirectory()
	})
}

function copyPen(src: string, dest: string): void {
	mkdirSync(dest, { recursive: true })

	for (const file of ['index.html', 'style.css', 'pen.tsx']) {
		const srcFile = join(src, file)
		const destFile = join(dest, file)

		if (existsSync(srcFile)) {
			copyFileSync(srcFile, destFile)
		} else {
			writeFileSync(destFile, '')
		}
	}
}

function openInBrowser(url: string): void {
	const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
	spawnSync(cmd, [url], { stdio: 'ignore' })
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

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdNew(slug?: string): Promise<void> {
	const resolvedSlug =
		slug ??
		(await input({
			message: 'Pen slug:',
			validate: (v) => (v.trim() ? true : 'Slug cannot be empty'),
		}))

	const dest = join(PENS_DIR, resolvedSlug)

	if (existsSync(dest)) {
		console.error(`Pen "${resolvedSlug}" already exists.`)
		process.exit(1)
	}

	const templates = getTemplates()
	const template = await select({
		message: 'Choose template:',
		choices: templates.map((t) => ({ name: t, value: t })),
	})

	copyPen(join(TEMPLATES_DIR, template), dest)
	console.log(`✓ Created p/${resolvedSlug}/ from template "${template}"`)
	console.log(`  Preview: http://localhost:5173/p/${resolvedSlug}/`)
}

function cmdList(): void {
	const pens = getPens()

	if (pens.length === 0) {
		console.log('No pens yet. Run: bun run penx new')
		return
	}

	const rows = pens.map((slug) => {
		const dir = join(PENS_DIR, slug)
		const created = statSync(dir).birthtime.toLocaleDateString()
		return { slug, created }
	})

	const maxSlug = Math.max(...rows.map((r) => r.slug.length), 4)
	console.log(`${'SLUG'.padEnd(maxSlug)}  CREATED`)
	console.log(`${'─'.repeat(maxSlug)}  ${'─'.repeat(10)}`)

	for (const row of rows) {
		console.log(`${row.slug.padEnd(maxSlug)}  ${row.created}`)
	}
}

function cmdDev(slug?: string): void {
	const vite = spawnSync('bun', ['run', 'dev'], {
		cwd: ROOT,
		stdio: 'inherit',
		env: { ...process.env },
	})

	if (slug) {
		// Give Vite a moment to start then open browser
		setTimeout(() => openInBrowser(`http://localhost:5173/p/${slug}/`), 1500)
	}

	if (vite.status !== 0) process.exit(vite.status ?? 1)
}

function cmdExport(slug?: string): void {
	let resolvedSlug = slug

	if (!resolvedSlug) {
		const pens = getPens()

		if (pens.length === 0) {
			console.error('No pens found.')
			process.exit(1)
		}
		// If only one pen, use it; otherwise show error
		if (pens.length === 1) {
			resolvedSlug = pens[0]
		} else {
			console.error('Multiple pens found. Specify a slug: bun run penx export <slug>')
			process.exit(1)
		}
	}

	const penDir = join(PENS_DIR, resolvedSlug)

	if (!existsSync(penDir)) {
		console.error(`Pen "${resolvedSlug}" not found.`)
		process.exit(1)
	}

	const html = readFileSync(join(penDir, 'index.html'), 'utf-8')
	const css = readFileSync(join(penDir, 'style.css'), 'utf-8')
	const js = readFileSync(join(penDir, 'pen.tsx'), 'utf-8')

	// Escape values for embedding in HTML attribute
	function escapeHtml(s: string) {
		return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	}

	const prefillHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Export to CodePen: ${resolvedSlug}</title></head>
<body>
<form action="https://codepen.io/pen/define" method="POST" id="f">
  <input type="hidden" name="data" value="${escapeHtml(
		JSON.stringify({
			title: resolvedSlug,
			html,
			css,
			js,
			js_pre_processor: 'babel',
		}),
	)}" />
</form>
<script>document.getElementById('f').submit();</script>
</body>
</html>`

	const tmpFile = join(ROOT, '.codepen-export.html')
	writeFileSync(tmpFile, prefillHtml)
	openInBrowser(`file://${tmpFile}`)
	console.log(`✓ Opening CodePen prefill for "${resolvedSlug}"…`)
}

async function cmdImport(): Promise<void> {
	const method = await select({
		message: 'Import method:',
		choices: [
			{ name: 'Paste panels manually', value: 'paste' },
			{ name: 'From ZIP file', value: 'zip' },
			{ name: 'From CodePen URL (public pens)', value: 'url' },
		],
	})

	if (method === 'paste') {
		await importPaste()
	} else if (method === 'zip') {
		await importZip()
	} else {
		await importUrl()
	}
}

async function importPaste(): Promise<void> {
	const slug = await input({
		message: 'Pen slug:',
		validate: (v) => (v.trim() ? true : 'Required'),
	})

	const dest = join(PENS_DIR, slug)

	if (existsSync(dest)) {
		console.error(`Pen "${slug}" already exists.`)
		process.exit(1)
	}

	console.log("Paste HTML panel content (end with a line containing only '---'):")
	const html = await readMultiline()

	console.log("Paste CSS panel content (end with '---'):")
	const css = await readMultiline()

	console.log("Paste JS/TSX panel content (end with '---'):")
	const js = await readMultiline()

	mkdirSync(dest, { recursive: true })
	writeFileSync(join(dest, 'index.html'), html)
	writeFileSync(join(dest, 'style.css'), css)
	writeFileSync(join(dest, 'pen.tsx'), js)
	console.log(`✓ Created p/${slug}/`)
}

async function readMultiline(): Promise<string> {
	const { createInterface } = await import('readline')
	return new Promise((resolvePromise) => {
		const rl = createInterface({ input: process.stdin, terminal: false })
		const lines: string[] = []
		rl.on('line', (line) => {
			if (line.trim() === '---') {
				rl.close()
				resolvePromise(lines.join('\n'))
			} else {
				lines.push(line)
			}
		})
		rl.on('close', () => resolvePromise(lines.join('\n')))
	})
}

async function importZip(): Promise<void> {
	const zipPath = await input({
		message: 'Path to ZIP file:',
		validate: (v) => (existsSync(v.trim()) ? true : 'File not found'),
	})

	const slug = await input({
		message: 'Pen slug:',
		validate: (v) => (v.trim() ? true : 'Required'),
	})

	const dest = join(PENS_DIR, slug)

	if (existsSync(dest)) {
		console.error(`Pen "${slug}" already exists.`)
		process.exit(1)
	}

	// Use system unzip
	const result = spawnSync('unzip', ['-o', zipPath.trim(), '-d', dest], {
		stdio: 'inherit',
	})

	if (result.status !== 0) {
		console.error('Failed to unzip.')
		process.exit(1)
	}

	// Ensure 3 canonical files exist
	for (const [file, fallback] of [
		['index.html', ''],
		['style.css', '/* pen styles */\n'],
		['pen.tsx', '// pen\n'],
	] as const) {
		const p = join(dest, file)
		if (!existsSync(p)) writeFileSync(p, fallback)
	}

	console.log(`✓ Imported to p/${slug}/`)
}

async function importUrl(): Promise<void> {
	const url = await input({
		message: 'CodePen URL (e.g. https://codepen.io/user/pen/slug):',
		validate: (v) => (v.includes('codepen.io') ? true : 'Must be a CodePen URL'),
	})

	// Extract user/slug from URL
	const match = url.match(/codepen\.io\/([^/]+)\/pen\/([^#/?]+)/)

	if (!match) {
		console.error('Could not parse CodePen URL.')
		process.exit(1)
	}

	const [, user, penSlug] = match!
	const apiUrl = `https://codepen.io/${user}/pen/${penSlug}.js`

	console.log(`Fetching ${apiUrl}…`)
	const res = await fetch(apiUrl)

	if (!res.ok) {
		console.error(`Failed to fetch: ${res.status} ${res.statusText}`)
		process.exit(1)
	}

	const data = (await res.json()) as {
		html_classes?: string
		html?: string
		css?: string
		js?: string
	}

	const slug = await input({
		message: 'Save as slug:',
		default: penSlug,
		validate: (v) => (v.trim() ? true : 'Required'),
	})

	const dest = join(PENS_DIR, slug)

	if (existsSync(dest)) {
		console.error(`Pen "${slug}" already exists.`)
		process.exit(1)
	}

	mkdirSync(dest, { recursive: true })
	writeFileSync(join(dest, 'index.html'), data.html ?? '')
	writeFileSync(join(dest, 'style.css'), data.css ?? '/* pen styles */\n')
	writeFileSync(join(dest, 'pen.tsx'), data.js ?? '// pen\n')
	console.log(`✓ Imported to p/${slug}/`)
}

function hasOwnTypes(pkgName: string): boolean {
	try {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'node_modules', pkgName, 'package.json'), 'utf-8'))
		return !!(pkg.types || pkg.typings)
	} catch {
		return false
	}
}

function toAtTypesName(pkgName: string): string {
	if (pkgName.startsWith('@')) return `@types/${pkgName.slice(1).replace('/', '__')}`
	return `@types/${pkgName}`
}

function installAtTypes(pkgs: string[]): void {
	for (const pkg of pkgs) {
		const atPkg = toAtTypesName(pkg)
		if (existsSync(join(ROOT, 'node_modules', atPkg))) continue
		const result = spawnSync('bun', ['add', '-d', atPkg], { cwd: ROOT, stdio: 'pipe' })
		if (result.status === 0) console.log(`✓ Installed ${atPkg}`)
	}
}

function syncEsmDeclarations(importUrls: string[]): void {
	const dtsPath = join(ROOT, 'esm-sh.d.ts')
	const current = readFileSync(dtsPath, 'utf-8')

	// Parse existing specific declarations into a url → block map
	const blocks = new Map<string, string>()
	for (const m of current.matchAll(/declare module '(https:\/\/esm\.sh\/(?!\*)[^']+)'(\s*\{[\s\S]*?\})?/g)) {
		blocks.set(m[1], m[0])
	}

	let added = 0
	for (const url of importUrls) {
		if (blocks.has(url)) continue
		const npmSpec = esmShToNpm(url)
		const pkgRoot = npmSpec.startsWith('@') ? npmSpec.split('/').slice(0, 2).join('/') : npmSpec.split('/')[0]
		if (!existsSync(join(ROOT, 'node_modules', pkgRoot))) continue
		blocks.set(url, `declare module '${url}' {\n\texport * from '${npmSpec}'\n}`)
		added++
	}

	if (added === 0) return

	const sorted = [...blocks.entries()].sort(([a], [b]) => a.localeCompare(b))
	const content = sorted.map(([, block]) => block).join('\n\n') + "\n\ndeclare module 'https://esm.sh/*'\n"
	writeFileSync(dtsPath, content)
	console.log(`✓ Added ${added} declaration(s) to esm-sh.d.ts`)
}

async function cmdDeps(): Promise<void> {
	const srcDir = join(ROOT, 'src')
	const files: string[] = []

	for (const dir of ['p', 't']) {
		const base = join(srcDir, dir)
		if (!existsSync(base)) continue
		for (const slug of readdirSync(base)) {
			const penDir = join(base, slug)
			if (!statSync(penDir).isDirectory()) continue
			for (const file of readdirSync(penDir)) {
				if (file.endsWith('.tsx') || file.endsWith('.ts')) files.push(join(penDir, file))
			}
		}
	}

	const esmPattern = /from ['"]https:\/\/esm\.sh\/([^'"]+)['"]/g
	const fullUrls = new Set<string>()
	const pkgRoots = new Set<string>()

	for (const file of files) {
		for (const match of readFileSync(file, 'utf-8').matchAll(esmPattern)) {
			const url = `https://esm.sh/${match[1]}`
			fullUrls.add(url)
			const npm = esmShToNpm(url)
			pkgRoots.add(npm.startsWith('@') ? npm.split('/').slice(0, 2).join('/') : npm.split('/')[0])
		}
	}

	// Sync declarations for already-installed packages missing them
	syncEsmDeclarations([...fullUrls])

	const uninstalled = [...pkgRoots].filter((pkg) => !existsSync(join(ROOT, 'node_modules', pkg)))

	if (uninstalled.length === 0) {
		console.log('All esm.sh imports are already installed locally.')
		return
	}

	const toInstall = await checkbox({
		message: 'Select packages to install locally:',
		choices: uninstalled.map((pkg) => ({ name: pkg, value: pkg, checked: true })),
	})

	if (toInstall.length === 0) {
		console.log('Nothing to install.')
		return
	}

	spawnSync('bun', ['add', ...toInstall], { cwd: ROOT, stdio: 'inherit' })
	installAtTypes(toInstall.filter((pkg) => !hasOwnTypes(pkg)))
	syncEsmDeclarations([...fullUrls])
}

// ── main ──────────────────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv

if (!cmd || cmd === '--help' || cmd === '-h') {
	console.log(`penx v${VERSION} — local CodePen manager

Commands:
  new [slug]      Create a new pen (TUI template picker)
  list            List all pens
  dev [slug]      Start Vite dev server (optionally open pen in browser)
  export [slug]   Export pen to CodePen via Prefill API
  import          Import a pen (paste / ZIP / URL)
  deps            Install esm.sh imports that aren't local yet

Options:
  -h, --help      Show this help
  -v, --version   Show version
`)
	process.exit(0)
}

if (cmd === '--version' || cmd === '-v') {
	console.log(VERSION)
	process.exit(0)
}

switch (cmd) {
	case 'new':
		await cmdNew(rest[0])
		break

	case 'list':
		cmdList()
		break

	case 'dev':
		cmdDev(rest[0])
		break

	case 'export':
		cmdExport(rest[0])
		break

	case 'import':
		await cmdImport()
		break

	case 'deps':
		await cmdDeps()
		break

	default:
		console.error(`Unknown command: ${cmd}. Run "bun run penx --help" for usage.`)
		process.exit(1)
}
