'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'

export type PlanDto = {
    id: string
    name: string
    description: string | null
    priceCents: number
    currency: string
    kind: 'RECURRING' | 'ONE_TIME'
    interval: 'MONTH' | 'YEAR' | null
    durationDays: number | null
}

type Quote = { listPriceCents: number; discountCents: number; totalCents: number; currency: string; code: string | null }
type QuoteState = Quote | { error: string }

function periodText(plan: PlanDto): string {
    if (plan.kind === 'RECURRING') return plan.interval === 'YEAR' ? 'per year' : 'per month'
    return `for ${plan.durationDays} ${plan.durationDays === 1 ? 'day' : 'days'}`
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export function PlanPicker({ plans }: { plans: PlanDto[] }) {
    const [code, setCode] = useState('')
    const [appliedCode, setAppliedCode] = useState('')
    const [quotes, setQuotes] = useState<Record<string, QuoteState>>({})
    const [applying, setApplying] = useState(false)
    const [buying, setBuying] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Coming back with the Back button from the payment page restores this page from memory,
    // including a stuck "Redirecting…" button. Reset it.
    useEffect(() => {
        const reset = (event: PageTransitionEvent) => {
            if (event.persisted) setBuying(null)
        }
        window.addEventListener('pageshow', reset)
        return () => window.removeEventListener('pageshow', reset)
    }, [])

    async function applyCode(event: FormEvent) {
        event.preventDefault()
        const trimmed = code.trim()
        setError(null)
        if (!trimmed) {
            setAppliedCode('')
            setQuotes({})
            return
        }

        setApplying(true)
        const entries = await Promise.all(
            plans.map(async (plan): Promise<[string, QuoteState]> => {
                try {
                    const quote = await apiFetch<Quote>('/api/checkout/preview', {
                        method: 'POST',
                        headers: jsonHeaders,
                        body: JSON.stringify({ planId: plan.id, code: trimmed }),
                    })
                    return [plan.id, quote]
                } catch (e) {
                    return [plan.id, { error: errorMessage(e) }]
                }
            }),
        )
        setQuotes(Object.fromEntries(entries))

        const failed = entries.map(([, state]) => state).filter((state): state is { error: string } => 'error' in state)
        if (failed.length === entries.length) {
            setAppliedCode('')
            setError(failed[0]?.error ?? 'This code cannot be used')
        } else {
            setAppliedCode(trimmed)
        }
        setApplying(false)
    }

    async function buy(planId: string) {
        setBuying(planId)
        setError(null)
        try {
            const result = await apiFetch<{ url: string }>('/api/checkout', {
                method: 'POST',
                headers: jsonHeaders,
                // The server works the price out again from the code. The browser never sends a price.
                body: JSON.stringify({ planId, code: appliedCode || undefined }),
            })
            window.location.assign(result.url)
        } catch (e) {
            setError(errorMessage(e))
            setBuying(null)
        }
    }

    return (
        <div>
            <form onSubmit={applyCode} className="mt-6 flex flex-wrap items-end gap-2">
                <div>
                    <label htmlFor="code" className="block text-sm font-medium">Promo code</label>
                    <input
                        id="code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        autoComplete="off"
                        className="mt-1 rounded border border-neutral-300 px-3 py-2 uppercase"
                    />
                </div>
                <button type="submit" disabled={applying} className="rounded border px-4 py-2 disabled:opacity-60">
                    {applying ? 'Checking…' : 'Apply'}
                </button>
                {appliedCode && <span className="pb-2 text-sm text-green-700">Code {appliedCode.toUpperCase()} applied</span>}
            </form>

            {error && (
                <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </p>
            )}

            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
                {plans.map((plan) => {
                    const quote = quotes[plan.id]
                    return (
                        <li key={plan.id} className="flex flex-col rounded-lg border border-neutral-300 p-4">
                            <h2 className="text-lg font-semibold">{plan.name}</h2>
                            {plan.description && <p className="mt-1 text-sm text-neutral-600">{plan.description}</p>}

                            <p className="mt-4">
                                {quote && 'totalCents' in quote ? (
                                    <>
                                        <s className="text-neutral-500">{formatMoney(plan.priceCents, plan.currency)}</s>{' '}
                                        <span className="text-3xl font-extrabold">{formatMoney(quote.totalCents, plan.currency)}</span>
                                    </>
                                ) : (
                                    <span className="text-3xl font-extrabold">{formatMoney(plan.priceCents, plan.currency)}</span>
                                )}{' '}
                                <span className="text-sm text-neutral-600">{periodText(plan)}</span>
                            </p>

                            {quote && 'totalCents' in quote && plan.kind === 'RECURRING' && (
                                <p className="mt-1 text-xs text-neutral-600">
                                    The code applies to the first payment. After that it is {formatMoney(plan.priceCents, plan.currency)}.
                                </p>
                            )}
                            {quote && 'error' in quote && <p className="mt-1 text-xs text-red-600">{quote.error}</p>}

                            <button
                                type="button"
                                onClick={() => buy(plan.id)}
                                disabled={buying !== null}
                                className="mt-auto rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
                            >
                                {buying === plan.id ? 'Redirecting…' : 'Buy'}
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}