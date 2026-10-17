import type { Role } from '@prisma/client'

export const STAFF_ROLES: Role[] = ['ADMIN', 'MANAGER', 'TRAINER']
export const MANAGER_ROLES: Role[] = ['ADMIN', 'MANAGER']
export const ADMIN_ROLES: Role[] = ['ADMIN']

export const can = {
    viewDirectory: (role: Role) => STAFF_ROLES.includes(role),
    viewMember: (role: Role, userId: string, memberId: string) =>
        STAFF_ROLES.includes(role) || userId === memberId,
    editMembers: (role: Role) => MANAGER_ROLES.includes(role),
    deleteMember: (role: Role, userId: string, memberId: string) =>
        ADMIN_ROLES.includes(role) && userId !== memberId,

    viewClasses: (role: Role) => STAFF_ROLES.includes(role),
    createClass: (role: Role) => STAFF_ROLES.includes(role),
    // Admins and managers manage every class; a trainer manages only their own.
    manageClass: (role: Role, userId: string, trainerId: string | null) =>
        MANAGER_ROLES.includes(role) || (role === 'TRAINER' && trainerId === userId),
}