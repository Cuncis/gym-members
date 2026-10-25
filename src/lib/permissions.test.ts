import { describe, expect, it } from 'vitest'
import { can } from './permissions'

describe('permissions', () => {
    it('lets staff, but not members, view the directory', () => {
        expect(can.viewDirectory('ADMIN')).toBe(true)
        expect(can.viewDirectory('MANAGER')).toBe(true)
        expect(can.viewDirectory('TRAINER')).toBe(true)
        expect(can.viewDirectory('MEMBER')).toBe(false)
    })

    it('lets a member view only their own profile, and staff view anyone', () => {
        expect(can.viewMember('MEMBER', 'u1', 'u1')).toBe(true)
        expect(can.viewMember('MEMBER', 'u1', 'u2')).toBe(false)
        expect(can.viewMember('TRAINER', 'u1', 'u2')).toBe(true)
    })

    it('lets only admins and managers edit members', () => {
        expect(can.editMembers('ADMIN')).toBe(true)
        expect(can.editMembers('MANAGER')).toBe(true)
        expect(can.editMembers('TRAINER')).toBe(false)
        expect(can.editMembers('MEMBER')).toBe(false)
    })

    it('lets only admins delete, and never their own account', () => {
        expect(can.deleteMember('ADMIN', 'u1', 'u2')).toBe(true)
        expect(can.deleteMember('ADMIN', 'u1', 'u1')).toBe(false)
        expect(can.deleteMember('MANAGER', 'u1', 'u2')).toBe(false)
        expect(can.deleteMember('TRAINER', 'u1', 'u2')).toBe(false)
        expect(can.deleteMember('MEMBER', 'u1', 'u2')).toBe(false)
    })
})

describe('booking permissions', () => {
    it('lets every role book a class', () => {
        for (const role of ['ADMIN', 'MANAGER', 'TRAINER', 'MEMBER'] as const) {
            expect(can.bookClass(role)).toBe(true)
        }
    })

    it('lets people cancel their own booking, and managers cancel anyone\'s', () => {
        expect(can.cancelBooking('MEMBER', 'u1', 'u1')).toBe(true)
        expect(can.cancelBooking('MEMBER', 'u1', 'u2')).toBe(false)
        expect(can.cancelBooking('TRAINER', 'u1', 'u2')).toBe(false)
        expect(can.cancelBooking('MANAGER', 'u1', 'u2')).toBe(true)
        expect(can.cancelBooking('ADMIN', 'u1', 'u2')).toBe(true)
    })
})

describe('billing permissions', () => {
    it('lets a member manage their own membership, except cancelling immediately', () => {
        expect(can.manageMembership('MEMBER', 'u1', 'u1', 'pause')).toBe(true)
        expect(can.manageMembership('MEMBER', 'u1', 'u1', 'cancel_at_period_end')).toBe(true)
        expect(can.manageMembership('MEMBER', 'u1', 'u1', 'cancel_now')).toBe(false)
    })

    it('does not let a member or trainer touch someone else\'s membership', () => {
        expect(can.manageMembership('MEMBER', 'u1', 'u2', 'pause')).toBe(false)
        expect(can.manageMembership('TRAINER', 'u1', 'u2', 'cancel_at_period_end')).toBe(false)
    })

    it('lets admins and managers manage any membership, including cancelling now', () => {
        expect(can.manageMembership('ADMIN', 'u1', 'u2', 'cancel_now')).toBe(true)
        expect(can.manageMembership('MANAGER', 'u1', 'u2', 'pause')).toBe(true)
    })

    it('limits refunds and promo codes to admins and managers', () => {
        expect(can.refund('ADMIN')).toBe(true)
        expect(can.refund('MANAGER')).toBe(true)
        expect(can.refund('TRAINER')).toBe(false)
        expect(can.refund('MEMBER')).toBe(false)
        expect(can.manageDiscounts('TRAINER')).toBe(false)
    })
})

describe('notification permissions', () => {
    it('lets only admins and managers read the message log', () => {
        expect(can.viewNotifications('ADMIN')).toBe(true)
        expect(can.viewNotifications('MANAGER')).toBe(true)
        expect(can.viewNotifications('TRAINER')).toBe(false)
        expect(can.viewNotifications('MEMBER')).toBe(false)
    })
})
