import { faker } from 'https://esm.sh/@faker-js/faker'
import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import {
	Button,
	Field,
	Fieldset,
	Input,
	ThemePicker,
	ThemeProvider,
	Toaster,
	Toggle,
	toast,
} from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuKeyRound, LuPlus, LuShieldCheck, LuShuffle, LuTrash2, LuUserX, LuX } from 'https://esm.sh/react-icons/lu'

// ─── Constants ────────────────────────────────────────────────

const PERMISSIONS = [
	'programs:view',
	'programs:edit',
	'solicitations:view',
	'solicitations:edit',
	'projects:view',
	'projects:edit',
] as const
type Permission = (typeof PERMISSIONS)[number]

const PERM_GROUPS = [
	{ asset: 'Programs', perms: ['programs:view', 'programs:edit'] as Permission[] },
	{ asset: 'Solicitations', perms: ['solicitations:view', 'solicitations:edit'] as Permission[] },
	{ asset: 'Projects', perms: ['projects:view', 'projects:edit'] as Permission[] },
]

const ORG_NAMES = ['Coal', 'Oil & Gas', 'Solar', 'Wind', 'Nuclear'] as const

// ─── Types ────────────────────────────────────────────────────

type OldRoleDef = { name: string; baseRole: string; permissions: Permission[]; orgs: string[] }
type NewRoleDef = { name: string; permissions: Permission[] }
type OrgRole = { org: string; roles: string[] }
type UserData = {
	id: string
	firstName: string
	lastName: string
	email: string
	avatar: string
	isSystemAdmin: boolean
	active: boolean
	orgRoles: OrgRole[]
}

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULT_NEW_ROLES: NewRoleDef[] = [
	{ name: 'Admin', permissions: [...PERMISSIONS] },
	{
		name: 'Power User',
		permissions: ['programs:view', 'solicitations:view', 'solicitations:edit', 'projects:view', 'projects:edit'],
	},
	{ name: 'Project Manager', permissions: ['programs:view', 'solicitations:view', 'projects:view', 'projects:edit'] },
	{
		name: 'Solicitation Manager',
		permissions: ['programs:view', 'solicitations:view', 'solicitations:edit', 'projects:view'],
	},
	{ name: 'Basic User', permissions: ['programs:view', 'solicitations:view', 'projects:view'] },
]

const DEFAULT_OLD_ROLES: OldRoleDef[] = DEFAULT_NEW_ROLES.flatMap((r) =>
	ORG_NAMES.map((org) => ({
		name: `${org} ${r.name}`,
		baseRole: r.name,
		permissions: [...r.permissions],
		orgs: [org],
	})),
)

// ─── Generation ───────────────────────────────────────────────

const pick = <T,>(arr: readonly T[], min = 1, max = arr.length) =>
	faker.helpers.arrayElements([...arr], faker.number.int({ min, max: Math.min(max, arr.length) }))

const genOrgRoles = (roleNames: string[]): OrgRole[] =>
	pick(ORG_NAMES, 1, 4).map((org) => ({ org, roles: pick(roleNames, 1, 2) }))

const genUser = (roleNames: string[]): UserData => ({
	id: faker.string.uuid(),
	firstName: faker.person.firstName(),
	lastName: faker.person.lastName(),
	email: faker.internet.email().toLowerCase(),
	avatar: faker.image.avatar(),
	isSystemAdmin: faker.datatype.boolean({ probability: 0.1 }),
	active: true,
	orgRoles: genOrgRoles(roleNames),
})

const genAll = (roleNames: string[], n = 10) => Array.from({ length: n }, () => genUser(roleNames))

const fullName = (u: UserData) => `${u.firstName} ${u.lastName}`

// ─── Old model helpers ───────────────────────────────────────

const getUserActiveOldRoles = (orgRoles: OrgRole[], oldRoles: OldRoleDef[]) =>
	oldRoles
		.filter((r) => r.orgs.some((org) => orgRoles.some((or) => or.org === org && or.roles.includes(r.baseRole))))
		.map((r) => r.name)

