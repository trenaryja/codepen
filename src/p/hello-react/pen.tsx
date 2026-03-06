import { ColorButton, ThemePicker, ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { useEffect, useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'

const Root = () => {
	const [time, setTime] = useState(() => new Date())

	useEffect(() => {
		const t = setInterval(() => setTime(new Date()), 1000)
		return () => clearInterval(t)
	}, [])

	return (
		<ThemeProvider>
			<main className='prose p-10 full-bleed-container content-center text-center min-w-screen min-h-screen overflow-auto gap-y-10'>
				<h1>Hello, React</h1>
				<p>{time.toLocaleTimeString()}</p>
				<div className='flex gap-1 w-full'>
					<ColorButton className='btn-block'>Hello</ColorButton>
					<ThemePicker />
				</div>
			</main>
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
