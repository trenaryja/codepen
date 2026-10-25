import type { ReactNode } from 'https://esm.sh/react'
import type { Layout } from './layout'

export type Term = {
	id: string
	name: string
	sample: string
	fontSize: number
	multiLine?: boolean
	definition: string
	draw: (layout: Layout, secondLine?: Layout) => ReactNode
}

export type Group = {
	name: string
	terms: Term[]
}
