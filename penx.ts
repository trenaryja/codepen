#!/usr/bin/env bun

/**
 * penx — local CodePen manager
 *
 * Progressive CLI: every option works as a flag (scriptable) or as an
 * interactive prompt when flags are omitted.
 */

import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cancel, intro, isCancel, multiselect, note, outro, select, spinner, text } from '@clack/prompts'
import { Command } from 'commander'
import { version as VERSION } from './package.json'

const ROOT = import.meta.dir
const SRC = join(ROOT, 'src')
const PENS_DIR = join(SRC, 'p')
const TEMPLATES_DIR = join(SRC, 't')

function fail(message: string): never {
	cancel(message)
	process.exit(1)
}

function cancelGuard<T>(value: symbol | T): T {
	if (isCancel(value)) {
		cancel('Cancelled.')
		process.exit(0)
	}

	return value
}

async function prompt(message: string, validate?: (v?: string) => string | undefined): Promise<string> {
	return cancelGuard(await text({ message, validate }))
}

function selectPen(pens: string[], message: string): Promise<string> {
	return select({ message, options: pens.map((p) => ({ label: p, value: p })) }).then(cancelGuard)
}

const getDirs = (base: string): string[] =>
	existsSync(base) ? readdirSync(base).filter((d) => statSync(join(base, d)).isDirectory()) : []

const getPens = () => getDirs(PENS_DIR)
const getTemplates = () => getDirs(TEMPLATES_DIR)

const DEFAULT_META = `import type { PenMeta } from '../../pen-meta.ts'

export default { icon: 'lu/LuCircleDashed' } satisfies PenMeta
`

// The files every pen has, each with the content to write when no source supplies it.
// `panel` names which CodePen panel fills the file; `meta.ts` has no panel, so it is always the default.
const PEN_FILES = [
	{ file: 'index.html', panel: 'html', fallback: '' },
	{ file: 'style.css', panel: 'css', fallback: '/* pen styles */\n' },
	{ file: 'pen.tsx', panel: 'js', fallback: '// pen\n' },
	{ file: 'meta.ts', panel: null, fallback: DEFAULT_META },
] as const

function copyPen(src: string, dest: string): void {
	mkdirSync(dest, { recursive: true })

	for (const { file } of PEN_FILES) {
		const srcFile = join(src, file)
		const destFile = join(dest, file)
		if (existsSync(srcFile)) copyFileSync(srcFile, destFile)
		else writeFileSync(destFile, '')
	}
}

function openInBrowser(url: string): void {
	const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
	spawnSync(cmd, [url], { stdio: 'ignore' })
}

const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Strips the version pin off the package name, leaving any subpath intact:
// `@scope/name@1.2.3/sub` → `@scope/name/sub`, `name@1.2.3/sub` → `name/sub`.
const esmShToNpm = (url: string) =>
	url
		.slice('https://esm.sh/'.length)
		.replace(/\?.*$/, '')
		.replace(/^((?:@[^/]+\/)?[^/@]+)@[^/]+/, '$1')

const npmPkgRoot = (npmSpec: string) =>
	npmSpec.startsWith('@') ? npmSpec.split('/').slice(0, 2).join('/') : npmSpec.split('/')[0]!

// package.json is the source of truth for what a pen may import, never node_modules — an orphaned
// install dir (dropped from package.json but never pruned) otherwise reads as a satisfied dependency,
// so the package silently resolves locally while nothing keeps it installed or up to date
function declaredPkgs(): Set<string> {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
	return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
}

function hasOwnTypes(pkgName: string): boolean {
	try {
		const pkg = JSON.parse(readFileSync(join(ROOT, 'node_modules', pkgName, 'package.json'), 'utf-8'))
		return !!(pkg.types ?? pkg.typings)
	} catch {
		return false
	}
}

