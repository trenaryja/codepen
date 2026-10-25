#!/usr/bin/env bun

/**
 * penx — local CodePen manager
 *
 * Progressive CLI: every option works as a flag (scriptable) or as an
 * interactive prompt when flags are omitted.
 */

import { intro, note, outro, select } from '@clack/prompts'
import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { version as VERSION } from './package.json'
import { cmdCheck } from './penx/check.ts'
import { cmdExport } from './penx/export.ts'
import { cmdImport } from './penx/import.ts'
import {
	cancelGuard,
	ensureNewPen,
	fail,
	getPens,
	getTemplates,
	openInBrowser,
	PEN_FILES,
	PENS_DIR,
	prompt,
	ROOT,
	TEMPLATES_DIR,
} from './penx/shared.ts'

function copyPen(src: string, dest: string) {
	mkdirSync(dest, { recursive: true })

	for (const { file } of PEN_FILES) {
		const srcFile = join(src, file)
		const destFile = join(dest, file)
		if (existsSync(srcFile)) copyFileSync(srcFile, destFile)
		else writeFileSync(destFile, '')
	}
}

async function cmdNew(slug?: string, template?: string) {
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

function cmdList() {
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

	if (args.every((a) => a.startsWith('-') && !['--help', '--version', '-h', '-V'].includes(a))) {
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

		process.argv = [...process.argv.slice(0, 2), ...command.split(' ')]
	} else intro('penx')

	await program.parseAsync(process.argv)
}

await main()
