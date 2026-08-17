import { faker } from 'https://esm.sh/@faker-js/faker'
import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import {
	Button,
	Field,
	Fieldset,
	Input,
	ThemePicker,
	ThemeProvider,
	toast,
	Toaster,
	Toggle,
} from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { LuKeyRound, LuPlus, LuShieldCheck, LuShuffle, LuTrash2, LuUserX, LuX } from 'https://esm.sh/react-icons/lu'

const PERMISSIONS = [
	'programs:view',
	'programs:edit',
	'solicitations:view',
	'solicitations:edit',
	'projects:view',
	'projects:edit',
] as const
type Permission = (typeof PERMISSIONS)[number]

const PERMISSION_GROUPS: { asset: string; permissions: Permission[] }[] = [
	{ asset: 'Programs', permissions: ['programs:view', 'programs:edit'] },
	{ asset: 'Solicitations', permissions: ['solicitations:view', 'solicitations:edit'] },
	{ asset: 'Projects', permissions: ['projects:view', 'projects:edit'] },
]

const ORG_NAMES = ['Coal', 'Oil & Gas', 'Solar', 'Wind', 'Nuclear']

// The two models this pen compares. Current: every role bakes in its org scope, so the same
// `baseRole` is duplicated once per org. Proposed: roles are pure permission sets and orgs are
// attached per user. Both render from the same `UserData.orgRoles` so the toggle can flip live.
type OldRole = { name: string; baseRole: string; permissions: Permission[]; orgs: string[] }

type NewRole = { name: string; permissions: Permission[] }

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

