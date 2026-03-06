declare module 'https://esm.sh/@trenaryja/ui' {
	export * from '@trenaryja/ui'
}

declare module 'https://esm.sh/d3-selection' {
	export * from 'd3-selection'
}

declare module 'https://esm.sh/qrcode' {
	export * from 'qrcode'
}

declare module 'https://esm.sh/react' {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	import React = require('react')

	export = React
}

declare module 'https://esm.sh/react-dom/client' {
	export * from 'react-dom/client'
}

declare module 'https://esm.sh/*'
