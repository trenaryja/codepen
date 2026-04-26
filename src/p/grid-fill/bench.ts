// Ephemeral developer bench for grid-fill.
// Runs: `bun run src/p/grid-fill/bench.ts`
// No framework, no assertions — numbers inform decisions, they don't gate anything.

import { plugin } from 'bun'

// pen.tsx imports from `https://esm.sh/*` for CodePen paste-ability.
// Mirror what vite.config.ts does at build time: rewrite those URLs to the
// matching npm spec at load time so Bun's default resolver finds them in
// node_modules. Bun resolves URL imports natively before plugin `onResolve`
// fires, so we hook `onLoad` and transform the source instead.
plugin({
	name: 'esm-sh-rewrite',
	setup(build) {
		build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
			const src = await Bun.file(args.path).text()
			if (!src.includes('https://esm.sh/')) return
			const rewritten = src.replace(/https:\/\/esm\.sh\/([^'"]+)/g, (_m, spec: string) => {
				const [head, ...rest] = spec.split('/')
				return spec.startsWith('@')
					? [head, rest[0].replace(/@.*$/, ''), ...rest.slice(1)].join('/')
					: [head.replace(/@.*$/, ''), ...rest].join('/')
			})
			return { contents: rewritten, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' }
		})
	},
})

const { solve, encodeRecipe, decodeRecipe, strToBits, encodeIntegers, decodeIntegers, BASE94, BASE64URL, BASE62 } =
	await import('./pen')

// ── Bench harness ────────────────────────────────────────────────────────────

const WARMUPS = 3
const ITERATIONS = 10
const SCENARIOS: [number, number][] = [
	[4, 4],
	[5, 5],
	[5, 6],
	[6, 5],
	[6, 6],
]

