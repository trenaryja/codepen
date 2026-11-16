# codepen

My own sandbox — a self-hosted gallery of single-page apps at [codepen.trenary.dev](https://codepen.trenary.dev). Inspired by CodePen, but each pen runs as its own Vite page, unframed and unsandboxed.

## Why self-hosted

- **Full browser APIs** — history, URL state (nuqs works), clipboard, WebGL, Workers, etc. No iframe restrictions.
- **Shareable URLs** — any pen link just works for anyone, no login or auth tokens required.
- **IDE + tooling** — real TypeScript, linting, formatting, type safety, syntax highlighting, hot reload, git history, etc.

Each pen maps onto a CodePen 2.0 pen's `index.html`, `style.css` and `script.js`: `penx push` wraps the fragment in a full page and compiles `pen.tsx` unless it's plain JS, and `penx pull` reverses it. A `meta.ts` sidecar holds what CodePen has no file for, the pen's CodePen link included; it never ships to the browser.

## Structure

```
src/
├── p/{slug}/        # a pen
│   ├── index.html   # body fragment
│   ├── style.css
│   ├── pen.tsx      # ESM URL imports
│   └── meta.ts      # favicon icon (any `react-icons` name, type-checked) + CodePen link
└── t/{name}/        # templates `penx new` copies
```

Pens use `https://esm.sh/` imports directly, so they run on CodePen unchanged.

## Commands

```bash
bun run dev              # Gallery at localhost:5173/
bun run penx new         # Create a new pen
bun run penx list        # List all pens
bun run penx dev [slug]  # Start dev + open pen
bun run penx login       # Sign in to CodePen once, in Google Chrome; the session lives in the OS keychain
bun run penx push [slug] # Publish to CodePen: creates the pen, then updates it
bun run penx pull [slug] # Pull CodePen edits back; --url <pen> pulls any pen
bun run penx check       # Audit esm.sh imports against package.json and esm-sh.d.ts; --fix repairs
```

## Pen URLs

- Gallery: `http://localhost:5173/`
- Pen: `http://localhost:5173/p/{slug}/`
- Template preview: `http://localhost:5173/t/{name}/`
