import * as R from 'https://esm.sh/remeda'

// PokéAPI has `color` and the legendary/mythical flags; the Purukitto dump doesn't.
// Rather than ship a data file (pens are 3 files, copy-pasteable to CodePen) these are
// baked in: one char per Pokédex id indexing COLORS, plus two sparse id lists. ~1.2KB.
export const COLORS = ['black', 'blue', 'brown', 'gray', 'green', 'pink', 'purple', 'red', 'white', 'yellow'] as const

export const COLOR_CODES =
	'444777111448299222622266999911166655295566117776622999122221112223334441122299553322288666666639977775922225663351211772' +
	'654797227116219751122601991126544499911122227747611955884485941124541699711600530193696356379102277225377630011372862597' +
	'559214348744447771113328789644442221189888112428239251192135660333174999364467111972062244441180973177206433253400004181' +
	'331111153518111121371174974442221112222277111441133449998225666666226033966442550611101122661141118803531978441627830879' +
	'518628091104894447771112223366447711553330011111335332111719497374444422777477970091199443333666444188885281388885993333' +
	'381112800449881772967447728722731118813441802398644477711122777008228882288831222558811222211992711549366632222116617456' +
	'222277711100022341687992211122445566005566648833220332173958433395761186878048003366389334448381112211619722448844990004' +
	'4444122667721665555563288638896883169944141844417633494804'

export const LEGENDARY = new Set(
	'144,145,146,150,243,244,245,249,250,377,378,379,380,381,382,383,384,480,481,482,483,484,485,486,487,488,638,639,640,641,642,643,644,645,646,716,717,718,772,773,785,786,787,788,789,790,791,792,800,888,889,890,891,892,894,895,896,897,898'
		.split(',')
		.map(Number),
)

export const MYTHICAL = new Set(
	'151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,801,802,807,808,809,893'.split(',').map(Number),
)

/** Last Pokédex id of each generation, 1-indexed by position. */
export const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 898]

export const DATA_URL = 'https://cdn.jsdelivr.net/gh/Purukitto/pokemon-data.json@master/pokedex.json'

export type Mon = {
	id: number
	name: string
	thumbnail: string
	types: string[]
	color: string
	generation: number
	hp: number
	attack: number
	defense: number
	spAttack: number
	spDefense: number
	speed: number
	total: number
	height: number
	weight: number
	eggGroups: string[]
	abilities: string[]
	legendary: boolean
	mythical: boolean
	finalForm: boolean
	species: string
	description: string
}

export const LEVELS = ['very_low', 'low', 'average', 'high', 'very_high'] as const
export type Level = (typeof LEVELS)[number]

export type RangeValue = { level: Level } | { min?: number; max?: number }

export type FilterValue = boolean | string | RangeValue | string[]

export const textOf = (value: FilterValue | undefined) => (typeof value === 'string' ? value : '')
export const listOf = (value: FilterValue | undefined) => (Array.isArray(value) ? value : [])
export const rangeOf = (value: FilterValue | undefined): RangeValue =>
	typeof value === 'object' && !Array.isArray(value) ? value : {}
export const isLevel = (value: unknown): value is Level => LEVELS.some((level) => level === value)

export type Filters = Record<string, FilterValue>

export type FieldBase = { id: string; label: string; width: number; hint: string }

export type Field = FieldBase &
	(
		| { kind: 'bool'; get: (mon: Mon) => boolean }
		| { kind: 'enum'; values: readonly string[]; get: (mon: Mon) => string[] }
		| { kind: 'range'; get: (mon: Mon) => number; decimals?: number }
		| { kind: 'text'; get: (mon: Mon) => string }
	)

export const TYPES = `Bug Dark Dragon Electric Fairy Fighting Fire Flying Ghost
	Grass Ground Ice Normal Poison Psychic Rock Steel Water`.split(/\s+/)

