import { NextRequest, NextResponse } from 'next/server'
import { processPaymentEvent } from '@/lib/billing'
import { rawDb } from '@/lib/raw-db'
import { runInGym } from '@/lib/tenant-context'
import { getGateway } from '@/lib/payment-gateways'

export async function POST(request: NextRequest) {
    // The signature is computed over the exact raw text, so read it as text. Never parse it first.
    const rawBody = await request.text()

    let event
    try {
        event = getGateway().parseWebhook(rawBody, request.headers)
    } catch {
        // A forged or damaged request. Nothing is read from it and nothing is changed.
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Stripe calls one address for every gym, so the address cannot say which gym this is.
    // The bill can: it was created inside a gym, and we put its id in the payment when we started it.
    // This is one of the few places that uses rawDb on purpose, and it only reads one column.
    const bill = event.billingEventId
        ? await rawDb.billingEvent.findUnique({ where: { id: event.billingEventId }, select: { gymId: true } })
        : null
    // A payment this app did not start (or an event type we ignore) has nothing to settle.
    if (!bill) return NextResponse.json({ received: true, result: 'ignored' })

    try {
        const result = await runInGym(bill.gymId, () => processPaymentEvent(event))
        return NextResponse.json({ received: true, result })
    } catch (error) {
        // A 500 makes Stripe retry later. Our work was rolled back, so the retry starts clean.
        console.error('Webhook processing failed', error)
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
}