import { note, select, spinner, text } from '@clack/prompts'
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { cancelGuard, ensureNewPen, fail, PEN_FILES, prompt, writePen } from './shared.ts'

const requireSlug = (value?: string) => (value?.trim() ? undefined : 'Required')

function readMultiline() {
	return new Promise<string>((resolve) => {
		const rl = createInterface({ input: process.stdin, terminal: false })
		const lines: string[] = []
		rl.on('line', (line) => {
			if (line.trim() === '---') {
				rl.close()
				resolve(lines.join('\n'))
			} else lines.push(line)
		})
		rl.on('close', () => resolve(lines.join('\n')))
	})
}

async function importPaste(slugFlag?: string) {
	const slug = slugFlag ?? (await prompt('Pen slug:', requireSlug))
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

async function importZip(slugFlag?: string, zipFlag?: string) {
	const zipPath =
		zipFlag ?? (await prompt('Path to ZIP file:', (v) => (v && existsSync(v.trim()) ? undefined : 'File not found')))
	const slug = slugFlag ?? (await prompt('Pen slug:', requireSlug))
	const dest = ensureNewPen(slug)

	const result = spawnSync('unzip', ['-o', zipPath.trim(), '-d', dest], { stdio: 'inherit' })
	if (result.status !== 0) fail('Failed to unzip.')

	for (const { file, fallback } of PEN_FILES)
		if (!existsSync(join(dest, file))) writeFileSync(join(dest, file), fallback)

	note(`Preview: http://localhost:5173/p/${slug}/`, `Imported to p/${slug}/`)
}

const codePenPenSchema = z.object({
	html: z.string().optional(),
	css: z.string().optional(),
	js: z.string().optional(),
})

async function importUrl(slugFlag?: string, urlFlag?: string) {
	const url =
		urlFlag ??
		(await prompt('CodePen URL (e.g. https://codepen.io/user/pen/slug):', (v) =>
			v?.includes('codepen.io') ? undefined : 'Must be a CodePen URL',
		))

	const match = /codepen\.io\/([^/]+)\/pen\/([^#/?]+)/.exec(url)
	if (!match) fail('Could not parse CodePen URL.')

	const [, user, penSlug] = match
	const apiUrl = `https://codepen.io/${user}/pen/${penSlug}.js`
	const progress = spinner()
	progress.start(`Fetching ${apiUrl}…`)
	const res = await fetch(apiUrl)

	if (!res.ok) {
		progress.stop(`Failed: ${res.status} ${res.statusText}`)
		fail('Could not fetch pen.')
	}

	const parsed = codePenPenSchema.safeParse(await res.json())
	progress.stop('Fetched pen data.')
	if (!parsed.success) fail(`${apiUrl} returned an unexpected shape: ${z.prettifyError(parsed.error)}`)
	const { data } = parsed

	const slug =
		slugFlag ?? cancelGuard(await text({ message: 'Save as slug:', placeholder: penSlug, validate: requireSlug }))
	const dest = ensureNewPen(slug)

	writePen(dest, { html: data.html ?? '', css: data.css ?? '/* pen styles */\n', js: data.js ?? '// pen\n' })
	note(`Preview: http://localhost:5173/p/${slug}/`, `Imported to p/${slug}/`)
}

export async function cmdImport(opts: { method?: string; slug?: string; url?: string; zip?: string }) {
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
