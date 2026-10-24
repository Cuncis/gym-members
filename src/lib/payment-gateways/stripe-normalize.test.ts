import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { normalizeStripeEvent } from './stripe-normalize'

// A minimal stand-in for a Stripe event: only the fields the normalizer reads.
const stripeEvent = (type: string, object: Record<string, unknown>) =>
    ({ id: 'evt_1', type, data: { object } }) as unknown as Stripe.Event

describe('normalizeStripeEvent', () => {
    it('turns a succeeded payment into our own event', () => {
        const event = normalizeStripeEvent(
            stripeEvent('payment_intent.succeeded', {
                id: 'pi_1',
                amount: 4410,
                payment_method: 'pm_1',
                metadata: { billingEventId: 'bill_1' },
            }),
        )
        expect(event).toEqual({
            id: 'evt_1',
            provider: 'stripe',
            type: 'payment.succeeded',
            billingEventId: 'bill_1',
            providerPaymentId: 'pi_1',
            paymentMethodId: 'pm_1',
            amountCents: 4410,
        })
    })

    it('reads the payment method whether it arrives as an id or an object', () => {
        const event = normalizeStripeEvent(
            stripeEvent('payment_intent.succeeded', { id: 'pi_1', amount: 100, payment_method: { id: 'pm_9' }, metadata: {} }),
        )
        expect(event.paymentMethodId).toBe('pm_9')
    })

    it('leaves billingEventId empty for payments this app did not start', () => {
        const event = normalizeStripeEvent(stripeEvent('payment_intent.succeeded', { id: 'pi_1', amount: 100, metadata: {} }))
        expect(event.billingEventId).toBeUndefined()
    })

    it('turns a failed payment into our own event with the reason', () => {
        const event = normalizeStripeEvent(
            stripeEvent('payment_intent.payment_failed', {
                id: 'pi_2',
                metadata: { billingEventId: 'bill_2' },
                last_payment_error: { message: 'Your card was declined.' },
            }),
        )
        expect(event.type).toBe('payment.failed')
        expect(event.billingEventId).toBe('bill_2')
        expect(event.failureMessage).toBe('Your card was declined.')
    })

    it('ignores every other event type', () => {
        for (const type of ['checkout.session.completed', 'charge.refunded', 'customer.created']) {
            expect(normalizeStripeEvent(stripeEvent(type, {})).type).toBe('ignored')
        }
    })
})