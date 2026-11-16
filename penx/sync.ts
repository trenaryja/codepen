import { log, note, spinner } from '@clack/prompts'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as R from 'remeda'
import { build } from 'vite'
import { z } from 'zod'
import { penMetaSchema } from '../src/pen-meta.ts'
import { fetchPen, PEN_FILE_NAMES, savePen } from './codepen.ts'
import { penDocument, penFragment } from './document.ts'
import { ensureNewPen, fail, getPens, PENS_DIR, selectFrom } from './shared.ts'

/** The page around a pen's `index.html` fragment on CodePen, where its files sit side by side. */
const codePenShell = (title: string) => ({
	title,
	head: '  <link rel="stylesheet" href="./style.css" />',
	script: './script.js',
})

const readMeta = async (slug: string) =>
	z.object({ default: penMetaSchema }).parse(await import(join(PENS_DIR, slug, 'meta.ts'))).default

/** A pen's `meta.ts`, written the way Prettier leaves it. */
const metaSource = (meta: z.infer<typeof penMetaSchema>) =>
	`import type { PenMeta } from '../../pen-meta.ts'\n\nexport default {\n${R.entries(meta)
		.map(([key, value]) => `\t${key}: '${value.replaceAll('\\', '\\\\').replaceAll("'", String.raw`\'`)}',\n`)
		.join('')}} satisfies PenMeta\n`

const readText = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

/** Plain JS importing only URLs ships as written, so a pen edited on CodePen pulls back unchanged. */
function isPlainScript(source: string) {
	try {
		return new Bun.Transpiler({ loader: 'js' }).scanImports(source).every(({ path }) => !path.startsWith('.'))
	} catch {
		return false
	}
}

/** `pen.tsx` as CodePen runs it: verbatim when plain JS, else compiled with its local modules inlined. */
async function penScript(penDir: string) {
	const entry = join(penDir, 'pen.tsx')
	const source = readText(entry)
	if (isPlainScript(source)) return source
	// Not Bun.build: a URL two local modules import comes out twice, renamed `R4`, `cn4`; Rolldown merges it under its own name
	const result = await build({
		configFile: false,
		logLevel: 'silent',
		oxc: { jsx: { runtime: 'classic' } },
		build: {
			write: false,
			minify: false,
			target: 'esnext',
			lib: { entry, formats: ['es'] },
			rolldownOptions: { external: [/^https:\/\//] },
		},
	}).catch((error: unknown) => fail(`Building ${entry} failed:\n${String(error)}`))
	const chunk = [result]
		.flat()
		.flatMap((x) => ('output' in x ? x.output : []))
		.find((x) => x.type === 'chunk')
	return chunk?.code ?? fail(`Building ${entry} made no script.`)
}

async function withSpinner<T>(message: string, work: () => Promise<T>) {
	const progress = spinner()
	progress.start(message)
	try {
		const result = await work()
		progress.stop(message)
		return result
	} catch (error) {
		progress.error(message)
		fail(error instanceof Error ? error.message : String(error))
	}
}

export async function cmdPush(slug?: string) {
	const resolvedSlug = slug ?? (await selectFrom(getPens(), 'Which pen to push?'))
	const penDir = join(PENS_DIR, resolvedSlug)
	if (!existsSync(penDir)) fail(`Pen "${resolvedSlug}" not found.`)
	const meta = await readMeta(resolvedSlug)
	const files = {
		'index.html': penDocument({ ...codePenShell(resolvedSlug), fragment: readText(join(penDir, 'index.html')) }),
		'style.css': readText(join(penDir, 'style.css')),
		'script.js': await penScript(penDir),
	}
	const { url, changed } = await withSpinner(
		meta.codepen ? `Pushing ${resolvedSlug} to CodePen` : `Creating ${resolvedSlug} on CodePen, public`,
		() => savePen({ url: meta.codepen, title: resolvedSlug, files }),
	)
	if (!meta.codepen) writeFileSync(join(penDir, 'meta.ts'), metaSource({ ...meta, codepen: url }))
	note(url, changed.length > 0 ? `Saved ${changed.join(', ')}` : 'Already up to date')
}

/** Where a pull reads from: `url`, into a new pen, or else a linked pen's CodePen copy, over that pen. */
async function pullSource(slug?: string, url?: string) {
	if (url) return { slug, url, isLinked: false }
	const metas = await Promise.all(getPens().map(async (pen) => [pen, (await readMeta(pen)).codepen] as const))
	const links = R.fromEntries(metas.flatMap(([pen, link]) => (link ? [[pen, link] as const] : [])))
	if (!slug && R.isEmpty(links)) fail('No pen is linked to CodePen yet: pull one with --url.')
	const linkedSlug = slug ?? (await selectFrom(R.keys(links), 'Which pen to pull?'))
	const link =
		links[linkedSlug] ?? fail(`Pen "${linkedSlug}" isn't on CodePen: push it, or pull another pen with --url.`)
	return { slug: linkedSlug, url: link, isLinked: true }
}

/** What a pull writes to `pen.tsx`: CodePen's script.js, unless the local `pen.tsx` compiles to it. */
async function pulledScript(penDir: string, script: string) {
	const local = readText(join(penDir, 'pen.tsx'))
	if (local === '' || isPlainScript(local)) return script
	if (script !== (await penScript(penDir)))
		log.warn("CodePen's script.js differs from pen.tsx's build, but it's build output: pen.tsx is kept as is.")
	return local
}

export async function cmdPull(slug: string | undefined, options: { url?: string }) {
	const source = await pullSource(slug, options.url)
	const pen = await withSpinner('Pulling from CodePen', () => fetchPen(source.url))
	const finalSlug =
		source.slug ??
		pen.title
			.toLowerCase()
			.replaceAll(/[^\da-z]+/g, '-')
			.replaceAll(/^-|-$/g, '')
	if (!finalSlug) fail(`"${pen.title}" makes no slug: pass one, as \`penx pull <slug> --url ${source.url}\`.`)
	const dest = source.isLinked ? join(PENS_DIR, finalSlug) : ensureNewPen(finalSlug)
	mkdirSync(dest, { recursive: true })

	const ignored = R.keys(pen.files).filter((path) => !R.isIncludedIn(path, PEN_FILE_NAMES))
	if (ignored.length > 0)
		log.warn(`Not pulled, as penx pens hold only ${PEN_FILE_NAMES.join(', ')}: ${ignored.join(', ')}`)

	const html = pen.files['index.html'] ?? ''
	const fragment = penFragment(html, codePenShell(pen.title))
	if (fragment === undefined) log.warn("index.html isn't a page penx pushed, so it's kept whole rather than unwrapped.")

	const next = {
		'index.html': fragment ?? html,
		'style.css': pen.files['style.css'] ?? '',
		'pen.tsx': await pulledScript(dest, pen.files['script.js'] ?? ''),
		'meta.ts': source.isLinked ? undefined : metaSource({ icon: 'lu/LuCircleDashed', codepen: source.url }),
	}
	const writes = R.entries(next).filter(([file, text]) => text !== undefined && readText(join(dest, file)) !== text)
	for (const [file, text = ''] of writes) writeFileSync(join(dest, file), text)
	note(
		join('src', 'p', finalSlug),
		writes.length > 0 ? `Wrote ${writes.map(([file]) => file).join(', ')}` : 'Already up to date',
	)
}