function toAtTypesName(pkgName: string): string {
	return pkgName.startsWith('@') ? `@types/${pkgName.slice(1).replace('/', '__')}` : `@types/${pkgName}`
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
	const blocks = new Map<string, string>()

	for (const m of current.matchAll(
		/declare module '(https:\/\/esm\.sh\/(?!\*)[^']+)'(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?/g,
	)) {
		blocks.set(m[1]!, m[0])
	}

	const imported = new Set(importUrls)
	const orphaned = [...blocks.keys()].filter((url) => !imported.has(url))
	for (const url of orphaned) blocks.delete(url)

	const declared = declaredPkgs()
	const added = importUrls.filter((url) => !blocks.has(url) && declared.has(npmPkgRoot(esmShToNpm(url))))
	for (const url of added) blocks.set(url, `declare module '${url}' {\n\texport * from '${esmShToNpm(url)}'\n}`)

	if (added.length === 0 && orphaned.length === 0) return

	const sorted = [...blocks.entries()].sort(([a], [b]) => a.localeCompare(b))
	writeFileSync(dtsPath, `${sorted.map(([, block]) => block).join('\n\n')}\n\ndeclare module 'https://esm.sh/*'\n`)
	if (added.length > 0) console.log(`✓ Added ${added.length} declaration(s): ${added.join(', ')}`)
	if (orphaned.length > 0) console.log(`✓ Removed ${orphaned.length} unused declaration(s): ${orphaned.join(', ')}`)
}

async function readMultiline(): Promise<string> {
	const { createInterface } = await import('node:readline')
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, terminal: false })
		const lines: string[] = []
		rl.on('line', (line) => {
			if (line.trim() === '---') {
				rl.close()
				resolve(lines.join('\n'))
			} else {
				lines.push(line)
			}
		})
		rl.on('close', () => resolve(lines.join('\n')))
	})
}

function ensureNewPen(slug: string): string {
	const dest = join(PENS_DIR, slug)
	if (existsSync(dest)) fail(`Pen "${slug}" already exists.`)

	return dest
}

function writePen(dest: string, panels: { html: string; css: string; js: string }): void {
	mkdirSync(dest, { recursive: true })
	for (const { file, panel, fallback } of PEN_FILES) writeFileSync(join(dest, file), panel ? panels[panel] : fallback)
}

async function cmdNew(slug?: string, template?: string): Promise<void> {
	const resolvedSlug = slug ?? (await prompt('Pen slug:', (v) => (v?.trim() ? undefined : 'Slug cannot be empty')))
	const dest = ensureNewPen(resolvedSlug)
	const templates = getTemplates()
	if (templates.length === 0) fail('No templates found in src/t/.')

	const resolvedTemplate =
		template ??
		cancelGuard(await select({ message: 'Choose template:', options: templates.map((t) => ({ label: t, value: t })) }))

	if (!templates.includes(resolvedTemplate)) fail(`Template "${resolvedTemplate}" not found.`)

	copyPen(join(TEMPLATES_DIR, resolvedTemplate), dest)
	note(`Preview: http://localhost:5173/p/${resolvedSlug}/`, `Created p/${resolvedSlug}/`)
}

function cmdList(): void {
	const pens = getPens()

	if (pens.length === 0) {
		note('No pens yet. Run: penx new', 'Pens')
		return
	}

	const rows = pens.map((slug) => ({ slug, created: statSync(join(PENS_DIR, slug)).birthtime.toLocaleDateString() }))
	const maxSlug = Math.max(...rows.map((r) => r.slug.length), 4)
	const header = `${'SLUG'.padEnd(maxSlug)}  CREATED`
	const divider = `${'─'.repeat(maxSlug)}  ${'─'.repeat(10)}`
	const body = rows.map((r) => `${r.slug.padEnd(maxSlug)}  ${r.created}`).join('\n')
	note(`${header}\n${divider}\n${body}`, 'Pens')
}