const toggleOldRoleForUser = (user: UserData, roleName: string, oldRoles: OldRoleDef[]): UserData => {
	const role = oldRoles.find((r) => r.name === roleName)
	if (!role) return user
	const isActive = getUserActiveOldRoles(user.orgRoles, oldRoles).includes(roleName)
	let newOrgRoles = user.orgRoles.map((or) => ({ ...or, roles: [...or.roles] }))

	for (const org of role.orgs) {
		if (isActive) {
			newOrgRoles = newOrgRoles.map((or) =>
				or.org === org ? { ...or, roles: or.roles.filter((r) => r !== role.baseRole) } : or,
			)
		} else {
			const existing = newOrgRoles.find((or) => or.org === org)
			if (existing) {
				if (!existing.roles.includes(role.baseRole)) existing.roles.push(role.baseRole)
			} else {
				newOrgRoles.push({ org, roles: [role.baseRole] })
			}
		}
	}

	return { ...user, orgRoles: newOrgRoles.filter((or) => or.roles.length > 0) }
}

// ─── Shared UI ───────────────────────────────────────────────

const BadgeMultiSelect = ({
	label,
	options,
	active,
	onToggle,
}: {
	label: string
	options: string[]
	active: string[]
	onToggle: (v: string) => void
}) => (
	<Field label={label}>
		<div className='flex flex-wrap gap-1'>
			{options.map((v) => (
				<button
					type='button'
					key={v}
					className={`badge badge-xs cursor-pointer transition-colors ${active.includes(v) ? 'badge-primary' : 'badge-ghost opacity-30 hover:opacity-60'}`}
					onClick={() => onToggle(v)}
				>
					{v}
				</button>
			))}
		</div>
	</Field>
)

// ─── Role Cards ──────────────────────────────────────────────

const OldRoleCard = ({
	role,
	onUpdate,
	onDelete,
}: {
	role: OldRoleDef
	onUpdate: (r: OldRoleDef) => void
	onDelete?: () => void
}) => {
	const togglePerm = (p: string) => {
		const perm = p as Permission
		const permissions = role.permissions.includes(perm)
			? role.permissions.filter((x) => x !== perm)
			: [...role.permissions, perm]
		onUpdate({ ...role, permissions })
	}
	const toggleOrg = (org: string) => {
		const orgs = role.orgs.includes(org) ? role.orgs.filter((x) => x !== org) : [...role.orgs, org]
		onUpdate({ ...role, orgs })
	}

	return (
		<div className='collapse collapse-arrow bg-base-200 mb-2'>
			<input type='checkbox' />
			<div className='collapse-title flex items-center gap-3 pr-10'>
				<div className='flex-1 min-w-0'>
					<div className='text-sm font-medium truncate leading-tight'>{role.name}</div>
					<div className='text-xs opacity-40'>
						{role.orgs.length} org{role.orgs.length !== 1 ? 's' : ''} · {role.permissions.length} permissions
					</div>
				</div>
				{onDelete && (
					<button
						type='button'
						title='Delete role'
						className='opacity-20 hover:opacity-80 hover:text-error cursor-pointer z-10'
						onClick={(e) => {
							e.stopPropagation()
							onDelete()
						}}
					>
						<LuX size={14} />
					</button>
				)}
			</div>
			<div className='collapse-content'>
				<div className='grid gap-1.5 pt-1'>
					<Field label='Name'>
						<Input
							className='input-xs w-full'
							value={role.name}
							onChange={(e) => onUpdate({ ...role, name: e.target.value })}
						/>
					</Field>
					<BadgeMultiSelect label='Orgs' options={[...ORG_NAMES]} active={role.orgs} onToggle={toggleOrg} />
					{PERM_GROUPS.map((g) => (
						<BadgeMultiSelect
							key={g.asset}
							label={g.asset}
							options={g.perms}
							active={role.permissions}
							onToggle={togglePerm}
						/>
					))}
				</div>
			</div>
		</div>
	)
}

