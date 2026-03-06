# codepen

Local CodePen manager. Each pen is exactly 3 files matching CodePen's panel structure — copy-paste interoperable, zero transformation needed.

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
