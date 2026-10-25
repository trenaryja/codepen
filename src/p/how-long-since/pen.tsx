import { Field, Input, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

function getElapsed(from: Date, now: Date) {
	const seconds = Math.abs(now.getTime() - from.getTime()) / 1000
	const minutes = seconds / 60
	const hours = minutes / 60
	const days = hours / 24
	const weeks = days / 7
	const months = days / 30.4375
	const years = days / 365.25

	const secondsUnit = { label: 'seconds', value: seconds }
	const units = [
		{ label: 'years', value: years },
		{ label: 'months', value: months },
		{ label: 'weeks', value: weeks },
		{ label: 'days', value: days },
		{ label: 'hours', value: hours },
		{ label: 'minutes', value: minutes },
		secondsUnit,
	]

	return { units, primaryUnit: units.find((unit) => unit.value >= 1) ?? secondsUnit }
}

function formatValue(value: number) {
	if (value >= 100) return Math.floor(value).toLocaleString()
	if (value >= 10) return value.toFixed(1)
	if (value >= 1) return value.toFixed(2)
	return value.toFixed(3)
}

function Root() {
	const [targetDate, setTargetDate] = useState(() => Temporal.Now.plainDateTimeISO().toString().slice(0, 16))
	const [now, setNow] = useState(() => new Date())
	const target = new Date(targetDate)
	const isFuture = target.getTime() > now.getTime()
	const { units, primaryUnit } = getElapsed(target, now)

	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 100)
		return () => clearInterval(id)
	}, [])

	const directionLabel = isFuture ? 'until' : 'since'

	return (
		<ThemeProvider>
			<main className='full-bleed-container grid min-h-screen place-items-center content-center gap-y-10'>
				<Field label='Pick a date & time' error={Number.isNaN(target.getTime()) ? 'Invalid date' : undefined}>
					<Input type='datetime-local' value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
				</Field>

				{Number.isNaN(target.getTime()) ? null : (
					<>
						<div className='flex items-baseline gap-2'>
							<h2 className='font-mono text-5xl font-bold'> {formatValue(primaryUnit.value)} </h2>
							<p className='opacity-50'>
								{primaryUnit.label} {directionLabel}
							</p>
						</div>

						<div className='grid w-full grid-cols-2 gap-4 sm:grid-cols-3'>
							{units.map((unit) => (
								<div key={unit.label} className='surface p-4 text-center'>
									<h3 className='font-mono text-2xl font-semibold'>{formatValue(unit.value)}</h3>
									<p className='mt-1 text-xs opacity-60'>
										{unit.label} {directionLabel}
									</p>
								</div>
							))}
						</div>
					</>
				)}
			</main>
		</ThemeProvider>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(<Root />)