export const EGG_GROUPS = `Amorphous,Bug,Ditto,Dragon,Fairy,Field,Flying,Grass,
	Human-Like,Mineral,Monster,Undiscovered,Water 1,Water 2,Water 3`.split(/,\s*/)

/**
 * The pack. Everything downstream — the JSON schema handed to the model, the filter panel,
 * the table columns, the executor, and the prompt's field documentation — is derived from
 * this one list. Swapping in flights or products means replacing this and the row loader.
 */
export const FIELDS: Field[] = [
	{ id: 'name', label: 'Pokémon', kind: 'text', width: 210, get: (m) => m.name, hint: 'name contains' },
	{ id: 'type', label: 'Type', kind: 'enum', values: TYPES, width: 170, get: (m) => m.types, hint: 'elemental type' },
	{ id: 'color', label: 'Color', kind: 'enum', values: COLORS, width: 100, get: (m) => [m.color], hint: 'body color' },
	{ id: 'generation', label: 'Gen', kind: 'range', width: 70, get: (m) => m.generation, hint: 'generation 1-8' },
	{ id: 'total', label: 'Total', kind: 'range', width: 80, get: (m) => m.total, hint: 'base stat total' },
	{ id: 'hp', label: 'HP', kind: 'range', width: 70, get: (m) => m.hp, hint: 'hit points, bulk' },
	{ id: 'attack', label: 'Atk', kind: 'range', width: 70, get: (m) => m.attack, hint: 'physical attack' },
	{ id: 'defense', label: 'Def', kind: 'range', width: 70, get: (m) => m.defense, hint: 'physical defense, tankiness' },
	{ id: 'spAttack', label: 'SpA', kind: 'range', width: 70, get: (m) => m.spAttack, hint: 'special attack' },
	{ id: 'spDefense', label: 'SpD', kind: 'range', width: 70, get: (m) => m.spDefense, hint: 'special defense' },
	{ id: 'speed', label: 'Spe', kind: 'range', width: 70, get: (m) => m.speed, hint: 'speed, how fast it is' },
	{
		id: 'height',
		label: 'Height',
		kind: 'range',
		width: 90,
		get: (m) => m.height,
		decimals: 1,
		hint: 'metres, tallness',
	},
	{ id: 'weight', label: 'Weight', kind: 'range', width: 90, get: (m) => m.weight, decimals: 1, hint: 'kilograms' },
	{
		id: 'eggGroup',
		label: 'Egg Groups',
		kind: 'enum',
		values: EGG_GROUPS,
		width: 170,
		get: (m) => m.eggGroups,
		hint: 'breeding egg group',
	},
	{
		id: 'ability',
		label: 'Abilities',
		kind: 'text',
		width: 180,
		get: (m) => m.abilities.join(', '),
		hint: 'ability name contains',
	},
	{ id: 'legendary', label: 'Legendary', kind: 'bool', width: 110, get: (m) => m.legendary, hint: 'is a legendary' },
	{ id: 'mythical', label: 'Mythical', kind: 'bool', width: 105, get: (m) => m.mythical, hint: 'is a mythical' },
	{
		id: 'finalForm',
		label: 'Final Form',
		kind: 'bool',
		width: 115,
		get: (m) => m.finalForm,
		hint: 'does not evolve further',
	},
	{
		id: 'species',
		label: 'Species',
		kind: 'text',
		width: 160,
		get: (m) => m.species,
		hint: 'species title, e.g. "Flame Pokémon"',
	},
	{
		id: 'description',
		label: 'Pokédex Entry',
		kind: 'text',
		width: 320,
		get: (m) => m.description,
		hint: 'full text of the Pokédex entry',
	},
]

export const FIELD_BY_ID = R.indexBy(FIELDS, (field) => field.id)

export const DEFAULT_COLUMNS = new Set(
	'name type color generation total hp attack defense spAttack spDefense speed legendary'.split(' '),
)
