// Every `react-icons` pack, as `pack/IconName`. The pack prefix is explicit because
// `fa`/`fa6`, `io`/`io5`, and `hi`/`hi2` all share a capital-letter prefix.
export type PenIcon =
	| `ai/${keyof typeof import('react-icons/ai')}`
	| `bi/${keyof typeof import('react-icons/bi')}`
	| `bs/${keyof typeof import('react-icons/bs')}`
	| `cg/${keyof typeof import('react-icons/cg')}`
	| `ci/${keyof typeof import('react-icons/ci')}`
	| `di/${keyof typeof import('react-icons/di')}`
	| `fa/${keyof typeof import('react-icons/fa')}`
	| `fa6/${keyof typeof import('react-icons/fa6')}`
	| `fc/${keyof typeof import('react-icons/fc')}`
	| `fi/${keyof typeof import('react-icons/fi')}`
	| `gi/${keyof typeof import('react-icons/gi')}`
	| `go/${keyof typeof import('react-icons/go')}`
	| `gr/${keyof typeof import('react-icons/gr')}`
	| `hi/${keyof typeof import('react-icons/hi')}`
	| `hi2/${keyof typeof import('react-icons/hi2')}`
	| `im/${keyof typeof import('react-icons/im')}`
	| `io/${keyof typeof import('react-icons/io')}`
	| `io5/${keyof typeof import('react-icons/io5')}`
	| `lia/${keyof typeof import('react-icons/lia')}`
	| `lu/${keyof typeof import('react-icons/lu')}`
	| `md/${keyof typeof import('react-icons/md')}`
	| `pi/${keyof typeof import('react-icons/pi')}`
	| `ri/${keyof typeof import('react-icons/ri')}`
	| `rx/${keyof typeof import('react-icons/rx')}`
	| `si/${keyof typeof import('react-icons/si')}`
	| `sl/${keyof typeof import('react-icons/sl')}`
	| `tb/${keyof typeof import('react-icons/tb')}`
	| `tfi/${keyof typeof import('react-icons/tfi')}`
	| `ti/${keyof typeof import('react-icons/ti')}`
	| `vsc/${keyof typeof import('react-icons/vsc')}`
	| `wi/${keyof typeof import('react-icons/wi')}`

export type PenMeta = {
	icon: PenIcon
	/** Overrides the default, which follows the reader's `prefers-color-scheme`. */
	color?: string
}
