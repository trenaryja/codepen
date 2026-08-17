declare module 'virtual:pen-icons' {
	import type { IconType } from 'react-icons/lib'

	/** Keyed by pen slug, generated from each pen's `meta.ts` by the `pen` plugin in vite.config.ts. */
	export const penIcons: Record<string, IconType | undefined>
}
