'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DAY_NAMES } from '@/lib/time'

type Trainer = { id: string; name: string }
type FieldName = 'name' | 'description' | 'trainerId' | 'dayOfWeek' | 'startTime' | 'durationMinutes' | 'capacity'
type FieldErrors = Partial<Record<FieldName, string[]>>

type Props = {
    trainers: Trainer[] | null // null: the signed-in user is a trainer and teaches their own classes
    timeZone: string
}

export function ClassForm({ trainers, timeZone }: Props) {
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
        const get = (key: string) => String(data.get(key) ?? '')
        const payload = {
            name: get('name'),
            description: get('description'),
            ...(trainers ? { trainerId: get('trainerId') || undefined } : {}),
            dayOfWeek: get('dayOfWeek'),
            startTime: get('startTime'),
            durationMinutes: get('durationMinutes'),
            capacity: get('capacity'),
        }

        let navigating = false
        try {
            const res = await fetch('/api/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const json = await res.json().catch(() => null)

            if (res.ok) {
                navigating = true
                router.push(`/classes/${json.id}`)
                router.refresh()
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
    const err = (m?: string[]) =>
        m?.length ? <p role="alert" className="mt-1 text-sm text-red-600">{m[0]}</p> : null

    return (
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {formError && (
                <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {formError}
                </p>
            )}

            <div>
                <label htmlFor="name" className="block font-medium">Class name</label>
                <input id="name" name="name" className={input} aria-invalid={!!errors.name} />
                {err(errors.name)}
            </div>

            <div>
                <label htmlFor="description" className="block font-medium">Description (optional)</label>
                <textarea id="description" name="description" rows={3} className={input} />
                {err(errors.description)}
            </div>

            {trainers && (
                <div>
                    <label htmlFor="trainerId" className="block font-medium">Trainer</label>
                    <select id="trainerId" name="trainerId" defaultValue="" className={input} aria-invalid={!!errors.trainerId}>
                        <option value="">Choose a trainer</option>
                        {trainers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    {err(errors.trainerId)}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="dayOfWeek" className="block font-medium">Day</label>
                    <select id="dayOfWeek" name="dayOfWeek" defaultValue="1" className={input}>
                        {DAY_NAMES.slice(1).map((day, i) => (
                            <option key={day} value={i + 1}>{day}</option>
                        ))}
                    </select>
                    {err(errors.dayOfWeek)}
                </div>
                <div>
                    <label htmlFor="startTime" className="block font-medium">Start time</label>
                    <input id="startTime" name="startTime" type="time" className={input} aria-invalid={!!errors.startTime} />
                    {err(errors.startTime)}
                </div>
            </div>
            <p className="-mt-2 text-sm text-neutral-600">Times are in the gym&apos;s time zone ({timeZone}).</p>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="durationMinutes" className="block font-medium">Duration (minutes)</label>
                    <input id="durationMinutes" name="durationMinutes" inputMode="numeric" defaultValue="60" className={input} />
                    {err(errors.durationMinutes)}
                </div>
                <div>
                    <label htmlFor="capacity" className="block font-medium">Capacity</label>
                    <input id="capacity" name="capacity" inputMode="numeric" defaultValue="12" className={input} />
                    {err(errors.capacity)}
                </div>
            </div>

            <button
                type="submit"
                disabled={submitting}
                className="rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
                {submitting ? 'Saving…' : 'Create class'}
            </button>
        </form>
    )
}