import { Button, Field, Fieldset, Input, toast, Toggle } from 'https://esm.sh/@trenaryja/ui'
import React from 'https://esm.sh/react'
import { LuKeyRound, LuPlus, LuShieldCheck, LuUserX, LuX } from 'https://esm.sh/react-icons/lu'
import {
	fullName,
	type NewRole,
	ORG_NAMES,
	type OrgsControl,
	PERMISSION_GROUPS,
	toggle,
	type UserData,
} from './roles-data'

export const BadgeMultiSelect = <T extends string>({
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
export const RoleCard = ({
	role,
	orgs,
	onUpdate,
	onDelete,
}: {
	role: NewRole
	orgs?: OrgsControl
	onUpdate: (role: NewRole) => void
	onDelete?: () => void
}) => (
	<div className='collapse-arrow bg-base-200 collapse mb-2'>
		<input type='checkbox' />
		<div className='collapse-title flex items-center gap-3 pr-10'>
			<div className='min-w-0 flex-1'>
				<div className='truncate text-sm leading-tight font-medium'>{role.name}</div>
				<div className='text-xs opacity-40'>
					{orgs && `${orgs.active.length} org${orgs.active.length === 1 ? '' : 's'} · `}
					{role.permissions.length} permissions
				</div>
			</div>
			{onDelete && (
				<button
					type='button'
					title='Delete role'
					className='hover:text-error z-10 cursor-pointer opacity-20 hover:opacity-80'
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

export const UserCard = ({
	user,
	onUpdate,
	children,
}: {
	user: UserData
	onUpdate: (user: UserData) => void
	children: React.ReactNode
}) => (
	<div className='collapse-arrow bg-base-200 collapse mb-2'>
		<input type='checkbox' />
		<div className='collapse-title flex items-center gap-3 pr-10'>
			<div className='avatar'>
				<div className={`ring-base-content/10 w-8 rounded-full ring-1 ${user.active ? '' : 'opacity-30 grayscale'}`}>
					<img src={user.avatar} alt='' referrerPolicy='no-referrer' />
				</div>
			</div>
			<div className='min-w-0 flex-1'>
				<div className='truncate text-sm leading-tight font-medium'>{fullName(user)}</div>
				<div className='truncate text-xs opacity-40'>{user.email}</div>
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

export const NewUserSecurity = ({
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

	const addOrg = (org: string) => {
		const lowestRole = roleNames.at(-1)
		if (lowestRole !== undefined) onUpdate({ ...user, orgRoles: [...user.orgRoles, { org, roles: [lowestRole] }] })
	}

	const removeOrg = (orgIndex: number) =>
		onUpdate({ ...user, orgRoles: user.orgRoles.filter((_, i) => i !== orgIndex) })

	const availableOrgs = ORG_NAMES.filter((org) => user.orgRoles.every((orgRole) => orgRole.org !== org))

	return (
		<>
			{user.orgRoles.map((orgRole, orgIndex) => (
				<div key={orgRole.org} className='bg-base-300/50 flex items-center gap-2 rounded-lg px-2.5 py-1.5'>
					<span className='w-28 shrink-0 truncate text-xs font-semibold'>{orgRole.org}</span>
					<div className='flex flex-1 flex-wrap gap-1'>
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
						className='hover:text-error cursor-pointer opacity-20 hover:opacity-80'
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
					<ul tabIndex={-1} className='dropdown-content menu bg-base-300 rounded-box z-20 w-36 p-1 shadow-lg'>
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
