import type { DefaultSession } from 'next-auth'
import type { Role } from '@prisma/client'

declare module 'next-auth' {
    interface User {
        role?: Role
        gymId?: string
    }
    interface Session {
        user: {
            id: string
            role: Role
            gymId: string
        } & DefaultSession['user']
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id?: string
        role?: Role
        gymId?: string
    }
}