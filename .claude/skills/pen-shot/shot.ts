#!/usr/bin/env bun
// Run with `bun --install=fallback` so Playwright resolves without entering package.json.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const slug = args[0]
if (!slug || slug.startsWith('--')) {
	console.error(
		'usage: shot.ts <slug> [--selector css] [--clip x,y,w,h] [--eval expr] [--out path] [--scale n] [--wait ms] [--light] [--width px] [--height px]',
	)
	process.exit(1)
}

const flag = (name: string) => {
	const index = args.indexOf(`--${name}`)
	return index === -1 ? undefined : args[index + 1]
}

const selector = flag('selector')
const clip = flag('clip')?.split(',').map(Number)
const expression = flag('eval')
const out = flag('out') ?? `${process.env.TMPDIR ?? '/tmp'}/${slug}.png`
const scale = Number(flag('scale') ?? (clip ? 3 : 2))
const wait = Number(flag('wait') ?? 1200)

if (clip && !selector) {
	console.error('--clip needs --selector: coordinates are relative to that element')
	process.exit(1)
}

// Vite takes the next free port when 5173 is busy, so find the one actually serving this pen.
const findPort = async () => {
	for (let port = 5173; port < 5183; port++) {
		const response = await fetch(`http://localhost:${port}/p/${slug}/`, {
			signal: AbortSignal.timeout(500),
		}).catch(() => undefined)
		if (response?.ok) return port
	}
	console.error(`no dev server serving /p/${slug}/ on ports 5173-5182 — is \`bun dev\` running?`)
	process.exit(1)
}
const port = await findPort()

const browser = await chromium.launch({ channel: 'chrome' }) // Playwright's pinned chromium build is not in the local cache
const page = await browser.newPage({
	viewport: { width: Number(flag('width') ?? 1280), height: Number(flag('height') ?? 1000) },
	isMobile: Number(flag('width') ?? 1280) < 640, // touch + no hover, so hover-only affordances stay hidden
	deviceScaleFactor: scale,
	colorScheme: args.includes('--light') ? 'light' : 'dark',
})

const errors: string[] = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))

await page.goto(`http://localhost:${port}/p/${slug}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(wait) // webfonts swap after networkidle; shooting earlier catches fallback metrics

// states behind a press — an expanded panel, another tab — are only reachable by clicking into them first
for (const target of args.flatMap((arg, index) => (arg === '--click' ? [args[index + 1]] : []))) {
	await page.locator(target).first().click()
	await page.waitForTimeout(400)
}

if (expression) {
	console.log(JSON.stringify(await page.evaluate(expression), null, 2))
} else {
	mkdirSync(dirname(resolve(out)), { recursive: true })
	if (clip) {
		// Clip coordinates are in the element's own space — its SVG viewBox if it has one, else CSS px.
		const element = page.locator(selector!)
		const box = (await element.boundingBox())!
		const viewBox = await element.getAttribute('viewBox')
		const unit = viewBox ? box.width / Number(viewBox.split(/[\s,]+/)[2]) : 1
		const [x, y, width, height] = clip
		await page.screenshot({
			path: out,
			clip: { x: box.x + x * unit, y: box.y + y * unit, width: width * unit, height: height * unit },
		})
	} else {
		await (selector ? page.locator(selector) : page).screenshot({ path: out })
	}
	console.log(`wrote ${out}`)
}

console.log(`console errors: ${errors.length ? `\n  ${errors.join('\n  ')}` : 'none'}`)
await browser.close()
