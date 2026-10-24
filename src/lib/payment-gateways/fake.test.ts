import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeGateway } from './fake'

const charge = (key: string) => ({
    customerId: 'cus_1',
    paymentMethodId: 'pm_1',
    amountCents: 4900,
    currency: 'usd',
    description: 'Monthly',
    idempotencyKey: key,
    metadata: {},
})

afterEach(() => vi.unstubAllEnvs())

describe('FakeGateway', () => {
    it('charges once per idempotency key', async () => {
        const gateway = new FakeGateway()
        const first = await gateway.charge(charge('key-1'))
        const again = await gateway.charge(charge('key-1'))
        expect(again).toEqual(first)
        expect(gateway.charges).toHaveLength(1)
    })

    it('declines when told to, then charges normally again', async () => {
        const gateway = new FakeGateway()
        gateway.failNextCharge('card_declined')
        const declined = await gateway.charge(charge('key-1'))
        expect(declined).toMatchObject({ ok: false, definite: true, code: 'card_declined' })
        expect((await gateway.charge(charge('key-2'))).ok).toBe(true)
        expect(gateway.charges).toHaveLength(1)
    })

    it('can report an unknown outcome instead of a decline', async () => {
        const gateway = new FakeGateway()
        gateway.failNextCharge('network_error', false)
        expect(await gateway.charge(charge('key-1'))).toMatchObject({ ok: false, definite: false })
    })

    it('refunds once per idempotency key', async () => {
        const gateway = new FakeGateway()
        const input = { providerPaymentId: 'pi_1', amountCents: 1000, idempotencyKey: 'refund-1' }
        const first = await gateway.refund(input)
        const again = await gateway.refund(input)
        expect(again).toEqual(first)
        expect(gateway.refunds).toHaveLength(1)
    })

    it('reports a charge as succeeded only after it happened', async () => {
        const gateway = new FakeGateway()
        expect(await gateway.getStatus('fake_pi_1_key-1')).toBe('pending')
        const result = await gateway.charge(charge('key-1'))
        if (!result.ok) throw new Error('expected the charge to succeed')
        expect(await gateway.getStatus(result.providerPaymentId)).toBe('succeeded')
    })

    it('refuses to parse webhooks in production', () => {
        vi.stubEnv('NODE_ENV', 'production')
        expect(() => new FakeGateway().parseWebhook('{}')).toThrow()
    })
})