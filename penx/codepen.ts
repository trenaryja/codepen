import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { chromium, type Page } from 'playwright-core'
import * as R from 'remeda'
import { z } from 'zod'

const ORIGIN = 'https://codepen.io'

/** A new pen's starter files. penx can't add or rename files, so every pen it creates holds exactly these. */
export const PEN_FILE_NAMES = ['index.html', 'style.css', 'script.js'] as const

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function penCpid(url: string) {
	const cpid = /\/pen\/([\da-f-]{36})/.exec(url)?.[1]
	if (!cpid) throw new Error(`${url} is not a CodePen 2.0 pen URL (https://codepen.io/editor/<user>/pen/<id>)`)
	return cpid
}

/** CodePen's cookies in the OS keychain: the whole sign-in a run needs, 2 KB where a Chrome profile is 20–200 MB. */
const SESSION = { service: 'penx', name: 'codepen.io' }

/** Runs `fn` on `url` in a fresh Chrome carrying the saved CodePen cookies, then saves them back. */
async function withCodePen<T>(url: string, fn: (page: Page) => Promise<T>, headed = false) {
	const browser = await chromium.launch({
		channel: 'chrome',
		headless: !headed,
		ignoreDefaultArgs: ['--enable-automation'],
		args: ['--disable-blink-features=AutomationControlled'],
	})
	try {
		const context = await browser.newContext()
		const saved = await Bun.secrets.get(SESSION)
		if (saved)
			await context.addCookies(
				z
					.array(z.looseObject({ name: z.string(), value: z.string(), domain: z.string(), path: z.string() }))
					.parse(JSON.parse(saved)),
			)
		const page = await context.newPage()
		const cdp = await context.newCDPSession(page)
		const { userAgent } = await cdp.send('Browser.getVersion')
		// Cloudflare answers 403 "Just a moment..." to a user agent naming HeadlessChrome.
		await cdp.send('Emulation.setUserAgentOverride', { userAgent: userAgent.replace('HeadlessChrome', 'Chrome') })
		await page.goto(url, { waitUntil: 'domcontentloaded' })
		const result = await fn(page)
		await Bun.secrets.set({ ...SESSION, value: JSON.stringify(await context.cookies(ORIGIN)) })
		return result
	} finally {
		await browser.close()
	}
}

async function gql<T extends z.ZodType>(page: Page, schema: T, query: string, variables = {}) {
	const response = await page.evaluate(
		async (body): Promise<unknown> =>
			(await fetch('/cpe/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body })).json(),
		JSON.stringify({ query, variables }),
	)
	const { data, errors } = z
		.object({ data: z.unknown(), errors: z.array(z.object({ message: z.string() })).optional() })
		.parse(response)
	if (errors) throw new Error(`CodePen GraphQL: ${errors.map((x) => x.message).join('; ')}`)
	return schema.parse(data)
}

const signedInAs = (page: Page) =>
	gql(
		page,
		z.object({ sessionUser: z.object({ anon: z.boolean(), username: z.string() }) }),
		'{ sessionUser { anon username } }',
	).then(({ sessionUser }) => (sessionUser.anon ? undefined : sessionUser.username))

async function readPen(page: Page, cpid: string) {
	const { penByCPID: pen } = await gql(
		page,
		z.object({
			penByCPID: z.object({
				id: z.string(),
				title: z.string(),
				token: z.string(),
				// `path` is the folder (`/`, `/.codepen`); a folder entry has a null name and hash.
				penVersion: z.object({
					files: z.array(
						z.object({ name: z.string().nullable(), path: z.string(), contentHash: z.string().nullable() }),
					),
				}),
			}),
		}),
		'query($cpid: ID!) { penByCPID(cpid: $cpid) { id title token penVersion(version: Saved) { files { name path contentHash } } } }',
		{ cpid },
	).catch((error: unknown) => {
		// A deleted pen comes back as the GraphQL error "input: penByCPID record not found", not a null pen.
		if (!String(error).includes('record not found')) throw error
		throw new Error(
			`No pen ${cpid} on CodePen. If it was deleted, drop \`codepen\` from its meta.ts to push a new one.`,
		)
	})
	const hashes = pen.penVersion.files.flatMap(({ name, path, contentHash }) =>
		name && contentHash && !path.startsWith('/.codepen')
			? [[posix.join(path, name).slice(1), contentHash] as const]
			: [],
	)
	return { ...pen, hashes: R.fromEntries(hashes) }
}

/** A pen's title and saved files, keyed by path (`index.html`, `src/app.js`). */
export const fetchPen = (url: string) =>
	withCodePen(`${ORIGIN}/robots.txt`, async (page) => {
		const cpid = penCpid(url)
		const { title, token, hashes } = await readPen(page, cpid)
		const contents = await Promise.all(
			R.entries(hashes).map(async ([path, hash]) => {
				const { penFileContent } = await gql(
					page,
					z.object({ penFileContent: z.object({ content: z.string() }) }),
					'query($input: PenFileContentInput!) { penFileContent(input: $input) { content } }',
					{ input: { hash, penCPID: cpid, penToken: token } },
				)
				return [path, penFileContent.content] as const
			}),
		)
		return { title, files: R.fromEntries(contents) }
	})

/** Replaces one file's text in the editor, opening its tab first when it isn't the one shown. */
async function setFile(page: Page, name: string, text: string) {
	const selector = `cp-codemirror-editor[aria-label="${name}"]`
	const tab = page.getByRole('tab', { name, exact: true })
	// Some layouts mount every file's editor, others only the open tab's.
	await page.locator(selector).or(tab).first().waitFor()
	if (!(await page.locator(selector).count())) await tab.click()
	await page.waitForFunction(
		([sel, insert]) => {
			type EditorView = {
				state: { doc: { length: number } }
				dispatch: (transaction: { changes: { from: number; to: number; insert: string } }) => void
			}
			const view = document.querySelector<HTMLElement & { editorView?: EditorView }>(sel)?.editorView
			view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert } })
			return view
		},
		[selector, text] as const,
	)
}

