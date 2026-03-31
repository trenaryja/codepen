import { Field, Input, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

type TimeUnit = {
	label: string
	value: number
}

function getElapsed(from: Date, now: Date): TimeUnit[] {
	const ms = now.getTime() - from.getTime()
	const absMs = Math.abs(ms)
	const seconds = absMs / 1000
	const minutes = seconds / 60
	const hours = minutes / 60
	const days = hours / 24
	const weeks = days / 7
	const months = days / 30.4375
	const years = days / 365.25

	return [
		{ label: 'years', value: years },
		{ label: 'months', value: months },
		{ label: 'weeks', value: weeks },
		{ label: 'days', value: days },
		{ label: 'hours', value: hours },
		{ label: 'minutes', value: minutes },
		{ label: 'seconds', value: seconds },
	]
}

function formatValue(value: number): string {
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
	const elapsed = getElapsed(target, now)

	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 100)
		return () => clearInterval(id)
	}, [])

	const primaryUnit = elapsed.find((u) => u.value >= 1) ?? elapsed[elapsed.length - 1]
	const directionLabel = isFuture ? 'until' : 'since'

	return (
		<ThemeProvider>
			<main className='min-h-screen full-bleed-container grid place-items-center content-center gap-y-10'>
				<Field label='Pick a date & time' error={Number.isNaN(target.getTime()) ? 'Invalid date' : undefined}>
					<Input type='datetime-local' value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
				</Field>

				{Number.isNaN(target.getTime()) ? null : (
					<>
						<div className='flex gap-2 items-baseline'>
							<h2 className='text-5xl font-bold font-mono'> {formatValue(primaryUnit.value)} </h2>
							<p className='opacity-50'>
								{primaryUnit.label} {directionLabel}
							</p>
						</div>

						<div className='grid grid-cols-2 sm:grid-cols-3 gap-4 w-full'>
							{elapsed.map((unit) => (
								<div key={unit.label} className='surface p-4 text-center'>
									<h3 className='text-2xl font-semibold font-mono'>{formatValue(unit.value)}</h3>
									<p className='text-xs opacity-60 mt-1'>
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

createRoot(document.getElementById('root')!).render(<Root />)
