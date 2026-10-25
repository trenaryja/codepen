import { faker } from 'https://esm.sh/@faker-js/faker'

export const PERMISSIONS = [
	'programs:view',
	'programs:edit',
	'solicitations:view',
	'solicitations:edit',
	'projects:view',
	'projects:edit',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_GROUPS: { asset: string; permissions: Permission[] }[] = [
	{ asset: 'Programs', permissions: ['programs:view', 'programs:edit'] },
	{ asset: 'Solicitations', permissions: ['solicitations:view', 'solicitations:edit'] },
	{ asset: 'Projects', permissions: ['projects:view', 'projects:edit'] },
]

export const ORG_NAMES = ['Coal', 'Oil & Gas', 'Solar', 'Wind', 'Nuclear']

export const TABS = ['users', 'roles'] as const
export type Tab = (typeof TABS)[number]

export const TAB_LABELS: Record<Tab, string> = { users: 'Users', roles: 'Roles' }

// The two models this pen compares. Current: every role bakes in its org scope, so the same
// `baseRole` is duplicated once per org. Proposed: roles are pure permission sets and orgs are
// attached per user. Both render from the same `UserData.orgRoles` so the toggle can flip live.
export type OldRole = { name: string; baseRole: string; permissions: Permission[]; orgs: string[] }

export type NewRole = { name: string; permissions: Permission[] }

export type OrgRole = { org: string; roles: string[] }

// Handed to `RoleCard` only in the old model, where a role owns the orgs it is scoped to.
export type OrgsControl = { active: string[]; onToggle: (org: string) => void }

export type UserData = {
	id: string
	firstName: string
	lastName: string
	email: string
	avatar: string
	isSystemAdmin: boolean
	active: boolean
	orgRoles: OrgRole[]
}

export const DEFAULT_NEW_ROLES: NewRole[] = [
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

export const DEFAULT_OLD_ROLES: OldRole[] = DEFAULT_NEW_ROLES.flatMap((role) =>
	ORG_NAMES.map((org) => ({
		name: `${org} ${role.name}`,
		baseRole: role.name,
		permissions: [...role.permissions],
		orgs: [org],
	})),
)

export const toggle = <T>(values: readonly T[], value: T) =>
	values.includes(value) ? values.filter((item) => item !== value) : [...values, value]

export const pick = <T>(values: readonly T[], max = values.length) =>
	faker.helpers.arrayElements([...values], faker.number.int({ min: 1, max: Math.min(max, values.length) }))

export const generateUser = (roleNames: string[]) => ({
	id: faker.string.uuid(),
	firstName: faker.person.firstName(),
	lastName: faker.person.lastName(),
	email: faker.internet.email().toLowerCase(),
	avatar: faker.image.avatar(),
	isSystemAdmin: faker.datatype.boolean({ probability: 0.1 }),
	active: true,
	orgRoles: pick(ORG_NAMES, 4).map((org) => ({ org, roles: pick(roleNames, 2) })),
})

export const generateUsers = (roleNames: string[]) => Array.from({ length: 10 }, () => generateUser(roleNames))

export const fullName = (user: UserData) => `${user.firstName} ${user.lastName}`

export const getUserActiveOldRoles = (orgRoles: OrgRole[], oldRoles: OldRole[]) =>
	oldRoles
		.filter((role) =>
			role.orgs.some((org) => orgRoles.some((orgRole) => orgRole.org === org && orgRole.roles.includes(role.baseRole))),
		)
		.map((role) => role.name)

// An old role spans several orgs, so toggling it adds/removes its `baseRole` in every org it covers.
export const toggleOldRoleForUser = (user: UserData, roleName: string, oldRoles: OldRole[]) => {
	const role = oldRoles.find((candidate) => candidate.name === roleName)
	if (!role) return user
	const isActive = getUserActiveOldRoles(user.orgRoles, oldRoles).includes(roleName)
	let orgRoles = user.orgRoles.map((orgRole) => ({ ...orgRole, roles: [...orgRole.roles] }))

	for (const org of role.orgs)
		if (isActive)
			orgRoles = orgRoles.map((orgRole) =>
				orgRole.org === org ? { ...orgRole, roles: orgRole.roles.filter((name) => name !== role.baseRole) } : orgRole,
			)
		else {
			const existing = orgRoles.find((orgRole) => orgRole.org === org)
			if (!existing) orgRoles.push({ org, roles: [role.baseRole] })
			else if (!existing.roles.includes(role.baseRole)) existing.roles.push(role.baseRole)
		}

	return { ...user, orgRoles: orgRoles.filter((orgRole) => orgRole.roles.length > 0) }
}
