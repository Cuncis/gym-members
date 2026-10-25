import { Suspense } from 'react'
import { gymOrigin } from '@/lib/host'
import { listGyms } from '@/lib/gym'

// What the platform's own address shows. For now it lists the gyms, which is handy while developing.
// A real product would put its marketing page here and would NOT list its customers.
async function Content() {
    const gyms = await listGyms()

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">FitnessGM</h1>
            <p className="mt-2 text-neutral-600">{gyms.length} gym(s) on this platform.</p>
            <ul className="mt-6 space-y-3">
                {gyms.map((gym) => (
                    <li key={gym.id} className="rounded-lg border border-neutral-300 p-4">
                        <p className="font-semibold">{gym.name}</p>
                        <a className="text-sm underline" href={gymOrigin(gym)}>
                            {gymOrigin(gym)}
                        </a>
                    </li>
                ))}
            </ul>
        </main>
    )
}

export default function PlatformPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}