const NewRoleCard = ({
	role,
	onUpdate,
	onDelete,
}: {
	role: NewRoleDef
	onUpdate: (r: NewRoleDef) => void
	onDelete?: () => void
}) => {
	const togglePerm = (p: string) => {
		const perm = p as Permission
		const permissions = role.permissions.includes(perm)
			? role.permissions.filter((x) => x !== perm)
			: [...role.permissions, perm]
		onUpdate({ ...role, permissions })
	}

	return (
		<div className='collapse collapse-arrow bg-base-200 mb-2'>
			<input type='checkbox' />
			<div className='collapse-title flex items-center gap-3 pr-10'>
				<div className='flex-1 min-w-0'>
					<div className='text-sm font-medium truncate leading-tight'>{role.name}</div>
					<div className='text-xs opacity-40'>{role.permissions.length} permissions</div>
				</div>
				{onDelete && (
					<button
						type='button'
						title='Delete role'
						className='opacity-20 hover:opacity-80 hover:text-error cursor-pointer z-10'
						onClick={(e) => {
							e.stopPropagation()
							onDelete()
						}}
					>
						<LuX size={14} />
					</button>
				)}
			</div>
			<div className='collapse-content'>
				<div className='grid gap-1.5 pt-1'>
					<Field label='Name'>
						<Input
							className='input-xs w-full'
							value={role.name}
							onChange={(e) => onUpdate({ ...role, name: e.target.value })}
						/>
					</Field>
					{PERM_GROUPS.map((g) => (
						<BadgeMultiSelect
							key={g.asset}
							label={g.asset}
							options={g.perms}
							active={role.permissions}
							onToggle={togglePerm}
						/>
					))}
				</div>
			</div>
		</div>
	)
}

// ─── User Card (shared wrapper + security slot) ──────────────

const UserCard = ({
	user,
	onUpdate,
	children,
}: {
	user: UserData
	onUpdate: (u: UserData) => void
	children: React.ReactNode
}) => (
	<div className='collapse collapse-arrow bg-base-200 mb-2'>
		<input type='checkbox' />
		<div className='collapse-title flex items-center gap-3 pr-10'>
			<div className='avatar'>
				<div className={`w-8 rounded-full ring-1 ring-base-content/10 ${!user.active ? 'opacity-30 grayscale' : ''}`}>
					<img src={user.avatar} alt='' referrerPolicy='no-referrer' />
				</div>
			</div>
			<div className='flex-1 min-w-0'>
				<div className='text-sm font-medium truncate leading-tight'>{fullName(user)}</div>
				<div className='text-xs opacity-40 truncate'>{user.email}</div>
			</div>
			{user.isSystemAdmin && <span className='badge badge-error badge-xs font-semibold'>SYS</span>}
			{!user.active && <span className='badge badge-ghost badge-xs'>Inactive</span>}
		</div>
		<div className='collapse-content'>
			<div className='grid gap-4 pt-2'>
				<Fieldset
					legend='Account'
					className='bg-base-300/40 rounded-lg p-3'
					legendClassName='badge badge-soft badge-sm'
				>
					<div className='grid grid-cols-2 gap-1.5'>
						<Field label='First Name'>
							<Input
								className='input-xs w-full'
								value={user.firstName}
								onChange={(e) => onUpdate({ ...user, firstName: e.target.value })}
							/>
						</Field>
						<Field label='Last Name'>
							<Input
								className='input-xs w-full'
								value={user.lastName}
								onChange={(e) => onUpdate({ ...user, lastName: e.target.value })}
							/>
						</Field>
					</div>
					<Field label='Email'>
						<Input
							className='input-xs w-full'
							type='email'
							value={user.email}
							onChange={(e) => onUpdate({ ...user, email: e.target.value })}
						/>
					</Field>
					<Field label='Status'>
						<Toggle
							className='toggle-xs'
							checked={user.active}
							onChange={(e) => onUpdate({ ...user, active: e.target.checked })}
						/>
					</Field>
				</Fieldset>

				<Fieldset
					legend='Security'
					className='bg-base-300/40 rounded-lg p-3'
					legendClassName='badge badge-soft badge-sm'
				>
					<Field label='System Admin'>
						<Toggle
							className='toggle-xs toggle-error'
							checked={user.isSystemAdmin}
							onChange={(e) => onUpdate({ ...user, isSystemAdmin: e.target.checked })}
						/>
					</Field>
					{children}
				</Fieldset>

				<Fieldset
					legend='Actions'
					className='bg-base-300/40 rounded-lg p-3'
					legendClassName='badge badge-soft badge-sm'
				>
					<div className='flex flex-wrap gap-2'>
						<Button
							className='btn-xs btn-soft'
							onClick={() => toast.info(`Password reset email sent to ${user.email}`)}
						>
							<LuKeyRound size={12} /> Reset Password
						</Button>
						<Button
							className='btn-xs btn-soft'
							onClick={() => toast.info(`All sessions for ${fullName(user)} have been revoked`)}
						>
							<LuShieldCheck size={12} /> Revoke Sessions
						</Button>
						<Button className='btn-xs btn-soft btn-error' onClick={() => onUpdate({ ...user, orgRoles: [] })}>
							<LuUserX size={12} /> Remove All Roles
						</Button>
					</div>
				</Fieldset>
			</div>
		</div>
	</div>
)

