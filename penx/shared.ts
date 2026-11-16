import { cancel, CANCEL_SYMBOL, select } from '@clack/prompts'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = join(import.meta.dir, '..')
export const SRC = join(ROOT, 'src')
export const PENS_DIR = join(SRC, 'p')

export function fail(message: string): never {
	cancel(message)
	process.exit(1)
}

export function cancelGuard<T>(value: typeof CANCEL_SYMBOL | T) {
	if (value !== CANCEL_SYMBOL) return value
	cancel('Cancelled.')
	process.exit(0)
}

export const selectFrom = async (values: readonly string[], message: string) =>
	cancelGuard(await select({ message, options: values.map((value) => ({ value })) }))

export const getDirs = (base: string) =>
	existsSync(base) ? readdirSync(base).filter((dir) => statSync(join(base, dir)).isDirectory()) : []

export const getPens = () => getDirs(PENS_DIR)

export function ensureNewPen(slug: string) {
	const dest = join(PENS_DIR, slug)
	if (existsSync(dest)) fail(`Pen "${slug}" already exists.`)
	return dest
}
