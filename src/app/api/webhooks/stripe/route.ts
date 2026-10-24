import { NextRequest, NextResponse } from 'next/server'
import { processPaymentEvent } from '@/lib/billing'
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

    try {
        const result = await processPaymentEvent(event)
        return NextResponse.json({ received: true, result })
    } catch (error) {
        // A 500 makes Stripe retry later. Our work was rolled back, so the retry starts clean.
        console.error('Webhook processing failed', error)
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
}