// `spawn`, not `spawnSync` — a blocking call would starve the timer below, so the
// browser could only open after the dev server had already exited.
function cmdDev(slug?: string) {
	const vite = spawn('bun', ['run', 'dev'], { cwd: ROOT, stdio: 'inherit' })
	if (slug) setTimeout(() => openInBrowser(`http://localhost:5173/p/${slug}/`), 1500)
	vite.on('exit', (code) => process.exit(code ?? 1))
}

async function cmdExport(slug?: string): Promise<void> {
	const pens = getPens()
	if (pens.length === 0) fail('No pens found.')

	const resolvedSlug = slug ?? (pens.length === 1 ? pens[0]! : await selectPen(pens, 'Which pen to export?'))
	const penDir = join(PENS_DIR, resolvedSlug)
	if (!existsSync(penDir)) fail(`Pen "${resolvedSlug}" not found.`)

	const html = readFileSync(join(penDir, 'index.html'), 'utf-8')
	const css = readFileSync(join(penDir, 'style.css'), 'utf-8')
	const js = readFileSync(join(penDir, 'pen.tsx'), 'utf-8')

	const prefillHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Export to CodePen: ${resolvedSlug}</title></head>
<body>
<form action="https://codepen.io/pen/define" method="POST" id="f">
  <input type="hidden" name="data" value="${escapeHtml(
		JSON.stringify({ title: resolvedSlug, html, css, js, js_pre_processor: 'babel' }),
	)}" />
</form>
<script>document.getElementById('f').submit();</script>
</body>
</html>`

	const tmpFile = join(ROOT, '.codepen-export.html')
	writeFileSync(tmpFile, prefillHtml)
	openInBrowser(`file://${tmpFile}`)
	note(`Opening CodePen prefill for "${resolvedSlug}"…`, 'Export')
}

async function cmdImport(opts: { method?: string; slug?: string; url?: string; zip?: string }): Promise<void> {
	const method =
		opts.method ??
		cancelGuard(
			await select({
				message: 'Import method:',
				options: [
					{ label: 'Paste panels manually', value: 'paste' },
					{ label: 'From ZIP file', value: 'zip' },
					{ label: 'From CodePen URL (public pens)', value: 'url' },
				],
			}),
		)

	if (method === 'paste') await importPaste(opts.slug)
	else if (method === 'zip') await importZip(opts.slug, opts.zip)
	else if (method === 'url') await importUrl(opts.slug, opts.url)
	else fail(`Unknown import method: ${method}`)
}

async function importPaste(slugFlag?: string): Promise<void> {
	const slug = slugFlag ?? (await prompt('Pen slug:', (v) => (v?.trim() ? undefined : 'Required')))
	const dest = ensureNewPen(slug)

	console.log("Paste HTML panel content (end with a line containing only '---'):")
	const html = await readMultiline()
	console.log("Paste CSS panel content (end with '---'):")
	const css = await readMultiline()
	console.log("Paste JS/TSX panel content (end with '---'):")
	const js = await readMultiline()

	writePen(dest, { html, css, js })
	note(`Preview: http://localhost:5173/p/${slug}/`, `Created p/${slug}/`)
}

async function importZip(slugFlag?: string, zipFlag?: string): Promise<void> {
	const zipPath =
		zipFlag ?? (await prompt('Path to ZIP file:', (v) => (v && existsSync(v.trim()) ? undefined : 'File not found')))
	const slug = slugFlag ?? (await prompt('Pen slug:', (v) => (v?.trim() ? undefined : 'Required')))
	const dest = ensureNewPen(slug)

	const result = spawnSync('unzip', ['-o', zipPath.trim(), '-d', dest], { stdio: 'inherit' })
	if (result.status !== 0) fail('Failed to unzip.')

	for (const { file, fallback } of PEN_FILES)
		if (!existsSync(join(dest, file))) writeFileSync(join(dest, file), fallback)

	note(`Preview: http://localhost:5173/p/${slug}/`, `Imported to p/${slug}/`)
}

