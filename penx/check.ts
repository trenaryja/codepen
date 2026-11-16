import { note } from '@clack/prompts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as R from 'remeda'
import { z } from 'zod'
import { esmShToNpm, npmPkgRoot } from './esm-sh.ts'
import { fail, ROOT } from './shared.ts'

const DTS_PATH = join(ROOT, 'esm-sh.d.ts')
const DECLARATION = /declare module '(https:\/\/esm\.sh\/(?!\*)[^']+)'(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?/g
const ESM_IMPORT = /from ["'](https:\/\/esm\.sh\/[^"']+)["']/g
/** A CDN URL with a version or commit after a package or repo name; a gh/ branch like @master tracks the latest and passes */
const PINNED_URL =
	/https:\/\/(?:esm\.sh|unpkg\.com|cdn\.jsdelivr\.net\/(?:npm|gh))\/[^"'`\s)]*?[^/]@(?:[v^~]?\d|[\da-f]{7,40}\b)[^"'`\s)]*/g

const packageJsonSchema = z.object({
	dependencies: z.record(z.string(), z.string()).optional(),
	devDependencies: z.record(z.string(), z.string()).optional(),
	exports: z.unknown().optional(),
	types: z.string().optional(),
	typings: z.string().optional(),
})

function readPackageJson(path: string) {
	const result = packageJsonSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
	if (!result.success) throw new Error(`${path}: ${z.prettifyError(result.error)}`)
	return result.data
}

function hasOwnTypes(pkgName: string) {
	try {
		const pkg = readPackageJson(join(ROOT, 'node_modules', pkgName, 'package.json'))
		return Boolean(pkg.types ?? pkg.typings) || JSON.stringify(pkg.exports ?? {}).includes('"types"')
	} catch {
		return false
	}
}

const toAtTypesName = (pkgName: string) =>
	pkgName.startsWith('@') ? `@types/${pkgName.slice(1).replace('/', '__')}` : `@types/${pkgName}`

const pkgOf = (url: string) => npmPkgRoot(esmShToNpm(url))

const penFiles = (extensions: string) =>
	R.sort([...new Bun.Glob(`src/{p,t}/*/**/*.{${extensions}}`).scanSync({ cwd: ROOT })], (a, b) => a.localeCompare(b))

/** Every esm.sh URL a pen or template imports, mapped to the first file (in path order) importing it */
function esmImports() {
	const imports = new Map<string, string>()
	for (const file of penFiles('ts,tsx'))
		for (const [, url = ''] of readFileSync(join(ROOT, file), 'utf8').matchAll(ESM_IMPORT))
			if (!imports.has(url)) imports.set(url, file)
	return imports
}

/** The pens' esm.sh imports against package.json and esm-sh.d.ts, plus esm-sh.d.ts as `--fix` writes it */
function audit() {
	const imports = esmImports()
	const urls = imports.keys().toArray()
	const pkg = readPackageJson(join(ROOT, 'package.json'))
	// package.json, never node_modules: an orphaned install dir would read as declared while nothing keeps it installed.
	const declared = new Set([...R.keys(pkg.dependencies ?? {}), ...R.keys(pkg.devDependencies ?? {})])
	const referenced = new Set(urls.map(pkgOf))
	const current = readFileSync(DTS_PATH, 'utf8')
	const blocks = new Map(current.matchAll(DECLARATION).map(([block, url = '']) => [url, block] as const))
	const typed = R.sort(
		urls.filter((url) => blocks.has(url) || declared.has(pkgOf(url))),
		(a, b) => a.localeCompare(b),
	)
	const declarations = typed.map(
		(url) => blocks.get(url) ?? `declare module '${url}' {\n\texport * from '${esmShToNpm(url)}'\n}`,
	)
	return {
		undeclared: R.uniqueBy(
			urls.filter((url) => !declared.has(pkgOf(url))),
			pkgOf,
		).map((url) => ({ pkg: pkgOf(url), file: imports.get(url) })),
		stale: R.keys(pkg.dependencies ?? {}).filter((name) => !referenced.has(name)),
		missing: typed.filter((url) => !blocks.has(url)),
		orphaned: blocks
			.keys()
			.filter((url) => !imports.has(url))
			.toArray(),
		dts: { current, next: `${declarations.join('\n\n')}\n\ndeclare module 'https://esm.sh/*'\n` },
	}
}

const bun = (...args: string[]) =>
	Bun.spawnSync(['bun', ...args], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' }).success

/** Reports every finding and exits 1; `--fix` repairs them all, `--offline` short of `bun add` and `bun remove` */
export function cmdCheck({ fix = false, offline = false }: { fix?: boolean; offline?: boolean }) {
	if (fix && !offline) {
		const { undeclared, stale } = audit()
		const added = undeclared.map((x) => x.pkg)
		if (added.length > 0 && !bun('add', ...added)) fail(`bun add ${added.join(' ')} failed`)
		// Most packages have no @types, so a failed `bun add -d @types/<pkg>` only means there are none.
		for (const name of added) if (!hasOwnTypes(name)) bun('add', '-d', toAtTypesName(name))
		const typings = stale.map(toAtTypesName).filter((name) => existsSync(join(ROOT, 'node_modules', name)))
		if (stale.length > 0 && !bun('remove', ...stale, ...typings)) fail(`bun remove ${stale.join(' ')} failed`)
	}

	const { undeclared, stale, missing, orphaned, dts } = audit()
	if (fix && dts.current !== dts.next) writeFileSync(DTS_PATH, dts.next)
	const findings = [
		...undeclared.map(({ pkg, file }) => `package.json: ${pkg} is imported by ${file} but not declared`),
		...stale.map((name) => `package.json: ${name} is a dependency no pen imports`),
		...(fix
			? []
			: [
					...missing.map((url) => `esm-sh.d.ts: no declaration for ${url}`),
					...orphaned.map((url) => `esm-sh.d.ts: declares ${url}, which no pen imports`),
				]),
	]
	const pinned = penFiles('ts,tsx,html,css').flatMap((file) =>
		readFileSync(join(ROOT, file), 'utf8')
			.matchAll(PINNED_URL)
			.map(([url]) => `${file}: ${url} pins a version`)
			.toArray(),
	)
	if (findings.length + pinned.length === 0)
		return void note(
			'Every esm.sh import is declared and typed, no pen leaves a dependency unused, and no CDN URL pins a version.',
			'Check',
		)
	for (const finding of [...findings, ...pinned]) console.log(finding)
	if (pinned.length > 0)
		fail('A pinned URL never picks up fixes: drop its @version by hand, or give a gh/ URL a branch like @master.')
	if (!fix) fail('`penx check --fix` repairs these.')
	note('`penx check --fix` without --offline runs the bun add and bun remove these need.', 'Left')
}
