import { ThemeProvider } from '@trenaryja/ui'
import { createRoot } from 'react-dom/client'
import Gallery from './Gallery'

createRoot(document.getElementById('root')!).render(
	<ThemeProvider>
		<Gallery />
	</ThemeProvider>,
)
