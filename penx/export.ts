import { note } from '@clack/prompts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fail, getPens, openInBrowser, PENS_DIR, ROOT, selectPen } from './shared.ts'

const escapeHtml = (s: string) =>
	s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export async function cmdExport(slug?: string) {
	const pens = getPens()
	if (pens.length === 0) fail('No pens found.')

	const onlyPen = pens.length === 1 ? pens[0] : undefined
	const resolvedSlug = slug ?? onlyPen ?? (await selectPen(pens, 'Which pen to export?'))
	const penDir = join(PENS_DIR, resolvedSlug)
	if (!existsSync(penDir)) fail(`Pen "${resolvedSlug}" not found.`)

	const html = readFileSync(join(penDir, 'index.html'), 'utf8')
	const css = readFileSync(join(penDir, 'style.css'), 'utf8')
	const js = readFileSync(join(penDir, 'pen.tsx'), 'utf8')

	const prefillHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Export to CodePen: ${resolvedSlug}</title></head>
<body>
<form action="https://codepen.io/pen/define" method="POST" id="f">
  <input type="hidden" name="data" value="${escapeHtml(
		JSON.stringify({ title: resolvedSlug, html, css, js, js_pre_processor: 'babel' }),
	)}" />
</form>
<script>document.getElementById('f').submit();</script>
</body>
</html>`

	const tmpFile = join(ROOT, '.codepen-export.html')
	writeFileSync(tmpFile, prefillHtml)
	openInBrowser(`file://${tmpFile}`)
	note(`Opening CodePen prefill for "${resolvedSlug}"…`, 'Export')
}