const median = (xs: number[]) => {
	const sorted = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const pad = (s: string | number, n: number) => String(s).padStart(n)

// Pre-solve all scenarios — encode/decode benches should not include solve time
const solved = SCENARIOS.map(([W, H]) => ({ W, H, recipes: solve({ W, H }) }))

// ── Solve bench ──────────────────────────────────────────────────────────────

const measureSolve = (W: number, H: number) => {
	for (let i = 0; i < WARMUPS; i++) solve({ W, H })
	const samples: number[] = []
	let recipeCount = 0
	for (let i = 0; i < ITERATIONS; i++) {
		const t0 = performance.now()
		const recipes = solve({ W, H })
		samples.push(performance.now() - t0)
		recipeCount = recipes.length
	}
	return { medianMs: median(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples), recipeCount }
}

console.log(`\nsolve  —  ${WARMUPS} warmup + ${ITERATIONS} measured iterations\n`)
console.log(`${pad('plate', 6)}  ${pad('recipes', 8)}  ${pad('median', 10)}  ${pad('min', 10)}  ${pad('max', 10)}`)
console.log(`${'-'.repeat(6)}  ${'-'.repeat(8)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`)
for (const [W, H] of SCENARIOS) {
	const { medianMs, minMs, maxMs, recipeCount } = measureSolve(W, H)
	console.log(
		`${pad(`${W}×${H}`, 6)}  ${pad(recipeCount, 8)}  ${pad(`${medianMs.toFixed(2)} ms`, 10)}  ${pad(`${minMs.toFixed(2)} ms`, 10)}  ${pad(`${maxMs.toFixed(2)} ms`, 10)}`,
	)
}

// ── Encode bench ─────────────────────────────────────────────────────────────

const measureEncode = ({ W, H, recipes }: (typeof solved)[0]) => {
	for (let i = 0; i < WARMUPS; i++) for (const r of recipes) encodeRecipe(r.counts, W, H)

	const samples: number[] = []
	for (let i = 0; i < ITERATIONS; i++) {
		const t0 = performance.now()
		for (const r of recipes) encodeRecipe(r.counts, W, H)
		samples.push(performance.now() - t0)
	}

	const keys = recipes.map((r) => encodeRecipe(r.counts, W, H))
	const lengths = keys.map((k) => k.length).sort((a, b) => a - b)
	const medianLen = lengths[Math.floor(lengths.length / 2)]

	return {
		medianMs: median(samples),
		minMs: Math.min(...samples),
		maxMs: Math.max(...samples),
		usPerRecipe: (median(samples) * 1000) / recipes.length,
		minChars: lengths[0],
		medianChars: medianLen,
		maxChars: lengths[lengths.length - 1],
	}
}

console.log(`\nencode  —  ${WARMUPS} warmup + ${ITERATIONS} measured iterations\n`)
console.log(
	`${pad('plate', 6)}  ${pad('recipes', 8)}  ${pad('median', 10)}  ${pad('min', 10)}  ${pad('max', 10)}  ${pad('µs/recipe', 9)}  ${pad('chars', 12)}`,
)
console.log(
	`${'-'.repeat(6)}  ${'-'.repeat(8)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ${'-'.repeat(9)}  ${'-'.repeat(12)}`,
)
for (const scenario of solved) {
	const { medianMs, minMs, maxMs, usPerRecipe, minChars, medianChars, maxChars } = measureEncode(scenario)
	console.log(
		`${pad(`${scenario.W}×${scenario.H}`, 6)}  ${pad(scenario.recipes.length, 8)}  ${pad(`${medianMs.toFixed(2)} ms`, 10)}  ${pad(`${minMs.toFixed(2)} ms`, 10)}  ${pad(`${maxMs.toFixed(2)} ms`, 10)}  ${pad(`${usPerRecipe.toFixed(2)} µs`, 9)}  ${pad(`${minChars}–${medianChars}–${maxChars}`, 12)}`,
	)
}

// ── Decode bench ─────────────────────────────────────────────────────────────

const measureDecode = ({ W, H, recipes }: (typeof solved)[0]) => {
	const keys = recipes.map((r) => encodeRecipe(r.counts, W, H))

	for (let i = 0; i < WARMUPS; i++) for (const key of keys) decodeRecipe(key)

	const samples: number[] = []
	for (let i = 0; i < ITERATIONS; i++) {
		const t0 = performance.now()
		for (const key of keys) decodeRecipe(key)
		samples.push(performance.now() - t0)
	}

	return {
		medianMs: median(samples),
		minMs: Math.min(...samples),
		maxMs: Math.max(...samples),
		usPerRecipe: (median(samples) * 1000) / recipes.length,
	}
}

console.log(`\ndecode  —  ${WARMUPS} warmup + ${ITERATIONS} measured iterations\n`)
console.log(
	`${pad('plate', 6)}  ${pad('recipes', 8)}  ${pad('median', 10)}  ${pad('min', 10)}  ${pad('max', 10)}  ${pad('µs/recipe', 9)}`,
)
console.log(
	`${'-'.repeat(6)}  ${'-'.repeat(8)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ${'-'.repeat(9)}`,
)
for (const scenario of solved) {
	const { medianMs, minMs, maxMs, usPerRecipe } = measureDecode(scenario)
	console.log(
		`${pad(`${scenario.W}×${scenario.H}`, 6)}  ${pad(scenario.recipes.length, 8)}  ${pad(`${medianMs.toFixed(2)} ms`, 10)}  ${pad(`${minMs.toFixed(2)} ms`, 10)}  ${pad(`${maxMs.toFixed(2)} ms`, 10)}  ${pad(`${usPerRecipe.toFixed(2)} µs`, 9)}`,
	)
}

// ── Correctness ───────────────────────────────────────────────────────────────

const { W: cW, H: cH, recipes: cRecipes } = solved[0]
let correct = 0
for (const r of cRecipes) {
	const { W, H, counts } = decodeRecipe(encodeRecipe(r.counts, cW, cH))
	const ok =
		W === cW &&
		H === cH &&
		Object.keys(r.counts).length === Object.keys(counts).length &&
		Object.entries(r.counts).every(([k, v]) => counts[k] === v)
	if (ok) correct++
}
const checkmark = correct === cRecipes.length ? '✓' : '✗'
console.log(`\ncorrectness (${cW}×${cH}): ${correct}/${cRecipes.length} round-trip ${checkmark}`)

// ── Sample keys ───────────────────────────────────────────────────────────────

console.log(`\nsample keys (${cW}×${cH}, first 5 recipes):`)
console.log(`  ${'readable key'.padEnd(30)}  ${'compact key'.padEnd(10)}  bits`)
console.log(`  ${'-'.repeat(30)}  ${'-'.repeat(10)}  ----`)
for (const r of cRecipes.slice(0, 5)) {
	const key = encodeRecipe(r.counts, cW, cH)
	const bits = strToBits(key, BASE62).length
	console.log(`  ${r.key.padEnd(30)}  ${key.padEnd(10)}  ${bits}`)
}

// ── Alphabet comparison ───────────────────────────────────────────────────────
// Decode the integer sequence from the base-94 key, then re-encode with each
// alphabet — same bits, different symbol set.

const ALPHABETS = [
	{ label: 'base-62 (current)', alphabet: BASE62 },
	{ label: 'base-64url       ', alphabet: BASE64URL },
	{ label: 'base-94          ', alphabet: BASE94 },
]

console.log(`\nalphabet comparison — key length distribution across all grids\n`)
console.log(
	`  ${'alphabet'.padEnd(20)}  ${'grid'.padEnd(5)}  ${'recipes'.padStart(7)}  ${'min'.padStart(4)}  ${'p50'.padStart(4)}  ${'p90'.padStart(4)}  ${'max'.padStart(4)}`,
)
console.log(
	`  ${'-'.repeat(20)}  ${'-'.repeat(5)}  ${'-'.repeat(7)}  ${'-'.repeat(4)}  ${'-'.repeat(4)}  ${'-'.repeat(4)}  ${'-'.repeat(4)}`,
)

for (const { label, alphabet } of ALPHABETS) {
	for (const { W, H, recipes } of solved) {
		const lengths = recipes
			.map((r) => encodeIntegers(decodeIntegers(encodeRecipe(r.counts, W, H), BASE62), alphabet).length)
			.sort((a, b) => a - b)
		const p50 = lengths[Math.floor(lengths.length * 0.5)]
		const p90 = lengths[Math.floor(lengths.length * 0.9)]
		console.log(
			`  ${label}  ${`${W}×${H}`.padEnd(5)}  ${lengths.length.toString().padStart(7)}  ${lengths[0].toString().padStart(4)}  ${p50.toString().padStart(4)}  ${p90.toString().padStart(4)}  ${lengths[lengths.length - 1].toString().padStart(4)}`,
		)
	}
	console.log()
}
console.log()
