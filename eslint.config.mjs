import { defineConfig } from '@trenaryja/config/eslint'

export default [
	...defineConfig(),
	// Agent skill scripts import outside package.json (bun --install=fallback) and sit outside the tsconfig
	{ ignores: ['.claude/**'] },
	{
		// Pens must keep `import React from 'react'` as an unused *value* import —
		// CodePen has no automatic JSX transform, so the import must survive verbatim.
		files: ['src/p/**/pen.tsx', 'src/t/**/pen.tsx'],
		rules: {
			'unused-imports/no-unused-imports': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/consistent-type-imports': 'off',
		},
	},
	{
		// Pens are single-file-by-design apps (CodePen portability), so size caps
		// fight the format; the bitwise/plusplus/await-in-loop styles are core to
		// their codec and animation code. Correctness rules stay on.
		files: ['src/p/**', 'src/t/**'],
		rules: {
			complexity: 'off',
			'max-depth': 'off',
			'max-lines-per-function': 'off',
			'max-params': 'off',
			'max-statements': 'off',
			'no-await-in-loop': 'off',
			'no-bitwise': 'off',
			'no-plusplus': 'off',
		},
	},
]
