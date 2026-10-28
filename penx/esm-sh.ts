/** Drops the version pin, keeping any subpath: `name@<version>/sub` → `name/sub`, scoped names too. */
export const esmShToNpm = (url: string) =>
	url
		.slice('https://esm.sh/'.length)
		.replace(/\?.*$/, '')
		.replace(/^((?:@[^/]+\/)?[^/@]+)@[^/]+/, '$1')

export const npmPkgRoot = (npmSpec: string) =>
	npmSpec
		.split('/')
		.slice(0, npmSpec.startsWith('@') ? 2 : 1)
		.join('/')