const OldUserSecurity = ({
	user,
	oldRoles,
	onUpdate,
}: {
	user: UserData
	oldRoles: OldRoleDef[]
	onUpdate: (u: UserData) => void
}) => {
	const activeRoles = getUserActiveOldRoles(user.orgRoles, oldRoles)
	const allRoleNames = oldRoles.map((r) => r.name)

	return (
		<Field label='Roles'>
			<div className='flex flex-wrap gap-1'>
				{allRoleNames.map((name) => (
					<button
						type='button'
						key={name}
						className={`badge badge-xs cursor-pointer transition-colors ${activeRoles.includes(name) ? 'badge-primary' : 'badge-ghost opacity-30 hover:opacity-60'}`}
						onClick={() => onUpdate(toggleOldRoleForUser(user, name, oldRoles))}
					>
						{name}
					</button>
				))}
			</div>
		</Field>
	)
}

const NewUserSecurity = ({
	user,
	roleNames,
	onUpdate,
}: {
	user: UserData
	roleNames: string[]
	onUpdate: (u: UserData) => void
}) => {
	const toggleRole = (orgIdx: number, role: string) => {
		const newOrgRoles = user.orgRoles
			.map((or, i) => {
				if (i !== orgIdx) return or
				const roles = or.roles.includes(role) ? or.roles.filter((r) => r !== role) : [...or.roles, role]
				return { ...or, roles }
			})
			.filter((or) => or.roles.length > 0)
		onUpdate({ ...user, orgRoles: newOrgRoles })
	}

	const addOrg = (org: string) =>
		onUpdate({ ...user, orgRoles: [...user.orgRoles, { org, roles: [roleNames[roleNames.length - 1]] }] })
	const removeOrg = (idx: number) => onUpdate({ ...user, orgRoles: user.orgRoles.filter((_, i) => i !== idx) })
	const availableOrgs = ORG_NAMES.filter((o) => !user.orgRoles.some((or) => or.org === o))

	return (
		<>
			{user.orgRoles.map((or, idx) => (
				<div key={or.org} className='flex items-center gap-2 bg-base-300/50 rounded-lg px-2.5 py-1.5'>
					<span className='text-xs font-semibold w-28 shrink-0 truncate'>{or.org}</span>
					<div className='flex flex-wrap gap-1 flex-1'>
						{roleNames.map((r) => (
							<button
								type='button'
								key={r}
								className={`badge badge-xs cursor-pointer transition-colors ${
									or.roles.includes(r) ? 'badge-primary' : 'badge-ghost opacity-30 hover:opacity-60'
								}`}
								onClick={() => toggleRole(idx, r)}
							>
								{r}
							</button>
						))}
					</div>
					<button
						type='button'
						title='Remove org'
						className='opacity-20 hover:opacity-80 hover:text-error cursor-pointer'
						onClick={() => removeOrg(idx)}
					>
						<LuX size={12} />
					</button>
				</div>
			))}
			{availableOrgs.length > 0 && (
				<div className='dropdown dropdown-top'>
					<Button tabIndex={0} className='btn-xs btn-ghost opacity-40 hover:opacity-100'>
						<LuPlus size={10} /> org
					</Button>
					{/* biome-ignore lint/a11y/noNoninteractiveTabindex: daisyUI dropdown pattern requires tabIndex on ul */}
					<ul tabIndex={0} className='dropdown-content menu bg-base-300 rounded-box z-20 w-36 p-1 shadow-lg'>
						{availableOrgs.map((o) => (
							<li key={o}>
								<button type='button' className='text-xs' onClick={() => addOrg(o)}>
									{o}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</>
	)
}

// ─── Root ─────────────────────────────────────────────────────

const Root = () => {
	const [oldRoles, setOldRoles] = useLocalStorage<OldRoleDef[]>({
		key: 'security-old-roles-v1',
		defaultValue: DEFAULT_OLD_ROLES,
	})
	const [newRoles, setNewRoles] = useLocalStorage<NewRoleDef[]>({
		key: 'security-new-roles-v1',
		defaultValue: DEFAULT_NEW_ROLES,
	})
	const newRoleNames = newRoles.map((r) => r.name)
	const [users, setUsers] = useLocalStorage<UserData[]>({
		key: 'security-users-v3',
		defaultValue: genAll(newRoleNames),
	})
	const [tab, setTab] = useState<'users' | 'roles'>('users')
	const [search, setSearch] = useState('')
	const [proposed, setProposed] = useState(false)

	// Migrate old data without firstName/lastName
	const safeUsers = (users.length > 0 && 'firstName' in users[0] ? users : null) ?? genAll(newRoleNames)

	const updateUser = (i: number, u: UserData) => setUsers((prev) => prev.map((x, j) => (j === i ? u : x)))

	const updateOldRole = (i: number, r: OldRoleDef) => setOldRoles((prev) => prev.map((x, j) => (j === i ? r : x)))
	const deleteOldRole = (i: number) => setOldRoles((prev) => prev.filter((_, j) => j !== i))
	const addOldRole = () => {
		const name = `New Role ${oldRoles.length + 1}`
		setOldRoles((prev) => [...prev, { name, baseRole: name, permissions: [], orgs: [] }])
	}

	const updateNewRole = (i: number, r: NewRoleDef) => setNewRoles((prev) => prev.map((x, j) => (j === i ? r : x)))
	const deleteNewRole = (i: number) => setNewRoles((prev) => prev.filter((_, j) => j !== i))
	const addNewRole = () => setNewRoles((prev) => [...prev, { name: `New Role ${prev.length + 1}`, permissions: [] }])

	const randomizeAll = () => setUsers(genAll(newRoleNames))
	const reset = () => {
		for (const k of ['security-old-roles-v1', 'security-new-roles-v1', 'security-users-v3']) localStorage.removeItem(k)
		setOldRoles(DEFAULT_OLD_ROLES)
		setNewRoles(DEFAULT_NEW_ROLES)
		setUsers(genAll(DEFAULT_NEW_ROLES.map((r) => r.name)))
	}

	const q = search.toLowerCase()
	const filtered = q
		? safeUsers.filter(
				(u) =>
					fullName(u).toLowerCase().includes(q) ||
					u.email.toLowerCase().includes(q) ||
					u.firstName.toLowerCase().includes(q) ||
					u.lastName.toLowerCase().includes(q),
			)
		: safeUsers

	return (
		<ThemeProvider defaultTheme='dark'>
			<div className='full-bleed-container h-screen overflow-y-auto grid-rows-[auto_1fr]'>
				<header className='navbar bg-base-300 gap-2 sticky top-0 z-20 full-bleed px-4'>
					<div className='flex-1 flex items-center gap-3'>
						<span className={`text-sm font-medium ${!proposed ? 'opacity-100' : 'opacity-40'}`}>Current</span>
						<Toggle checked={proposed} onChange={(e) => setProposed(e.target.checked)} />
						<span className={`text-sm font-medium ${proposed ? 'opacity-100' : 'opacity-40'}`}>Proposed</span>
					</div>
					<div>
						<Input
							className='input-sm w-48'
							placeholder={tab === 'users' ? 'Search users...' : 'Search roles...'}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<div role='tablist' className='tabs tabs-boxed tabs-sm'>
						<button
							type='button'
							className={`tab ${tab === 'users' ? 'tab-active' : ''}`}
							onClick={() => setTab('users')}
						>
							Users
						</button>
						<button
							type='button'
							className={`tab ${tab === 'roles' ? 'tab-active' : ''}`}
							onClick={() => setTab('roles')}
						>
							Roles
						</button>
					</div>
					<Button className='btn-sm btn-ghost btn-square' title='Randomize users' onClick={randomizeAll}>
						<LuShuffle size={14} />
					</Button>
					<Button className='btn-sm btn-ghost btn-square text-error' title='Reset all data' onClick={reset}>
						<LuTrash2 size={14} />
					</Button>
					<ThemePicker />
				</header>

				<div className='py-4 space-y-4'>
					<div className='flex items-center gap-3'>
						<div className='flex-1'>
							<h2 className='text-sm font-bold tracking-wide uppercase opacity-70'>
								{proposed ? 'Proposed System' : 'Current System'}
							</h2>
							<p className='text-xs opacity-40'>
								{proposed
									? 'Roles are clean — orgs assigned per user'
									: 'Roles carry org scope — permissions × orgs baked together'}
							</p>
						</div>
						{tab === 'roles' && (
							<Button className='btn-xs btn-ghost' onClick={proposed ? addNewRole : addOldRole}>
								<LuPlus size={12} /> Add Role
							</Button>
						)}
					</div>

					{tab === 'users' ? (
						filtered.length ? (
							<div className='space-y-2'>
								{filtered
									.toSorted((a, b) => fullName(a).localeCompare(fullName(b)))
									.map((u) => {
										const i = safeUsers.indexOf(u)
										return (
											<UserCard key={u.id} user={u} onUpdate={(updated) => updateUser(i, updated)}>
												{proposed ? (
													<NewUserSecurity
														user={u}
														roleNames={newRoleNames}
														onUpdate={(updated) => updateUser(i, updated)}
													/>
												) : (
													<OldUserSecurity
														user={u}
														oldRoles={oldRoles}
														onUpdate={(updated) => updateUser(i, updated)}
													/>
												)}
											</UserCard>
										)
									})}
							</div>
						) : (
							<div className='text-center py-12 opacity-30 text-sm'>No users match "{search}"</div>
						)
					) : proposed ? (
						<div className='space-y-2'>
							{newRoles
								.filter((r) => !q || r.name.toLowerCase().includes(q))
								.toSorted((a, b) => a.name.localeCompare(b.name))
								.map((r) => {
									const i = newRoles.indexOf(r)
									return (
										<NewRoleCard
											key={i}
											role={r}
											onUpdate={(updated) => updateNewRole(i, updated)}
											onDelete={newRoles.length > 1 ? () => deleteNewRole(i) : undefined}
										/>
									)
								})}
						</div>
					) : (
						<div className='space-y-2'>
							{oldRoles
								.filter((r) => !q || r.name.toLowerCase().includes(q))
								.toSorted((a, b) => a.name.localeCompare(b.name))
								.map((r) => {
									const i = oldRoles.indexOf(r)
									return (
										<OldRoleCard
											key={i}
											role={r}
											onUpdate={(updated) => updateOldRole(i, updated)}
											onDelete={oldRoles.length > 1 ? () => deleteOldRole(i) : undefined}
										/>
									)
								})}
						</div>
					)}
				</div>
			</div>

			<Toaster />
		</ThemeProvider>
	)
}

createRoot(document.getElementById('root')!).render(<Root />)
