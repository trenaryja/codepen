# codepen

My own sandbox — a self-hosted gallery of single-page apps at [codepen.trenary.dev](https://codepen.trenary.dev). Inspired by CodePen, but running as a real Vite app with no iframes and no sandboxing.

## Why self-hosted

- **Full browser APIs** — history, URL state (nuqs works), clipboard, WebGL, Workers, etc. No iframe restrictions.
- **Shareable URLs** — any pen link just works for anyone, no login or auth tokens required.
- **IDE + tooling** — real TypeScript, linting, formatting, type safety, syntax highlighting, hot reload, git history, etc.

Each pen is exactly 3 files matching CodePen's panel structure — copy-paste interoperable, zero transformation needed.

## Structure

```
p/{slug}/
├── index.html   # HTML panel (body fragment)
├── style.css    # CSS panel
└── pen.tsx      # JS panel (ESM URL imports)
```

Pens use `https://esm.sh/` imports directly — identical to CodePen's JS panel.

## Commands

```bash
bun run dev              # Gallery at localhost:5173/
bun run penx new         # Create a new pen
bun run penx list        # List all pens
bun run penx dev [slug]  # Start dev + open pen
bun run penx export      # Export to CodePen (Prefill API)
bun run penx import      # Import from paste / ZIP / URL
```

## Pen URLs

- Gallery: `http://localhost:5173/`
- Pen: `http://localhost:5173/p/{slug}/`
- Template preview: `http://localhost:5173/t/{name}/`
