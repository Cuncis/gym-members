'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

type Item = { id: string; hostname: string; verified: boolean; recordName: string; recordValue: string }

export function DomainManager({ domains }: { domains: Item[] }) {
    const router = useRouter()
    const [hostname, setHostname] = useState('')
    const [message, setMessage] = useState<string | null>(null)

    async function call(url: string, method: string, body?: unknown) {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        })
        return { ok: res.ok, data: await res.json() }
    }

    async function add(event: FormEvent) {
        event.preventDefault()
        const { ok, data } = await call('/api/domains', 'POST', { hostname })
        setMessage(ok ? null : data.error)
        if (ok) setHostname('')
        router.refresh()
    }

    async function verify(id: string) {
        const { data } = await call(`/api/domains/${id}/verify`, 'POST')
        setMessage(data.verified ? 'Verified. Your domain is live.' : data.error)
        router.refresh()
    }

    async function remove(id: string) {
        if (!confirm('Remove this domain?')) return
        await call(`/api/domains/${id}`, 'DELETE')
        router.refresh()
    }

    return (
        <div className="mt-6 space-y-6">
            <form onSubmit={add} className="flex gap-2">
                <input
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="members.yourgym.com"
                    className="flex-1 rounded border border-neutral-300 px-3 py-2"
                />
                <button type="submit" className="rounded border px-4 py-2 font-semibold">
                    Add
                </button>
            </form>
            {message && <p role="status">{message}</p>}

            <ul className="space-y-4">
                {domains.map((d) => (
                    <li key={d.id} className="rounded-lg border border-neutral-300 p-4">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold">{d.hostname}</span>
                            <span className="text-sm">{d.verified ? 'Verified' : 'Not verified yet'}</span>
                        </div>
                        {!d.verified && (
                            <div className="mt-3 space-y-1 text-sm">
                                <p>Create this DNS record, then press Verify:</p>
                                <p>
                                    Type <b>TXT</b>, name <span className="font-mono">{d.recordName}</span>
                                </p>
                                <p>
                                    Value <span className="font-mono break-all">{d.recordValue}</span>
                                </p>
                                <button onClick={() => verify(d.id)} className="mt-2 rounded border px-3 py-1">
                                    Verify
                                </button>
                            </div>
                        )}
                        <button onClick={() => remove(d.id)} className="mt-3 text-sm underline">
                            Remove
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}