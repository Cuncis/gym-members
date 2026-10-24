import type { Role } from '@prisma/client'
import type { MembershipAction } from './billing-core'

export const STAFF_ROLES: Role[] = ['ADMIN', 'MANAGER', 'TRAINER']
export const MANAGER_ROLES: Role[] = ['ADMIN', 'MANAGER']
export const ADMIN_ROLES: Role[] = ['ADMIN']
export const ALL_ROLES: Role[] = ['ADMIN', 'MANAGER', 'TRAINER', 'MEMBER']

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
    bookClass: (role: Role) => ALL_ROLES.includes(role),
    // You cancel your own bookings; admins and managers can cancel anyone's.
    cancelBooking: (role: Role, userId: string, bookingUserId: string) =>
        userId === bookingUserId || MANAGER_ROLES.includes(role),

    // Members pause, resume and schedule cancellation of their own membership;
    // ending it immediately, or touching anyone else's, is for admins and managers.
    manageMembership: (role: Role, userId: string, ownerId: string, action: MembershipAction) =>
        MANAGER_ROLES.includes(role) || (userId === ownerId && action !== 'cancel_now'),
}