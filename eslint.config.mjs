import { defineConfig } from '@fullstacksjs/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
const config = [
	...defineConfig({
		files: ['**/*.ts', '**/*.tsx'],
		rules: {
			'perfectionist/sort-imports': 'off', // handled by vscode organize imports
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
		},
	}),
]

export default config
