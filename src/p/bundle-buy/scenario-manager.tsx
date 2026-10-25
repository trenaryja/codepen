import { useClipboard } from 'https://esm.sh/@mantine/hooks'
import { Button } from 'https://esm.sh/@trenaryja/ui'
import React from 'https://esm.sh/react'
import { LuCopy, LuPlus, LuRotateCcw, LuSparkles, LuX } from 'https://esm.sh/react-icons/lu'
import { buildAiPrompt } from './scenarios'
import { dehydrate } from './solver'
import type { Scenario } from './types'

export function AiPromptButton({ scenario }: { scenario: Scenario }) {
	const clipboard = useClipboard({ timeout: 2000 })
	const prompt = buildAiPrompt(dehydrate(scenario))

	return (
		<Button
			className={`btn-sm gap-1 ${clipboard.copied ? 'btn-success' : 'btn-ghost'}`}
			onClick={() => clipboard.copy(prompt)}
			title='Copy AI prompt to clipboard'
		>
			<LuSparkles size={14} /> {clipboard.copied ? 'Copied!' : 'AI Prompt'}
		</Button>
	)
}

export function ScenarioManager({
	scenarios,
	activeId,
	activeScenario,
	onSelect,
	onDelete,
	onNew,
	onDuplicate,
	onRestoreDefaults,
}: {
	scenarios: Scenario[]
	activeId: string
	activeScenario: Scenario
	onSelect: (id: string) => void
	onDelete: (id: string) => void
	onNew: () => void
	onDuplicate: () => void
	onRestoreDefaults: () => void
}) {
	return (
		<div className='flex flex-wrap items-center gap-2'>
			{scenarios.map((s) => (
				<div key={s.id} className='flex items-center gap-1'>
					<Button className={`btn-sm ${s.id === activeId ? 'btn-active' : 'btn-ghost'}`} onClick={() => onSelect(s.id)}>
						{s.name}
					</Button>
					{scenarios.length > 1 && s.id === activeId && (
						<Button className='btn-ghost btn-xs btn-square' onClick={() => onDelete(s.id)} title='Delete scenario'>
							<LuX size={12} />
						</Button>
					)}
				</div>
			))}
			<Button className='btn-ghost btn-sm gap-1' onClick={onNew}>
				<LuPlus size={14} /> New
			</Button>
			<Button className='btn-ghost btn-sm gap-1' onClick={onDuplicate}>
				<LuCopy size={14} /> Duplicate
			</Button>
			<Button className='btn-ghost btn-sm gap-1' onClick={onRestoreDefaults}>
				<LuRotateCcw size={14} /> Restore Defaults
			</Button>
			<AiPromptButton scenario={activeScenario} />
		</div>
	)
}
