/** A pen's full page: its `index.html` fragment as the body, followed by its module script. */
export const penDocument = ({
	title,
	head,
	fragment,
	script,
}: Record<'fragment' | 'head' | 'script' | 'title', string>) =>
	`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
${head}
</head>
<body>
${fragment}
  <script type="module" src="${script}"></script>
</body>
</html>`

/** The fragment `penDocument` wrapped, or `undefined` when `html` isn't a page it built with these settings. */
export function penFragment(html: string, shell: Omit<Parameters<typeof penDocument>[0], 'fragment'>) {
	const marker = '\0'
	const [before = '', after = ''] = penDocument({ ...shell, fragment: marker }).split(marker)
	return html.startsWith(before) && html.endsWith(after)
		? html.slice(before.length, html.length - after.length)
		: undefined
}
