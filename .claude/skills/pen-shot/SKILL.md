---
name: pen-shot
description: Shoot or measure a running pen to verify a visual change. Use when checking how a pen renders, comparing it across fonts/themes/states, or answering a question about element position or size.
---

A pen raises two kinds of question, and only one is answered by looking.

**Shoot** when the question is about composition — colour, spacing, whether it reads as finished. The image is the answer.

**Measure** when the question has a number in it — position, size, count, overlap. Read values out of the page instead. Anti-aliased edges misreport in an image and point at the wrong element: char-metrics lost hours to a clip path that one measurement cleared.

When both would answer, measure first.

## Running

`bun dev` must be up; the script finds its port. New pens serve straight from disk, so scaffolding one never needs a restart.

```sh
bun --install=fallback .claude/skills/pen-shot/shot.ts <slug> [flags]
```

`--install=fallback` resolves Playwright without adding it to `package.json`.

| Flag | Effect |
| ---- | ------ |
| `--selector <css>` | Shoot one element instead of the whole page |
| `--clip x,y,w,h` | Crop inside `--selector`, in its viewBox units when it has one, else CSS px. Scale defaults to 3 |
| `--eval <expr>` | Measure — run the expression in page context, print the result as JSON |
| `--out <path>` | Default `$TMPDIR/<slug>.png` |
| `--scale <n>` | deviceScaleFactor, default 2 |
| `--width <px>` / `--height <px>` | Viewport, default 1280×1000. Under 640 wide also switches the page to touch/no-hover |
| `--click <selector>` | Press before shooting, to reach a state behind an interaction. Repeatable, applied in order |
| `--wait <ms>` | Delay after networkidle, default 1200 so webfonts have swapped |
| `--light` | Light colour scheme; default is dark |

Read every image you write. An unopened screenshot is not evidence.

## Measuring

```sh
# where is it, how big
--eval "document.querySelector('#hero').getBoundingClientRect().toJSON()"

# did the highlight land on the glyph you meant
--eval "[...document.querySelectorAll('svg text')].map((t) => ({ char: t.textContent, x: t.getBBox().x, fill: getComputedStyle(t).fill }))"
```

For SVG, `getBBox()` returns user-space coordinates matching the source and `getBoundingClientRect()` returns CSS px. Mixing the two is the usual cause of a result that looks off by a constant factor.

To check whether a clip or mask covers what you intended, render its rect with a visible stroke and shoot that. Reading the geometry beats inferring it from which pixels survived.

## Coverage

One run proves one variant. Shoot every font, theme, and state the change can reach before calling it verified — char-metrics' defects were font-specific, and a highlight that was correct in sans covered half the glyph in mono.
