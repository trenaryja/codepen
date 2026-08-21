import { defineConfig } from '@trenaryja/config/eslint'

export default [
	...defineConfig(),
	{
		// The React Compiler runs over the whole build (vite.config.ts), so it owns memoization.
		// Telling eslint-react that switches off the rules that would otherwise demand a manual
		// useMemo/useCallback this repo bans — no-unstable-context-value and no-unstable-default-props.
		// Belongs in `@trenaryja/config` alongside the compiler mandate, not here.
		settings: { 'react-x': { compilationMode: 'all' } },
	},
	{
		// Ambient declaration files describe shapes, they don't run. Import-assignment
		// (`import X = require('x')`) is the only syntax that re-exports an `export =`
		// module from inside a `declare module`, so the ESM-only rule can't apply here.
		files: ['**/*.d.ts'],
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
	{
		// Bitwise, `++`, and sequential awaits are core to the pens' codec and animation
		// code. These three are already off upstream; drop this block once
		// `@trenaryja/config` publishes past 0.0.1.
		files: ['src/p/**', 'src/t/**'],
		rules: { 'no-await-in-loop': 'off', 'no-bitwise': 'off', 'no-plusplus': 'off' },
	},
]
