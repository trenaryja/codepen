import type { Constraint, TagId } from './recipes'

export const OP_SYMBOL: Record<Constraint['op'], string> = { '=': '=', '>=': '≥', exclude: '✕' }
export const GF_PITCH = 42.5 // mm/unit: 42mm nominal + 0.5mm → ~1mm min gap between printed bins
export const PRINT_BED_H = 256 // X1C bed depth mm — anchor plate to back-left, away from exclusion zone
export const PRINT_BED_MARGIN = 5 // mm clearance from bed edge
export const SVG_PADDING = 20
export const SVG_CELL = 100
export const BIN_INSET = 3

export const STOPS = [
	'var(--color-primary)',
	'var(--color-secondary)',
	'var(--color-accent)',
	'var(--color-info)',
	'var(--color-success)',
	'var(--color-warning)',
	'var(--color-error)',
]

export const TAGS: Record<'favorite' | TagId, { label: string; description: string }> = {
	favorite: { label: 'favorites', description: 'Recipes you have marked as favorites.' },
	'max-unique': {
		label: 'max unique',
		description: 'Uses the largest number of distinct piece sizes possible for this plate.',
	},
	monochrome: {
		label: 'mono',
		description: 'Uses only a single piece size.',
	},
	'no-repeat': {
		label: 'no repeat',
		description: 'Every piece in the recipe is a different size — no size appears twice.',
	},
	'squares-only': {
		label: 'squares only',
		description: 'Every piece is a square (width = height).',
	},
	'uniform-count': {
		label: 'uniform',
		description: 'Every piece size appears the same number of times.',
	},
	'all-multi': {
		label: 'all multi',
		description: 'Every piece size appears at least twice — no singletons.',
	},
}
