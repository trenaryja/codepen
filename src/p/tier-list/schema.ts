import * as R from 'https://esm.sh/remeda'
import { z } from 'https://esm.sh/zod'

export const imageUrlSchema = z.union([z.url(), z.string().startsWith('data:image/')])

const tierSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	color: z.string().optional(),
	imageUrl: imageUrlSchema.optional(),
	itemIds: z.array(z.string()).default([]),
})
export type Tier = z.infer<typeof tierSchema>

const itemSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	color: z.string().optional(),
	imageUrl: imageUrlSchema.optional(),
})
export type Item = z.infer<typeof itemSchema>

const settingsSchema = z.object({
	showLabels: z.boolean().default(true),
	showImages: z.boolean().default(true),
	itemShape: z.enum(['square', 'circle', 'rounded']).default('rounded'),
})
export type TierListSettings = z.infer<typeof settingsSchema>

const CURRENT_VERSION = 1

// Migration chain: unversioned legacy exports → v1. Future versions append steps here.
const migrate = (data: unknown) => {
	if (!R.isPlainObject(data) || 'version' in data) return data
	// Legacy exports always carried settings.showImages=false while images rendered unconditionally —
	// flip it so migrated files keep looking the way they did
	const settings = R.isPlainObject(data.settings) ? { ...data.settings, showImages: true } : undefined
	return { ...data, settings, version: 1 }
}

export const tierListSchema = z.preprocess(
	migrate,
	z
		.object({
			version: z.literal(CURRENT_VERSION),
			title: z.string().min(1),
			tiers: z.array(tierSchema).min(1),
			items: z.array(itemSchema),
			settings: settingsSchema.default({ showLabels: true, showImages: true, itemShape: 'rounded' }),
		})
		.superRefine((data, context) => {
			const tierIds = R.map(data.tiers, R.prop('id'))
			if (new Set(tierIds).size !== tierIds.length)
				context.addIssue({ code: 'custom', path: ['tiers'], message: 'Tier IDs must be unique' })

			const itemIds = R.map(data.items, R.prop('id'))
			if (new Set(itemIds).size !== itemIds.length)
				context.addIssue({ code: 'custom', path: ['items'], message: 'Item IDs must be unique' })

			const itemIdSet = new Set(itemIds)
			for (const [tierIndex, tier] of data.tiers.entries()) {
				const missing = tier.itemIds.filter((id) => !itemIdSet.has(id))
				if (missing.length)
					context.addIssue({
						code: 'custom',
						path: ['tiers', tierIndex, 'itemIds'],
						message: `Unknown item id(s): ${missing.join(', ')}`,
					})
			}

			const multiAssigned = R.pipe(
				data.tiers,
				R.flatMap((tier) => tier.itemIds),
				R.countBy((id) => id),
				(counts) => R.entries(counts),
				R.filter(([, count]) => count > 1),
				R.map(([id]) => id),
			)
			if (multiAssigned.length)
				context.addIssue({
					code: 'custom',
					path: ['tiers'],
					message: `Items assigned to multiple tiers: ${multiAssigned.join(', ')}`,
				})
		}),
)
export type TierList = z.infer<typeof tierListSchema>

export const defaultTierList: TierList = tierListSchema.parse({
	title: 'My Tier List',
	tiers: [
		{ id: R.randomString(21), label: 'S', color: '#f0b100' },
		{ id: R.randomString(21), label: 'A', color: '#fb2c36' },
		{ id: R.randomString(21), label: 'B', color: '#ff6900' },
		{ id: R.randomString(21), label: 'C', color: '#00c950' },
		{ id: R.randomString(21), label: 'D', color: '#2b7fff' },
		{ id: R.randomString(21), label: 'F', color: '#ad46ff' },
	],
	items: [
		{ id: R.randomString(21), label: 'Example 1' },
		{ id: R.randomString(21), label: 'Example 2' },
		{ id: R.randomString(21), label: 'Example 3' },
		{ id: R.randomString(21), label: 'Example 4' },
		{ id: R.randomString(21), label: 'Example 5' },
		{ id: R.randomString(21), label: 'Example 6' },
		{ id: R.randomString(21), label: 'Example 7' },
		{ id: R.randomString(21), label: 'Example 8' },
	],
})

export const BANK_ID = 'option-bank'
export const STORAGE_KEY = 'tier-list'

export const deserializeTierList = (value = '') => {
	try {
		const result = tierListSchema.safeParse(JSON.parse(value))
		return result.success ? result.data : defaultTierList
	} catch {
		return defaultTierList
	}
}
