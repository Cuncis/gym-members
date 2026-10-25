import { auth } from './auth'
import { getRequestGym } from './tenant'
import { sessionBelongsToGym } from './tenant-context'

// Use this instead of auth() everywhere. A cookie from another gym counts as "not signed in".
export async function getSession() {
    const session = await auth()
    if (!session?.user) return null
    const gym = await getRequestGym()
    return sessionBelongsToGym(session.user.gymId, gym?.id) ? session : null
}