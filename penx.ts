#!/usr/bin/env bun
import { intro, log, note, outro, select, text } from '@clack/prompts'
import { Command } from 'commander'
import { cpSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cmdCheck } from './penx/check.ts'
import { login } from './penx/codepen.ts'
import { cancelGuard, ensureNewPen, fail, getDirs, getPens, PENS_DIR, ROOT, selectFrom, SRC } from './penx/shared.ts'
import { cmdPull, cmdPush } from './penx/sync.ts'

const TEMPLATES_DIR = join(SRC, 't')
const previewUrl = (slug: string) => `http://localhost:5173/p/${slug}/`

async function cmdNew(slug: string | undefined, options: { template?: string }) {
	const resolvedSlug =
		slug ??
		cancelGuard(await text({ message: 'Pen slug:', validate: (value) => (value?.trim() ? undefined : 'Required') }))
	const dest = ensureNewPen(resolvedSlug)
	const templates = getDirs(TEMPLATES_DIR)
	const template = options.template ?? (await selectFrom(templates, 'Choose template:'))
	if (!templates.includes(template)) fail(`Template "${template}" not found in src/t/.`)
	cpSync(join(TEMPLATES_DIR, template), dest, { recursive: true })
	note(`Preview: ${previewUrl(resolvedSlug)}`, `Created src/p/${resolvedSlug}/`)
}

function cmdList() {
	const pens = getPens()
	const width = Math.max(4, ...pens.map((slug) => slug.length))
	const rows = pens.map(
		(slug) => `${slug.padEnd(width)}  ${statSync(join(PENS_DIR, slug)).birthtime.toLocaleDateString()}`,
	)
	const table = [`${'SLUG'.padEnd(width)}  CREATED`, `${'─'.repeat(width)}  ${'─'.repeat(10)}`, ...rows]
	note(pens.length > 0 ? table.join('\n') : 'No pens yet. Run: penx new', 'Pens')
}

async function cmdDev(slug?: string) {
	const vite = Bun.spawn(['bun', 'run', 'dev'], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] })
	if (slug) setTimeout(() => Bun.spawn([process.platform === 'darwin' ? 'open' : 'xdg-open', previewUrl(slug)]), 1500)
	process.exit(await vite.exited)
}

const program = new Command().name('penx').description('local CodePen manager')
program.hook('postAction', () => outro('Done.'))

program
	.command('new')
	.description('Create a new pen')
	.argument('[slug]', 'pen slug')
	.option('-t, --template <name>', 'template to use')
	.action(cmdNew)
program.command('list').description('List all pens').action(cmdList)
program
	.command('dev')
	.description('Start Vite dev server')
	.argument('[slug]', 'pen slug to open in browser')
	.action(cmdDev)
program
	.command('push')
	.description('Publish a pen to CodePen: creates a public pen on first push, then updates it')
	.argument('[slug]', 'pen slug to push')
	.action(cmdPush)
program
	.command('pull')
	.description("Pull a pen's CodePen files: a linked pen by slug, or any pen by --url into a new one")
	.argument('[slug]', 'pen slug to pull into')
	.option('--url <url>', 'CodePen 2.0 pen URL (https://codepen.io/editor/<user>/pen/<id>)')
	.action(cmdPull)
program
	.command('login')
	.description('Sign in to CodePen in a Chrome window, once; push and pull reuse the session headless')
	.action(async () => {
		note('Sign in to CodePen in the Chrome window that opens; it closes once you are in.', 'Login')
		log.success(`Signed in as ${await login()}.`)
	})
program
	.command('check')
	.description(
		'Audit esm.sh imports against package.json and esm-sh.d.ts, and flag CDN URLs pinned to a version; exits 1 on any finding',
	)
	.option('-f, --fix', 'apply every repair, then report what remains')
	.option('--offline', 'with --fix, skip the repairs that run bun add or bun remove')
	.action(cmdCheck)

intro('penx')
if (process.argv.slice(2).every((arg) => arg.startsWith('-') && !['--help', '-h'].includes(arg))) {
	const command = cancelGuard(
		await select({
			message: 'What would you like to do?',
			options: [
				{ value: 'new', label: 'New pen', hint: 'create from template' },
				{ value: 'list', label: 'List pens' },
				{ value: 'dev', label: 'Dev server', hint: 'start Vite' },
				{ value: 'push', label: 'Push pen', hint: 'publish to CodePen' },
				{ value: 'pull', label: 'Pull pen', hint: 'from CodePen' },
				{ value: 'login', label: 'Log in to CodePen', hint: 'once, in a Chrome window' },
				{ value: 'check', label: 'Check', hint: 'audit esm.sh imports, deps + pinned URLs' },
				{ value: 'check --fix', label: 'Check & fix', hint: 'auto-fix issues' },
			],
		}),
	)
	process.argv.splice(2, Infinity, ...command.split(' '))
}
await program.parseAsync()
