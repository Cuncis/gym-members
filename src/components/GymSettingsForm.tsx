'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

type Values = { name: string; timeZone: string; brandColor: string; billingHour: number; reminderHour: number }
type FieldErrors = Partial<Record<keyof Values, string[]>>

export function GymSettingsForm({ initial }: { initial: Values }) {
    const router = useRouter()
    const [values, setValues] = useState(initial)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [message, setMessage] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const set = (key: keyof Values) => (e: { target: { value: string } }) =>
        setValues((v) => ({ ...v, [key]: key.endsWith('Hour') ? Number(e.target.value) : e.target.value }))

    async function onSubmit(event: FormEvent) {
        event.preventDefault()
        setSaving(true)
        setMessage(null)
        const res = await fetch('/api/gym', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
        })
        const body = await res.json()
        setSaving(false)
        if (res.ok) {
            setErrors({})
            setMessage('Saved.')
            router.refresh() // the header and colours come from the server, so ask for them again
        } else {
            setErrors(body.fieldErrors ?? {})
            setMessage(body.fieldErrors ? 'Please fix the fields below.' : (body.error ?? 'Could not save.'))
        }
    }

    const field = (key: keyof Values, label: string, type = 'text') => (
        <label className="block">
            <span className="text-sm font-medium">{label}</span>
            <input
                type={type}
                value={values[key]}
                onChange={set(key)}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
            {errors[key]?.map((m) => (
                <span key={m} className="block text-sm text-red-700">
                    {m}
                </span>
            ))}
        </label>
    )

    return (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {field('name', 'Gym name')}
            {field('timeZone', 'Time zone (for example Asia/Jakarta)')}
            {field('brandColor', 'Brand colour (for example #2563eb)')}
            {field('billingHour', 'Daily billing starts after this hour (0 to 23)', 'number')}
            {field('reminderHour', 'Daily reminders start after this hour (0 to 23)', 'number')}
            <button
                type="submit"
                disabled={saving}
                className="rounded px-4 py-2 font-semibold"
                style={{ background: 'var(--brand)', color: 'var(--brand-contrast)' }}
            >
                {saving ? 'Saving…' : 'Save'}
            </button>
            {message && <p role="status">{message}</p>}
        </form>
    )
}