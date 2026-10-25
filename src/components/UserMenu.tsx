import Link from 'next/link'
import { signOut } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getRequestGym } from '@/lib/tenant'
import { can } from '@/lib/permissions'

export async function UserMenu() {
    const [session, gym] = await Promise.all([getSession(), getRequestGym()])

    return (
        <header className="border-b border-neutral-200">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-6 py-3 text-sm">
                <div className="flex items-center gap-4">
                    <Link href="/members" className="font-semibold">{gym?.name ?? 'Gym Members'}</Link>
                    {session && can.viewClasses(session.user.role) && (
                        <>
                            <Link href="/classes">Classes</Link>
                            <Link href="/admin/bookings">Bookings</Link>
                        </>
                    )}
                    {session && <Link href="/schedule">Schedule</Link>}
                    {session && (
                        <>
                            <Link href="/plans">Plans</Link>
                            <Link href="/billing">Billing</Link>
                        </>
                    )}
                </div>

                {session ? (
                    <div className="flex items-center gap-3">
                        <span>
                            {session.user.name}{' '}
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium">
                                {session.user.role}
                            </span>
                        </span>
                        <form
                            action={async () => {
                                'use server'
                                await signOut({ redirectTo: '/signin' })
                            }}
                        >
                            <button type="submit" className="rounded border px-3 py-1">Sign out</button>
                        </form>
                    </div>
                ) : (
                    <div className="flex gap-3">
                        <Link href="/signin">Sign in</Link>
                        <Link href="/signup">Create account</Link>
                    </div>
                )}
            </div>
        </header>
    )
}