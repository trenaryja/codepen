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

const { solve } = await import('./pen')

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
	return {
		medianMs: median(samples),
		minMs: Math.min(...samples),
		maxMs: Math.max(...samples),
		recipeCount,
	}
}

const pad = (s: string | number, n: number) => String(s).padStart(n)

console.log(`\nsolve  —  ${WARMUPS} warmup + ${ITERATIONS} measured iterations\n`)
console.log(`${pad('plate', 6)}  ${pad('recipes', 8)}  ${pad('median', 10)}  ${pad('min', 10)}  ${pad('max', 10)}`)
console.log(`${'-'.repeat(6)}  ${'-'.repeat(8)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}`)
for (const [W, H] of SCENARIOS) {
	const { medianMs, minMs, maxMs, recipeCount } = measureSolve(W, H)
	console.log(
		`${pad(`${W}×${H}`, 6)}  ${pad(recipeCount, 8)}  ${pad(`${medianMs.toFixed(2)} ms`, 10)}  ${pad(`${minMs.toFixed(2)} ms`, 10)}  ${pad(`${maxMs.toFixed(2)} ms`, 10)}`,
	)
}
console.log()
