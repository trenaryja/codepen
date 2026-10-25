import { ColorButton, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useEffect, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

const Root = () => {
	const [time, setTime] = useState(() => new Date())

	useEffect(() => {
		const id = setInterval(() => setTime(new Date()), 1000)
		return () => clearInterval(id)
	}, [])

	return (
		<ThemeProvider>
			<main className='prose full-bleed-container min-h-screen min-w-screen content-center gap-y-10 overflow-auto p-10 text-center'>
				<h1>Hello, React</h1>
				<p>{time.toLocaleTimeString()}</p>
				<div className='flex w-full gap-1'>
					<ColorButton className='btn-block'>Hello</ColorButton>
					<ThemePicker />
				</div>
			</main>
		</ThemeProvider>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(<Root />)
