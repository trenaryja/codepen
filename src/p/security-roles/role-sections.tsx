import { Button, Input, ThemePicker, Toggle } from 'https://esm.sh/@trenaryja/ui'
import React from 'https://esm.sh/react'
import { LuPlus, LuShuffle, LuTrash2 } from 'https://esm.sh/react-icons/lu'
import { BadgeMultiSelect, NewUserSecurity, RoleCard, UserCard } from './role-cards'
import {
	type NewRole,
	type OldRole,
	type OrgsControl,
	TABS,
	TAB_LABELS,
	type Tab,
	type UserData,
	fullName,
	getUserActiveOldRoles,
	toggleOldRoleForUser,
} from './roles-data'

export const Header = ({
	proposed,
	tab,
	search,
	onProposedChange,
	onTabChange,
	onSearchChange,
	onRandomize,
	onReset,
}: {
	proposed: boolean
	tab: Tab
	search: string
	onProposedChange: (proposed: boolean) => void
	onTabChange: (tab: Tab) => void
	onSearchChange: (search: string) => void
	onRandomize: () => void
	onReset: () => void
}) => (
	<header className='navbar bg-base-300 full-bleed sticky top-0 z-20 gap-2 px-4'>
		<div className='flex flex-1 items-center gap-3'>
			<span className={`text-sm font-medium ${proposed ? 'opacity-40' : 'opacity-100'}`}>Current</span>
			<Toggle checked={proposed} onChange={(event) => onProposedChange(event.target.checked)} />
			<span className={`text-sm font-medium ${proposed ? 'opacity-100' : 'opacity-40'}`}>Proposed</span>
		</div>
		<div>
			<Input
				className='input-sm w-48'
				placeholder={`Search ${tab}...`}
				value={search}
				onChange={(event) => onSearchChange(event.target.value)}
			/>
		</div>
		<div role='tablist' className='tabs tabs-boxed tabs-sm'>
			{TABS.map((name) => (
				<button
					type='button'
					key={name}
					className={`tab ${tab === name ? 'tab-active' : ''}`}
					onClick={() => onTabChange(name)}
				>
					{TAB_LABELS[name]}
				</button>
			))}
		</div>
		<Button className='btn-sm btn-ghost btn-square' title='Randomize users' onClick={onRandomize}>
			<LuShuffle size={14} />
		</Button>
		<Button className='btn-sm btn-ghost btn-square text-error' title='Reset all data' onClick={onReset}>
			<LuTrash2 size={14} />
		</Button>
		<ThemePicker />
	</header>
)

export const SectionHeading = ({
	proposed,
	tab,
	onAddRole,
}: {
	proposed: boolean
	tab: Tab
	onAddRole: () => void
}) => (
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
			<Button className='btn-xs btn-ghost' onClick={onAddRole}>
				<LuPlus size={12} /> Add Role
			</Button>
		)}
	</div>
)

// `users` stays unfiltered so a card's index still points at the caller's array after a search narrows it.
export const UserList = ({
	users,
	search,
	proposed,
	oldRoles,
	roleNames,
	onUpdate,
}: {
	users: UserData[]
	search: string
	proposed: boolean
	oldRoles: OldRole[]
	roleNames: string[]
	onUpdate: (index: number, user: UserData) => void
}) => {
	const query = search.toLowerCase()
	const matchesQuery = (user: UserData) =>
		[fullName(user), user.email, user.firstName, user.lastName].some((field) => field.toLowerCase().includes(query))
	const filteredUsers = query ? users.filter(matchesQuery) : users

	if (!filteredUsers.length)
		return <div className='py-12 text-center text-sm opacity-30'>No users match "{search}"</div>

	return (
		<div className='space-y-2'>
			{filteredUsers
				.toSorted((a, b) => fullName(a).localeCompare(fullName(b)))
				.map((user) => {
					const index = users.indexOf(user)
					return (
						<UserCard key={user.id} user={user} onUpdate={(updated) => onUpdate(index, updated)}>
							{proposed ? (
								<NewUserSecurity user={user} roleNames={roleNames} onUpdate={(updated) => onUpdate(index, updated)} />
							) : (
								<BadgeMultiSelect
									label='Roles'
									options={oldRoles.map((role) => role.name)}
									active={getUserActiveOldRoles(user.orgRoles, oldRoles)}
									onToggle={(name) => onUpdate(index, toggleOldRoleForUser(user, name, oldRoles))}
								/>
							)}
						</UserCard>
					)
				})}
		</div>
	)
}

// Serves both models: `OldRole` widens `NewRole`, and only the old one supplies `orgsFor`.
export const RoleList = <T extends NewRole>({
	roles,
	search,
	orgsFor,
	onUpdate,
	onDelete,
}: {
	roles: T[]
	search: string
	orgsFor?: (role: T, index: number) => OrgsControl
	onUpdate: (index: number, role: NewRole) => void
	onDelete: (index: number) => void
}) => {
	const query = search.toLowerCase()
	return (
		<div className='space-y-2'>
			{roles
				.filter((role) => !query || role.name.toLowerCase().includes(query))
				.toSorted((a, b) => a.name.localeCompare(b.name))
				.map((role) => {
					const index = roles.indexOf(role)
					return (
						<RoleCard
							key={index}
							role={role}
							orgs={orgsFor?.(role, index)}
							onUpdate={(updated) => onUpdate(index, updated)}
							onDelete={roles.length > 1 ? () => onDelete(index) : undefined}
						/>
					)
				})}
		</div>
	)
}
