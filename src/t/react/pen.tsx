import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import { createRoot } from 'https://esm.sh/react-dom/client'

const Root = () => (
	<ThemeProvider>
		<main className='p-8'>
			<h1 className='text-2xl font-bold'>Hello from React</h1>
		</main>
	</ThemeProvider>
)

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
