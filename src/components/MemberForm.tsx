'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberStatus } from '@prisma/client'
import { MEMBER_STATUSES } from '@/lib/validation'

type Member = {
    id: string
    name: string
    email: string
    phone: string | null
    status: MemberStatus
}

type FieldName = 'name' | 'email' | 'phone' | 'status'
type FieldErrors = Partial<Record<FieldName, string[]>>

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
    if (!messages?.length) return null
    return (
        <p id={id} role="alert" className="mt-1 text-sm text-red-600">
            {messages[0]}
        </p>
    )
}

export function MemberForm({ member }: { member?: Member }) {
    const router = useRouter()
    const [errors, setErrors] = useState<FieldErrors>({})
    const [formError, setFormError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setErrors({})
        setFormError(null)
        setSubmitting(true)

        const data = new FormData(event.currentTarget)
        const payload = {
            name: String(data.get('name') ?? ''),
            email: String(data.get('email') ?? ''),
            phone: String(data.get('phone') ?? ''),
            status: String(data.get('status') ?? 'LEAD'),
        }

        let navigating = false
        try {
            const res = await fetch(member ? `/api/members/${member.id}` : '/api/members', {
                method: member ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            // A crashed server returns HTML, not JSON, so parsing can fail.
            const json = await res.json().catch(() => null)

            if (res.ok) {
                navigating = true
                router.push(`/members/${member ? member.id : json.id}`)
                router.refresh()
                return
            }

            if (res.status === 404) {
                setFormError('This member no longer exists.')
                return
            }

            setErrors(json?.fieldErrors ?? {})
            setFormError(json?.fieldErrors ? null : (json?.error ?? 'Something went wrong. Please try again.'))
        } catch {
            setFormError('Could not reach the server. Check your connection and try again.')
        } finally {
            if (!navigating) setSubmitting(false)
        }
    }

    const input = 'mt-1 w-full rounded border border-neutral-300 px-3 py-2'

    return (
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {formError && (
                <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {formError}
                </p>
            )}

            <div>
                <label htmlFor="name" className="block font-medium">Name</label>
                <input
                    id="name"
                    name="name"
                    defaultValue={member?.name ?? ''}
                    autoComplete="name"
                    className={input}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                />
                <FieldError id="name-error" messages={errors.name} />
            </div>

            <div>
                <label htmlFor="email" className="block font-medium">Email</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={member?.email ?? ''}
                    autoComplete="email"
                    className={input}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                />
                <FieldError id="email-error" messages={errors.email} />
            </div>

            <div>
                <label htmlFor="phone" className="block font-medium">Phone (optional)</label>
                <input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={member?.phone ?? ''}
                    autoComplete="tel"
                    className={input}
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? 'phone-error' : undefined}
                />
                <FieldError id="phone-error" messages={errors.phone} />
            </div>

            <div>
                <label htmlFor="status" className="block font-medium">Status</label>
                <select id="status" name="status" defaultValue={member?.status ?? 'LEAD'} className={input}>
                    {MEMBER_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <FieldError id="status-error" messages={errors.status} />
            </div>

            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={submitting}
                    className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
                >
                    {submitting ? 'Saving…' : member ? 'Save changes' : 'Add member'}
                </button>
                <button
                    type="button"
                    onClick={() => router.back()}
                    disabled={submitting}
                    className="rounded border px-4 py-2"
                >
                    Cancel
                </button>
            </div>
        </form>
    )
}