async function importUrl(slugFlag?: string, urlFlag?: string): Promise<void> {
	const url =
		urlFlag ??
		(await prompt('CodePen URL (e.g. https://codepen.io/user/pen/slug):', (v) =>
			v?.includes('codepen.io') ? undefined : 'Must be a CodePen URL',
		))

	const match = /codepen\.io\/([^/]+)\/pen\/([^#/?]+)/.exec(url)
	if (!match) fail('Could not parse CodePen URL.')

	const [, user, penSlug] = match
	const apiUrl = `https://codepen.io/${user}/pen/${penSlug}.js`
	const s = spinner()
	s.start(`Fetching ${apiUrl}…`)
	const res = await fetch(apiUrl)

	if (!res.ok) {
		s.stop(`Failed: ${res.status} ${res.statusText}`)
		fail('Could not fetch pen.')
	}

	const data: { html?: string; css?: string; js?: string } = await res.json()
	s.stop('Fetched pen data.')

	const slug =
		slugFlag ??
		cancelGuard(
			await text({
				message: 'Save as slug:',
				placeholder: penSlug,
				validate: (v) => (v?.trim() ? undefined : 'Required'),
			}),
		)
	const dest = ensureNewPen(slug)

	writePen(dest, { html: data.html ?? '', css: data.css ?? '/* pen styles */\n', js: data.js ?? '// pen\n' })
	note(`Preview: http://localhost:5173/p/${slug}/`, `Imported to p/${slug}/`)
}

function scanEsmImports(): { fullUrls: Set<string>; referencedPkgs: Set<string>; undeclared: string[] } {
	const files: string[] = []

	for (const dir of ['p', 't']) {
		const base = join(SRC, dir)
		if (!existsSync(base)) continue

		for (const slug of readdirSync(base)) {
			const penDir = join(base, slug)
			if (!statSync(penDir).isDirectory()) continue

			for (const file of readdirSync(penDir)) {
				if (file.endsWith('.tsx') || file.endsWith('.ts')) files.push(join(penDir, file))
			}
		}
	}

	const esmPattern = /from ["']https:\/\/esm\.sh\/([^"']+)["']/g
	const fullUrls = new Set<string>()
	const referencedPkgs = new Set<string>()

	for (const file of files) {
		for (const m of readFileSync(file, 'utf-8').matchAll(esmPattern)) {
			const url = `https://esm.sh/${m[1]}`
			fullUrls.add(url)
			referencedPkgs.add(npmPkgRoot(esmShToNpm(url)))
		}
	}

	const declared = declaredPkgs()
	const undeclared = [...referencedPkgs].filter((pkg) => !declared.has(pkg))

	return { fullUrls, referencedPkgs, undeclared }
}

function findStaleDeps(referencedPkgs: Set<string>): string[] {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
	const deps = new Set<string>(Object.keys(pkg.dependencies ?? {}))

	return deps.difference(referencedPkgs).values().toArray()
}

async function cmdCheck(opts: { fix?: boolean }): Promise<void> {
	const { fullUrls, referencedPkgs, undeclared } = scanEsmImports()
	const stale = findStaleDeps(referencedPkgs)
	syncEsmDeclarations([...fullUrls])

	if (undeclared.length === 0 && stale.length === 0)
		return note('Every esm.sh import is a declared dependency, and none are unused.', 'Check')

	const issues = [
		undeclared.length > 0 && `Imported but not in package.json: ${undeclared.join(', ')}`,
		stale.length > 0 && `In package.json but imported by no pen: ${stale.join(', ')}`,
	].filter(Boolean)
	note(issues.join('\n'), 'Issues found')

	if (!opts.fix) fail(`Run: penx check --fix`)

	// Fix undeclared packages
	if (undeclared.length > 0) {
		const s = spinner()
		s.start(`Installing ${undeclared.length} undeclared package(s)…`)
		spawnSync('bun', ['add', ...undeclared], { cwd: ROOT, stdio: 'pipe' })
		s.stop(`Installed ${undeclared.length} package(s).`)
		installAtTypes(undeclared.filter((pkg) => !hasOwnTypes(pkg)))
		syncEsmDeclarations([...fullUrls])
	}

	// Fix stale packages
	if (stale.length > 0) {
		const toRemove = cancelGuard(
			await multiselect({
				message: 'Remove stale dependencies?',
				options: stale.map((pkg) => ({ label: pkg, value: pkg })),
				initialValues: stale,
			}),
		)

		if (toRemove.length > 0) {
			const s = spinner()
			s.start(`Removing ${toRemove.length} stale package(s)…`)
			spawnSync('bun', ['remove', ...toRemove], { cwd: ROOT, stdio: 'pipe' })
			s.stop(`Removed ${toRemove.length} package(s).`)

			// Also remove @types/ counterparts if they exist
			const typePkgs = toRemove.map(toAtTypesName).filter((t) => existsSync(join(ROOT, 'node_modules', t)))

			if (typePkgs.length > 0) {
				spawnSync('bun', ['remove', ...typePkgs], { cwd: ROOT, stdio: 'pipe' })
				console.log(`✓ Removed ${typePkgs.length} @types package(s).`)
			}
		}
	}

	note('All issues resolved.', 'Check')
}

async function main() {
	const program = new Command().name('penx').description('local CodePen manager').version(VERSION)

	program
		.command('new')
		.description('Create a new pen')
		.argument('[slug]', 'pen slug')
		.option('-t, --template <name>', 'template to use')
		.action(async (slug: string | undefined, opts: { template?: string }) => {
			await cmdNew(slug, opts.template)
			outro('Done.')
		})

	program
		.command('list')
		.description('List all pens')
		.action(() => {
			cmdList()
			outro('Done.')
		})

	program
		.command('dev')
		.description('Start Vite dev server')
		.argument('[slug]', 'pen slug to open in browser')
		.action((slug: string | undefined) => cmdDev(slug))

	program
		.command('export')
		.description('Export pen to CodePen via Prefill API')
		.argument('[slug]', 'pen slug to export')
		.action(async (slug: string | undefined) => {
			await cmdExport(slug)
			outro('Done.')
		})

	program
		.command('import')
		.description('Import a pen (paste / ZIP / URL)')
		.option('-m, --method <method>', 'import method: paste, zip, or url')
		.option('-s, --slug <name>', 'pen slug for the import')
		.option('--url <url>', 'CodePen URL (for url method)')
		.option('--zip <path>', 'path to ZIP file (for zip method)')
		.action(async (opts: { method?: string; slug?: string; url?: string; zip?: string }) => {
			await cmdImport(opts)
			outro('Done.')
		})

	program
		.command('check')
		.description('Audit esm.sh imports: missing packages, stale dependencies, declaration sync')
		.option('-f, --fix', 'auto-fix issues (install missing, remove stale)')
		.action(async (opts: { fix?: boolean }) => {
			await cmdCheck(opts)
			outro('Done.')
		})

	// Interactive mode: no command given → prompt for one
	const args = process.argv.slice(2)

	if (args.length === 0 || args.every((a) => a.startsWith('-') && !['--help', '--version', '-h', '-V'].includes(a))) {
		intro('penx')

		const command = cancelGuard(
			await select({
				message: 'What would you like to do?',
				options: [
					{ value: 'new', label: 'New pen', hint: 'create from template' },
					{ value: 'list', label: 'List pens' },
					{ value: 'dev', label: 'Dev server', hint: 'start Vite' },
					{ value: 'export', label: 'Export pen', hint: 'to CodePen' },
					{ value: 'import', label: 'Import pen', hint: 'paste / ZIP / URL' },
					{ value: 'check', label: 'Check', hint: 'audit esm.sh imports + deps' },
					{ value: 'check --fix', label: 'Check & fix', hint: 'auto-fix issues' },
				],
			}),
		)

		process.argv = [process.argv[0]!, process.argv[1]!, ...command.split(' ')]
	} else {
		intro('penx')
	}

	await program.parseAsync(process.argv)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