/**
 * Saves `files` to the pen at `url`, or to a new public pen when `url` is absent, and titles it `title`.
 * Only files whose content differs from CodePen's are touched; returns the pen's URL and those names.
 */
export const savePen = ({
	url,
	title,
	files,
}: {
	url?: string
	title: string
	files: Record<(typeof PEN_FILE_NAMES)[number], string>
}) =>
	withCodePen(url ?? `${ORIGIN}/editor/pen`, async (page) => {
		const username = await signedInAs(page)
		if (!username) throw new Error('Not signed in to CodePen. Run `bun run penx login`, then retry.')
		const remote = url ? await readPen(page, penCpid(url)) : undefined
		const changed = PEN_FILE_NAMES.filter((name) => remote?.hashes[name] !== sha256(files[name]))

		if (changed.length > 0) {
			const showEditors = page.getByRole('button', { name: /^Show Editors & Preview/ })
			await page.locator('cp-codemirror-editor').or(showEditors).first().waitFor()
			if (await showEditors.isVisible()) await showEditors.click()
			for (const name of changed) await setFile(page, name, files[name])
			await page.getByRole('button', { name: 'Save', exact: true }).click()
			if (!url) await page.waitForURL((next) => next.pathname.startsWith(`/editor/${username}/pen/`))
		}

		const savedUrl = url ?? page.url()
		const cpid = penCpid(savedUrl)
		if (remote?.title !== title)
			await gql(
				page,
				z.object({ penUpdate: z.object({ title: z.string() }) }),
				'mutation($input: PenUpdateInput!) { penUpdate(input: $input) { title } }',
				{ input: { id: (remote ?? (await readPen(page, cpid))).id, title } },
			)

		for (let attempt = 0; ; attempt++) {
			const { hashes } = await readPen(page, cpid)
			const stale = PEN_FILE_NAMES.filter((name) => hashes[name] !== sha256(files[name]))
			if (stale.length === 0) return { url: savedUrl, changed }
			if (attempt === 20) throw new Error(`CodePen didn't save ${stale.join(', ')} to ${savedUrl}`)
			await Bun.sleep(500)
		}
	})

/** Opens a Chrome window on CodePen's sign-in page; resolves with the username once signed in. */
export const login = () =>
	withCodePen(
		`${ORIGIN}/login`,
		async (page) => {
			while (!page.isClosed()) {
				const username = await signedInAs(page).catch(() => undefined)
				if (username) return username
				await Bun.sleep(2000)
			}
			throw new Error('The CodePen window closed before sign-in finished.')
		},
		true,
	)
