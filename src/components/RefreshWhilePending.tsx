'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function RefreshWhilePending({ maxTries = 15 }: { maxTries?: number }) {
    const router = useRouter()
    const [tries, setTries] = useState(0)

    useEffect(() => {
        if (tries >= maxTries) return
        const timer = setTimeout(() => {
            router.refresh()
            setTries((n) => n + 1)
        }, 2000)
        return () => clearTimeout(timer)
    }, [tries, maxTries, router])

    return tries >= maxTries ? (
        <p className="mt-3 text-sm text-neutral-600">
            Still waiting for confirmation. Check My billing in a minute; you will not be charged twice.
        </p>
    ) : (
        <p className="mt-3 text-sm text-neutral-600" aria-live="polite">Checking again…</p>
    )
}