const DEFAULT_NEW_ROLES: NewRole[] = [
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

const DEFAULT_OLD_ROLES: OldRole[] = DEFAULT_NEW_ROLES.flatMap((role) =>
	ORG_NAMES.map((org) => ({
		name: `${org} ${role.name}`,
		baseRole: role.name,
		permissions: [...role.permissions],
		orgs: [org],
	})),
)

const toggle = <T,>(values: readonly T[], value: T) =>
	values.includes(value) ? values.filter((item) => item !== value) : [...values, value]

const pick = <T,>(values: readonly T[], min = 1, max = values.length) =>
	faker.helpers.arrayElements([...values], faker.number.int({ min, max: Math.min(max, values.length) }))

const generateUser = (roleNames: string[]) => ({
	id: faker.string.uuid(),
	firstName: faker.person.firstName(),
	lastName: faker.person.lastName(),
	email: faker.internet.email().toLowerCase(),
	avatar: faker.image.avatar(),
	isSystemAdmin: faker.datatype.boolean({ probability: 0.1 }),
	active: true,
	orgRoles: pick(ORG_NAMES, 1, 4).map((org) => ({ org, roles: pick(roleNames, 1, 2) })),
})

const generateUsers = (roleNames: string[], count = 10) => Array.from({ length: count }, () => generateUser(roleNames))

const fullName = (user: UserData) => `${user.firstName} ${user.lastName}`

const getUserActiveOldRoles = (orgRoles: OrgRole[], oldRoles: OldRole[]) =>
	oldRoles
		.filter((role) =>
			role.orgs.some((org) => orgRoles.some((orgRole) => orgRole.org === org && orgRole.roles.includes(role.baseRole))),
		)
		.map((role) => role.name)

// An old role spans several orgs, so toggling it adds/removes its `baseRole` in every org it covers.
const toggleOldRoleForUser = (user: UserData, roleName: string, oldRoles: OldRole[]) => {
	const role = oldRoles.find((candidate) => candidate.name === roleName)
	if (!role) return user
	const isActive = getUserActiveOldRoles(user.orgRoles, oldRoles).includes(roleName)
	let orgRoles = user.orgRoles.map((orgRole) => ({ ...orgRole, roles: [...orgRole.roles] }))

	for (const org of role.orgs) {
		if (isActive) {
			orgRoles = orgRoles.map((orgRole) =>
				orgRole.org === org ? { ...orgRole, roles: orgRole.roles.filter((name) => name !== role.baseRole) } : orgRole,
			)
		} else {
			const existing = orgRoles.find((orgRole) => orgRole.org === org)
			if (!existing) orgRoles.push({ org, roles: [role.baseRole] })
			else if (!existing.roles.includes(role.baseRole)) existing.roles.push(role.baseRole)
		}
	}

	return { ...user, orgRoles: orgRoles.filter((orgRole) => orgRole.roles.length > 0) }
}

const BadgeMultiSelect = <T extends string>({
	label,
	options,
	active,
	onToggle,
}: {
	label: string
	options: readonly T[]
	active: readonly T[]
	onToggle: (value: T) => void
}) => (
	<Field label={label}>
		<div className='flex flex-wrap gap-1'>
			{options.map((option) => (
				<button
					type='button'
					key={option}
					className={`badge badge-xs cursor-pointer transition-colors ${active.includes(option) ? 'badge-primary' : 'badge-ghost opacity-30 hover:opacity-60'}`}
					onClick={() => onToggle(option)}
				>
					{option}
				</button>
			))}
		</div>
	</Field>
)

// `orgs` present means the old model (org-scoped role): it adds the org count to the subtitle and an
// Orgs picker. The caller merges `onUpdate`'s result back into its own role so `baseRole`/`orgs` survive.
const RoleCard = ({
	role,
	orgs,
	onUpdate,
	onDelete,
}: {
	role: NewRole
	orgs?: { active: string[]; onToggle: (org: string) => void }
	onUpdate: (role: NewRole) => void
	onDelete?: () => void
}) => (
	<div className='collapse collapse-arrow bg-base-200 mb-2'>
		<input type='checkbox' />
		<div className='collapse-title flex items-center gap-3 pr-10'>
			<div className='flex-1 min-w-0'>
				<div className='text-sm font-medium truncate leading-tight'>{role.name}</div>
				<div className='text-xs opacity-40'>
					{orgs && `${orgs.active.length} org${orgs.active.length !== 1 ? 's' : ''} · `}
					{role.permissions.length} permissions
				</div>
			</div>
			{onDelete && (
				<button
					type='button'
					title='Delete role'
					className='opacity-20 hover:opacity-80 hover:text-error cursor-pointer z-10'
					onClick={(event) => {
						event.stopPropagation()
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
						onChange={(event) => onUpdate({ ...role, name: event.target.value })}
					/>
				</Field>
				{orgs && <BadgeMultiSelect label='Orgs' options={ORG_NAMES} active={orgs.active} onToggle={orgs.onToggle} />}
				{PERMISSION_GROUPS.map((group) => (
					<BadgeMultiSelect
						key={group.asset}
						label={group.asset}
						options={group.permissions}
						active={role.permissions}
						onToggle={(permission) => onUpdate({ ...role, permissions: toggle(role.permissions, permission) })}
					/>
				))}
			</div>
		</div>
	</div>
)

const UserCard = ({
	user,
	onUpdate,
	children,
}: {
	user: UserData
	onUpdate: (user: UserData) => void
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
					classNames={{ legend: 'badge badge-soft badge-sm' }}
				>
					<div className='grid grid-cols-2 gap-1.5'>
						<Field label='First Name'>
							<Input
								className='input-xs w-full'
								value={user.firstName}
								onChange={(event) => onUpdate({ ...user, firstName: event.target.value })}
							/>
						</Field>
						<Field label='Last Name'>
							<Input
								className='input-xs w-full'
								value={user.lastName}
								onChange={(event) => onUpdate({ ...user, lastName: event.target.value })}
							/>
						</Field>
					</div>
					<Field label='Email'>
						<Input
							className='input-xs w-full'
							type='email'
							value={user.email}
							onChange={(event) => onUpdate({ ...user, email: event.target.value })}
						/>
					</Field>
					<Field label='Status'>
						<Toggle
							className='toggle-xs'
							checked={user.active}
							onChange={(event) => onUpdate({ ...user, active: event.target.checked })}
						/>
					</Field>
				</Fieldset>

				<Fieldset
					legend='Security'
					className='bg-base-300/40 rounded-lg p-3'
					classNames={{ legend: 'badge badge-soft badge-sm' }}
				>
					<Field label='System Admin'>
						<Toggle
							className='toggle-xs toggle-error'
							checked={user.isSystemAdmin}
							onChange={(event) => onUpdate({ ...user, isSystemAdmin: event.target.checked })}
						/>
					</Field>
					{children}
				</Fieldset>

				<Fieldset
					legend='Actions'
					className='bg-base-300/40 rounded-lg p-3'
					classNames={{ legend: 'badge badge-soft badge-sm' }}
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

const NewUserSecurity = ({
	user,
	roleNames,
	onUpdate,
}: {
	user: UserData
	roleNames: string[]
	onUpdate: (user: UserData) => void
}) => {
	const toggleRole = (orgIndex: number, role: string) =>
		onUpdate({
			...user,
			orgRoles: user.orgRoles
				.map((orgRole, i) => (i === orgIndex ? { ...orgRole, roles: toggle(orgRole.roles, role) } : orgRole))
				.filter((orgRole) => orgRole.roles.length > 0),
		})

	const addOrg = (org: string) =>
		onUpdate({ ...user, orgRoles: [...user.orgRoles, { org, roles: [roleNames.at(-1)!] }] })

	const removeOrg = (orgIndex: number) =>
		onUpdate({ ...user, orgRoles: user.orgRoles.filter((_, i) => i !== orgIndex) })

	const availableOrgs = ORG_NAMES.filter((org) => !user.orgRoles.some((orgRole) => orgRole.org === org))

	return (
		<>
			{user.orgRoles.map((orgRole, orgIndex) => (
				<div key={orgRole.org} className='flex items-center gap-2 bg-base-300/50 rounded-lg px-2.5 py-1.5'>
					<span className='text-xs font-semibold w-28 shrink-0 truncate'>{orgRole.org}</span>
					<div className='flex flex-wrap gap-1 flex-1'>
						{roleNames.map((roleName) => (
							<button
								type='button'
								key={roleName}
								className={`badge badge-xs cursor-pointer transition-colors ${
									orgRole.roles.includes(roleName) ? 'badge-primary' : 'badge-ghost opacity-30 hover:opacity-60'
								}`}
								onClick={() => toggleRole(orgIndex, roleName)}
							>
								{roleName}
							</button>
						))}
					</div>
					<button
						type='button'
						title='Remove org'
						className='opacity-20 hover:opacity-80 hover:text-error cursor-pointer'
						onClick={() => removeOrg(orgIndex)}
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
					<ul tabIndex={0} className='dropdown-content menu bg-base-300 rounded-box z-20 w-36 p-1 shadow-lg'>
						{availableOrgs.map((org) => (
							<li key={org}>
								<button type='button' className='text-xs' onClick={() => addOrg(org)}>
									{org}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</>
	)
}

const Root = () => {
	const [oldRoles, setOldRoles] = useLocalStorage<OldRole[]>({
		key: 'security-old-roles-v1',
		defaultValue: DEFAULT_OLD_ROLES,
	})
	const [newRoles, setNewRoles] = useLocalStorage<NewRole[]>({
		key: 'security-new-roles-v1',
		defaultValue: DEFAULT_NEW_ROLES,
	})
	const newRoleNames = newRoles.map((role) => role.name)
	const [users, setUsers] = useLocalStorage<UserData[]>({
		key: 'security-users-v3',
		defaultValue: generateUsers(newRoleNames),
	})
	const [tab, setTab] = useState<'roles' | 'users'>('users')
	const [search, setSearch] = useState('')
	const [proposed, setProposed] = useState(false)

	// Stored users predating firstName/lastName are unusable — regenerate rather than migrate.
	const safeUsers = (users.length > 0 && 'firstName' in users[0]! ? users : null) ?? generateUsers(newRoleNames)

	const updateUser = (index: number, user: UserData) =>
		setUsers((previous) => previous.map((existing, i) => (i === index ? user : existing)))

	const updateOldRole = (index: number, role: OldRole) =>
		setOldRoles((previous) => previous.map((existing, i) => (i === index ? role : existing)))

	const updateNewRole = (index: number, role: NewRole) =>
		setNewRoles((previous) => previous.map((existing, i) => (i === index ? role : existing)))

	const deleteOldRole = (index: number) => setOldRoles((previous) => previous.filter((_, i) => i !== index))
	const deleteNewRole = (index: number) => setNewRoles((previous) => previous.filter((_, i) => i !== index))

	const addOldRole = () => {
		const name = `New Role ${oldRoles.length + 1}`
		setOldRoles((previous) => [...previous, { name, baseRole: name, permissions: [], orgs: [] }])
	}

	const addNewRole = () =>
		setNewRoles((previous) => [...previous, { name: `New Role ${previous.length + 1}`, permissions: [] }])

	const reset = () => {
		for (const key of ['security-old-roles-v1', 'security-new-roles-v1', 'security-users-v3'])
			localStorage.removeItem(key)
		setOldRoles(DEFAULT_OLD_ROLES)
		setNewRoles(DEFAULT_NEW_ROLES)
		setUsers(generateUsers(DEFAULT_NEW_ROLES.map((role) => role.name)))
	}

	const query = search.toLowerCase()
	const filteredUsers = query
		? safeUsers.filter(
				(user) =>
					fullName(user).toLowerCase().includes(query) ||
					user.email.toLowerCase().includes(query) ||
					user.firstName.toLowerCase().includes(query) ||
					user.lastName.toLowerCase().includes(query),
			)
		: safeUsers

	return (
		<ThemeProvider defaultTheme='dark'>
			<div className='full-bleed-container h-screen overflow-y-auto grid-rows-[auto_1fr]'>
				<header className='navbar bg-base-300 gap-2 sticky top-0 z-20 full-bleed px-4'>
					<div className='flex-1 flex items-center gap-3'>
						<span className={`text-sm font-medium ${!proposed ? 'opacity-100' : 'opacity-40'}`}>Current</span>
						<Toggle checked={proposed} onChange={(event) => setProposed(event.target.checked)} />
						<span className={`text-sm font-medium ${proposed ? 'opacity-100' : 'opacity-40'}`}>Proposed</span>
					</div>
					<div>
						<Input
							className='input-sm w-48'
							placeholder={tab === 'users' ? 'Search users...' : 'Search roles...'}
							value={search}
							onChange={(event) => setSearch(event.target.value)}
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
					<Button
						className='btn-sm btn-ghost btn-square'
						title='Randomize users'
						onClick={() => setUsers(generateUsers(newRoleNames))}
					>
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
						filteredUsers.length ? (
							<div className='space-y-2'>
								{filteredUsers
									.toSorted((a, b) => fullName(a).localeCompare(fullName(b)))
									.map((user) => {
										const index = safeUsers.indexOf(user)
										return (
											<UserCard key={user.id} user={user} onUpdate={(updated) => updateUser(index, updated)}>
												{proposed ? (
													<NewUserSecurity
														user={user}
														roleNames={newRoleNames}
														onUpdate={(updated) => updateUser(index, updated)}
													/>
												) : (
													<BadgeMultiSelect
														label='Roles'
														options={oldRoles.map((role) => role.name)}
														active={getUserActiveOldRoles(user.orgRoles, oldRoles)}
														onToggle={(name) => updateUser(index, toggleOldRoleForUser(user, name, oldRoles))}
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
								.filter((role) => !query || role.name.toLowerCase().includes(query))
								.toSorted((a, b) => a.name.localeCompare(b.name))
								.map((role) => {
									const index = newRoles.indexOf(role)
									return (
										<RoleCard
											key={index}
											role={role}
											onUpdate={(updated) => updateNewRole(index, updated)}
											onDelete={newRoles.length > 1 ? () => deleteNewRole(index) : undefined}
										/>
									)
								})}
						</div>
					) : (
						<div className='space-y-2'>
							{oldRoles
								.filter((role) => !query || role.name.toLowerCase().includes(query))
								.toSorted((a, b) => a.name.localeCompare(b.name))
								.map((role) => {
									const index = oldRoles.indexOf(role)
									return (
										<RoleCard
											key={index}
											role={role}
											orgs={{
												active: role.orgs,
												onToggle: (org) => updateOldRole(index, { ...role, orgs: toggle(role.orgs, org) }),
											}}
											onUpdate={(updated) => updateOldRole(index, { ...role, ...updated })}
											onDelete={oldRoles.length > 1 ? () => deleteOldRole(index) : undefined}
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
