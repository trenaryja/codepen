import * as R from 'https://esm.sh/remeda'
import type { Scenario, ScenarioImport } from './types'

export const USB_C_SCENARIO: Scenario = {
	id: 'usb-c-magnetic',
	name: 'Magnetic USB-C Adapter',
	items: [
		{ id: 'adapter', displayName: 'Adapter', variable: '🔌' },
		{ id: 'port', displayName: 'Port/Tip', variable: '🔗' },
	],
	bundles: [
		{ id: 'b1', name: '1Pc', price: 8.99, quantities: { adapter: 1, port: 1 } },
		{ id: 'b2', name: '1Pack+2Ports', price: 9.99, quantities: { adapter: 1, port: 2 } },
		{ id: 'b3', name: '2Pack+2Ports', price: 13.99, quantities: { adapter: 2, port: 2 } },
		{ id: 'b4', name: '2Pack+4Ports', price: 19.99, quantities: { adapter: 2, port: 4 } },
	],
}

export const PRESET_SCENARIOS: ScenarioImport[] = [
	{
		name: 'Philips Hue A19 Color Ambiance',
		items: [{ name: 'Bulb', symbol: '💡' }],
		bundles: [
			{ name: '1 Pack', price: 49.97, quantities: [1] },
			{ name: '2 Pack', price: 89.98, quantities: [2] },
			{ name: '3 Pack', price: 79.97, quantities: [3] },
			{ name: '4 Pack', price: 134.99, quantities: [4] },
			{ name: '6 Pack', price: 158.42, quantities: [6] },
		],
	},
	{
		name: 'CAP Barbell Neoprene Dumbbells',
		items: [
			{ name: '2lb Pair', symbol: '2️⃣' },
			{ name: '3lb Pair', symbol: '3️⃣' },
			{ name: '4lb Pair', symbol: '4️⃣' },
			{ name: '5lb Pair', symbol: '5️⃣' },
			{ name: '6lb Pair', symbol: '6️⃣' },
			{ name: '7lb Pair', symbol: '7️⃣' },
			{ name: '8lb Pair', symbol: '8️⃣' },
			{ name: '9lb Pair', symbol: '9️⃣' },
			{ name: '10lb Pair', symbol: '🔟' },
			{ name: '12lb Pair', symbol: '🅱️' },
			{ name: '15lb Pair', symbol: '🅰️' },
			{ name: '20lb Pair', symbol: '🔴' },
			{ name: 'Rack', symbol: '🗄️' },
		],
		bundles: [
			{ name: '2lb Pair', price: 6.99, quantities: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '3lb Pair', price: 8.99, quantities: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '4lb Pair', price: 8.99, quantities: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '5lb Pair', price: 10.99, quantities: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '6lb Pair', price: 11.99, quantities: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '7lb Pair', price: 10.99, quantities: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
			{ name: '8lb Pair', price: 15.99, quantities: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
			{ name: '9lb Pair', price: 15.99, quantities: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
			{ name: '10lb Pair', price: 17.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
			{ name: '12lb Pair', price: 21.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
			{ name: '15lb Pair', price: 27.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0] },
			{ name: '20lb Pair', price: 41.99, quantities: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] },
			{ name: '20lb Set', price: 35.88, quantities: [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
			{ name: '32lb Set', price: 39.99, quantities: [0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1] },
			{ name: '56lb Set', price: 83.99, quantities: [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1] },
			{ name: '60lb Set', price: 84.99, quantities: [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1] },
			{ name: '100lb Set', price: 109.99, quantities: [0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1] },
		],
	},
	{
		name: 'Lovesac Sactionals',
		items: [
			{ name: 'Seats', symbol: '🛋️' },
			{ name: 'Sides', symbol: '📐' },
		],
		bundles: [
			{ name: '2 Seats + 4 Sides', price: 2064, quantities: [2, 4] },
			{ name: '3 Seats + 5 Sides', price: 2853, quantities: [3, 5] },
			{ name: '4 Seats + 4 Sides', price: 3156, quantities: [4, 4] },
			{ name: '4 Seats + 5 Sides', price: 3399, quantities: [4, 5] },
			{ name: '4 Seats + 6 Sides', price: 3819, quantities: [4, 6] },
			{ name: '5 Seats + 5 Sides', price: 3945, quantities: [5, 5] },
			{ name: '5 Seats + 8 Sides', price: 4851, quantities: [5, 8] },
			{ name: '6 Seats + 5 Sides', price: 4491, quantities: [6, 5] },
			{ name: '6 Seats + 6 Sides', price: 4734, quantities: [6, 6] },
			{ name: '6 Seats + 7 Sides', price: 4977, quantities: [6, 7] },
			{ name: '6 Seats + 8 Sides', price: 5220, quantities: [6, 8] },
			{ name: '7 Seats + 8 Sides', price: 5766, quantities: [7, 8] },
			{ name: '8 Seats + 9 Sides', price: 6555, quantities: [8, 9] },
			{ name: '8 Seats + 10 Sides', price: 6798, quantities: [8, 10] },
			{ name: '9 Seats + 10 Sides', price: 7344, quantities: [9, 10] },
			{ name: '10 Seats + 12 Sides', price: 8553, quantities: [10, 12] },
		],
	},
]

export const EMPTY_SCENARIO: Scenario = { id: R.randomString(21), name: 'New Scenario', items: [], bundles: [] }
export const fmt = (n: number) => `$${n.toFixed(2)}`

export function buildAiPrompt(example: ScenarioImport): string {
	return `Generate a Bundle Buy scenario as JSON. Zod schema:

z.object({
  name: z.string().min(1),
  items: z.array(z.object({ name: z.string().min(1), symbol: z.string().min(1) })).min(1),
  bundles: z.array(z.object({ name: z.string().min(1), price: z.number().positive(), quantities: z.array(z.number().int().nonnegative()) })).min(1),
}).refine(s => s.bundles.every(b => b.quantities.length === s.items.length))

Symbols = single emoji. Prices in USD. Output ONLY valid JSON.

Example:
${JSON.stringify(example, null, 2)}

Generate a scenario for: [DESCRIBE YOUR PRODUCT/SITUATION HERE]`
}
