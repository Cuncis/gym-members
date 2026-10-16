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