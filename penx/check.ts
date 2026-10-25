import { multiselect, note, spinner } from '@clack/prompts'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { cancelGuard, fail, ROOT, SRC } from './shared.ts'

// Strips the version pin off the package name, leaving any subpath intact:
// `@scope/name@1.2.3/sub` → `@scope/name/sub`, `name@1.2.3/sub` → `name/sub`.
const esmShToNpm = (url: string) =>
	url
		.slice('https://esm.sh/'.length)
		.replace(/\?.*$/, '')
		.replace(/^((?:@[^/]+\/)?[^/@]+)@[^/]+/, '$1')

const npmPkgRoot = (npmSpec: string) =>
	npmSpec
		.split('/')
		.slice(0, npmSpec.startsWith('@') ? 2 : 1)
		.join('/')

const packageJsonSchema = z.object({
	dependencies: z.record(z.string(), z.string()).optional(),
	devDependencies: z.record(z.string(), z.string()).optional(),
	types: z.string().optional(),
	typings: z.string().optional(),
})

function readPackageJson(path: string) {
	const result = packageJsonSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
	if (!result.success) throw new Error(`${path}: ${z.prettifyError(result.error)}`)
	return result.data
}

// package.json is the source of truth for what a pen may import, never node_modules — an orphaned
// install dir (dropped from package.json but never pruned) otherwise reads as a satisfied dependency,
// so the package silently resolves locally while nothing keeps it installed or up to date
function declaredPkgs() {
	const pkg = readPackageJson(join(ROOT, 'package.json'))
	return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
}

function hasOwnTypes(pkgName: string) {
	try {
		const pkg = readPackageJson(join(ROOT, 'node_modules', pkgName, 'package.json'))
		return !!(pkg.types ?? pkg.typings)
	} catch {
		return false
	}
}

const toAtTypesName = (pkgName: string) =>
	pkgName.startsWith('@') ? `@types/${pkgName.slice(1).replace('/', '__')}` : `@types/${pkgName}`

function installAtTypes(pkgs: readonly string[]) {
	for (const pkg of pkgs) {
		const atPkg = toAtTypesName(pkg)
		if (existsSync(join(ROOT, 'node_modules', atPkg))) continue
		const result = spawnSync('bun', ['add', '-d', atPkg], { cwd: ROOT, stdio: 'pipe' })
		if (result.status === 0) console.log(`✓ Installed ${atPkg}`)
	}
}

function syncEsmDeclarations(importUrls: readonly string[]) {
	const dtsPath = join(ROOT, 'esm-sh.d.ts')
	const current = readFileSync(dtsPath, 'utf8')
	const blocks = new Map<string, string>()

	for (const m of current.matchAll(
		/declare module '(https:\/\/esm\.sh\/(?!\*)[^']+)'(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?/g,
	)) {
		const [block, url] = m
		if (url) blocks.set(url, block)
	}

	const orphaned = new Set(blocks.keys()).difference(new Set(importUrls)).values().toArray()
	for (const url of orphaned) blocks.delete(url)

	const declared = declaredPkgs()
	const added = importUrls.filter((url) => !blocks.has(url) && declared.has(npmPkgRoot(esmShToNpm(url))))
	for (const url of added) blocks.set(url, `declare module '${url}' {\n\texport * from '${esmShToNpm(url)}'\n}`)

	if (added.length === 0 && orphaned.length === 0) return

	const sorted = blocks
		.entries()
		.toArray()
		.toSorted(([a], [b]) => a.localeCompare(b))
	writeFileSync(dtsPath, `${sorted.map(([, block]) => block).join('\n\n')}\n\ndeclare module 'https://esm.sh/*'\n`)
	if (added.length > 0) console.log(`✓ Added ${added.length} declaration(s): ${added.join(', ')}`)
	if (orphaned.length > 0) console.log(`✓ Removed ${orphaned.length} unused declaration(s): ${orphaned.join(', ')}`)
}

function scanEsmImports() {
	const files: string[] = []

	for (const dir of ['p', 't']) {
		const base = join(SRC, dir)
		if (!existsSync(base)) continue

		for (const slug of readdirSync(base)) {
			const penDir = join(base, slug)
			if (!statSync(penDir).isDirectory()) continue

			for (const file of readdirSync(penDir))
				if (file.endsWith('.tsx') || file.endsWith('.ts')) files.push(join(penDir, file))
		}
	}

	const esmPattern = /from ["']https:\/\/esm\.sh\/([^"']+)["']/g
	const fullUrls = new Set<string>()
	const referencedPkgs = new Set<string>()

	for (const file of files)
		for (const m of readFileSync(file, 'utf8').matchAll(esmPattern)) {
			const url = `https://esm.sh/${m[1]}`
			fullUrls.add(url)
			referencedPkgs.add(npmPkgRoot(esmShToNpm(url)))
		}

	const undeclared = referencedPkgs.difference(declaredPkgs()).values().toArray()

	return { fullUrls, referencedPkgs, undeclared }
}

function findStaleDeps(referencedPkgs: ReadonlySet<string>) {
	const deps = new Set(Object.keys(readPackageJson(join(ROOT, 'package.json')).dependencies ?? {}))

	return deps.difference(referencedPkgs).values().toArray()
}

export async function cmdCheck(opts: { fix?: boolean }) {
	const { fullUrls, referencedPkgs, undeclared } = scanEsmImports()
	const stale = findStaleDeps(referencedPkgs)
	syncEsmDeclarations(fullUrls.values().toArray())

	if (undeclared.length === 0 && stale.length === 0)
		return void note('Every esm.sh import is a declared dependency, and none are unused.', 'Check')

	const issues = [
		undeclared.length > 0 && `Imported but not in package.json: ${undeclared.join(', ')}`,
		stale.length > 0 && `In package.json but imported by no pen: ${stale.join(', ')}`,
	].filter(Boolean)
	note(issues.join('\n'), 'Issues found')

	if (!opts.fix) fail(`Run: penx check --fix`)

	if (undeclared.length > 0) {
		const progress = spinner()
		progress.start(`Installing ${undeclared.length} undeclared package(s)…`)
		spawnSync('bun', ['add', ...undeclared], { cwd: ROOT, stdio: 'pipe' })
		progress.stop(`Installed ${undeclared.length} package(s).`)
		installAtTypes(undeclared.filter((pkg) => !hasOwnTypes(pkg)))
		syncEsmDeclarations(fullUrls.values().toArray())
	}

	if (stale.length > 0) {
		const toRemove = cancelGuard(
			await multiselect({
				message: 'Remove stale dependencies?',
				options: stale.map((pkg) => ({ label: pkg, value: pkg })),
				initialValues: stale,
			}),
		)

		if (toRemove.length > 0) {
			const progress = spinner()
			progress.start(`Removing ${toRemove.length} stale package(s)…`)
			spawnSync('bun', ['remove', ...toRemove], { cwd: ROOT, stdio: 'pipe' })
			progress.stop(`Removed ${toRemove.length} package(s).`)

			const typePkgs = toRemove.map(toAtTypesName).filter((name) => existsSync(join(ROOT, 'node_modules', name)))

			if (typePkgs.length > 0) {
				spawnSync('bun', ['remove', ...typePkgs], { cwd: ROOT, stdio: 'pipe' })
				console.log(`✓ Removed ${typePkgs.length} @types package(s).`)
			}
		}
	}

	note('All issues resolved.', 'Check')
}
