import { METRIC_GROUPS } from './glossary-metrics'
import type { Term } from './glossary-types'
import { TYPOGRAPHY_GROUPS } from './glossary-typography'
import type { Specimen } from './layout'
import { computeLayout, multiLayout } from './layout'

export const GROUPS = [...METRIC_GROUPS, ...TYPOGRAPHY_GROUPS]

export function findTerm(id: string) {
	for (const group of GROUPS) for (const term of group.terms) if (term.id === id) return term
	return null
}

export function renderTerm(term: Term, specimen: Specimen) {
	const request = { ...specimen, sample: term.sample, fontSize: term.fontSize }

	if (term.multiLine) {
		const [firstLine, secondLine] = multiLayout(request)
		return term.draw(firstLine, secondLine)
	}

	const layout = computeLayout(request)
	if (term.id === 'tracking') return term.draw({ ...layout, trackingEm: specimen.trackingEm })
	if (term.id === 'textboxtrim') return term.draw({ ...layout, textBoxTrim: specimen.textBoxTrim })
	return term.draw(layout)
}
