import { useLocalStorage } from 'https://esm.sh/@mantine/hooks'
import { ThemeProvider, Toaster } from 'https://esm.sh/@trenaryja/ui'
import React, { useState } from 'https://esm.sh/react'
import { createRoot } from 'https://esm.sh/react-dom/client'
import { Header, RoleList, SectionHeading, UserList } from './role-sections'
import {
	DEFAULT_NEW_ROLES,
	DEFAULT_OLD_ROLES,
	type NewRole,
	ORG_NAMES,
	type OldRole,
	type Tab,
	type UserData,
	generateUsers,
	toggle,
} from './roles-data'

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
	const [tab, setTab] = useState<Tab>('users')
	const [search, setSearch] = useState('')
	const [proposed, setProposed] = useState(false)

	const updateUser = (index: number, user: UserData) =>
		setUsers((previous) => previous.map((existing, i) => (i === index ? user : existing)))

	const updateOldRole = (index: number, patch: Partial<OldRole>) =>
		setOldRoles((previous) => previous.map((existing, i) => (i === index ? { ...existing, ...patch } : existing)))

	const updateNewRole = (index: number, role: NewRole) =>
		setNewRoles((previous) => previous.map((existing, i) => (i === index ? role : existing)))

	const deleteOldRole = (index: number) => setOldRoles((previous) => previous.filter((_, i) => i !== index))
	const deleteNewRole = (index: number) => setNewRoles((previous) => previous.filter((_, i) => i !== index))

	// An old role with no orgs is unassignable: `toggleOldRoleForUser` drives entirely off `role.orgs`.
	const addOldRole = () => {
		const name = `New Role ${oldRoles.length + 1}`
		setOldRoles((previous) => [...previous, { name, baseRole: name, permissions: [], orgs: [...ORG_NAMES] }])
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

	return (
		<ThemeProvider defaultTheme='dark'>
			<div className='full-bleed-container h-screen grid-rows-[auto_1fr] overflow-y-auto'>
				<Header
					proposed={proposed}
					tab={tab}
					search={search}
					onProposedChange={setProposed}
					onTabChange={setTab}
					onSearchChange={setSearch}
					onRandomize={() => setUsers(generateUsers(newRoleNames))}
					onReset={reset}
				/>

				<div className='space-y-4 py-4'>
					<SectionHeading proposed={proposed} tab={tab} onAddRole={proposed ? addNewRole : addOldRole} />

					{tab === 'users' ? (
						<UserList
							users={users}
							search={search}
							proposed={proposed}
							oldRoles={oldRoles}
							roleNames={newRoleNames}
							onUpdate={updateUser}
						/>
					) : proposed ? (
						<RoleList roles={newRoles} search={search} onUpdate={updateNewRole} onDelete={deleteNewRole} />
					) : (
						<RoleList
							roles={oldRoles}
							search={search}
							orgsFor={(role, index) => ({
								active: role.orgs,
								onToggle: (org) => updateOldRole(index, { orgs: toggle(role.orgs, org) }),
							})}
							onUpdate={updateOldRole}
							onDelete={deleteOldRole}
						/>
					)}
				</div>
			</div>

			<Toaster />
		</ThemeProvider>
	)
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')
createRoot(root).render(<Root />)
