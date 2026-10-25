import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { Role } from '@prisma/client'

const credentialsSchema = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(200),
})

// Compared when the email is unknown, so a wrong email takes as long as a wrong password.
// Otherwise response time would reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12)

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(db),
    // The credentials provider only works with JWT sessions (a signed cookie, not a database row).
    session: { strategy: 'jwt', maxAge: 60 * 60 * 8 }, // 8 hours
    pages: { signIn: '/signin' },
    providers: [
        Credentials({
            credentials: { email: {}, password: {} },
            async authorize(raw) {
                const parsed = credentialsSchema.safeParse(raw)
                if (!parsed.success) return null
                const { email, password } = parsed.data

                // `db` only sees the gym of this address, so an email that belongs to another gym is simply "not found".
                const user = await db.user.findUnique({ where: { email } })
                const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)

                // The same "null" for every failure: unknown email, no password set, wrong password.
                if (!user || !user.passwordHash || !matches) return null

                return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, gymId: user.gymId }
            },
        }),
        ...(googleEnabled
            ? [
                Google({
                    clientId: process.env.AUTH_GOOGLE_ID,
                    clientSecret: process.env.AUTH_GOOGLE_SECRET,
                }),
            ]
            : []),
    ],
    callbacks: {
        async signIn({ account, profile }) {
            // Only accept Google accounts whose email Google has verified.
            if (account?.provider === 'google') {
                return (profile as { email_verified?: boolean } | undefined)?.email_verified === true
            }
            return true
        },
        // Runs when the token is created (sign-in) and each time it is read.
        // `user` is only present at sign-in, so that is when we copy id and role into the token.
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.role = user.role
                token.gymId = user.gymId
            }
            return token
        },
        async session({ session, token }) {
            if (token.id) session.user.id = token.id as string
            if (token.role) session.user.role = token.role as Role
            if (token.gymId) session.user.gymId = token.gymId as string
            return session
        },
    },
})