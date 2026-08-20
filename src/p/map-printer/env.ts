import { createEnv } from 'https://esm.sh/@t3-oss/env-core'
import { z } from 'https://esm.sh/zod'

// Validated when the pen loads — a missing token throws here naming VITE_MAPBOX_TOKEN, rather than
// handing `undefined` to mapbox-gl and surfacing as an opaque 401 on the first tile request.
// Lives in the pen dir, not src/, on purpose: pens are separate Vite entries, so this lands only in
// map-printer's bundle and a missing token cannot take down the gallery. It also keeps
// `@t3-oss/env-core` visible to `penx check`, which only scans src/p and src/t for esm.sh imports.
export const env = createEnv({
	clientPrefix: 'VITE_',
	client: {
		VITE_MAPBOX_TOKEN: z.string().min(1),
	},
	// Vite replaces `import.meta.env` with a real object, so unlike Next this needs no per-key list.
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true, // a set-but-blank var reads as missing, not ''
})
