import { cancel, CANCEL_SYMBOL, select, text } from '@clack/prompts'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = join(import.meta.dir, '..')
export const SRC = join(ROOT, 'src')
export const PENS_DIR = join(SRC, 'p')
export const TEMPLATES_DIR = join(SRC, 't')

export function fail(message: string): never {
	cancel(message)
	process.exit(1)
}

export function cancelGuard<T>(value: typeof CANCEL_SYMBOL | T): T {
	if (value === CANCEL_SYMBOL) {
		cancel('Cancelled.')
		process.exit(0)
	}

	return value
}

export const prompt = async (message: string, validate?: (value?: string) => string | undefined) =>
	cancelGuard(await text({ message, validate }))

export const selectPen = async (pens: readonly string[], message: string) =>
	cancelGuard(await select({ message, options: pens.map((pen) => ({ label: pen, value: pen })) }))

const getDirs = (base: string) =>
	existsSync(base) ? readdirSync(base).filter((dir) => statSync(join(base, dir)).isDirectory()) : []

export const getPens = () => getDirs(PENS_DIR)
export const getTemplates = () => getDirs(TEMPLATES_DIR)

const DEFAULT_META = `import type { PenMeta } from '../../pen-meta.ts'

export default { icon: 'lu/LuCircleDashed' } satisfies PenMeta
`

// The files every pen has, each with the content to write when no source supplies it.
// `panel` names which CodePen panel fills the file; `meta.ts` has no panel, so it is always the default.
export const PEN_FILES = [
	{ file: 'index.html', panel: 'html', fallback: '' },
	{ file: 'style.css', panel: 'css', fallback: '/* pen styles */\n' },
	{ file: 'pen.tsx', panel: 'js', fallback: '// pen\n' },
	{ file: 'meta.ts', panel: null, fallback: DEFAULT_META },
] as const

export function ensureNewPen(slug: string) {
	const dest = join(PENS_DIR, slug)
	if (existsSync(dest)) fail(`Pen "${slug}" already exists.`)

	return dest
}

export function writePen(dest: string, panels: { html: string; css: string; js: string }) {
	mkdirSync(dest, { recursive: true })
	for (const { file, panel, fallback } of PEN_FILES) writeFileSync(join(dest, file), panel ? panels[panel] : fallback)
}

export function openInBrowser(url: string) {
	const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
	spawnSync(cmd, [url], { stdio: 'ignore' })
}
