import { describe, expect, it, vi } from 'vitest'
import type { Resend } from 'resend'
import { FakeSender } from './fake'
import { resendSender } from './resend'
import { telnyxSender } from './telnyx'

const message = { to: '+15552345678', text: 'Hello', idempotencyKey: 'n1' }

describe('FakeSender', () => {
    it('sends once per idempotency key', async () => {
        const sender = new FakeSender()
        const a = await sender.send(message)
        const b = await sender.send(message)
        expect(a).toEqual(b)
        expect(sender.sent).toHaveLength(1)
    })

    it('fails on request and lets a retry with the same key succeed', async () => {
        const sender = new FakeSender()
        sender.failNext(true)
        expect(await sender.send(message)).toMatchObject({ ok: false, retryable: true })
        expect(await sender.send(message)).toMatchObject({ ok: true })
        expect(sender.sent).toHaveLength(1)
    })
})

describe('resendSender', () => {
    const clientReturning = (result: unknown) => {
        const send = vi.fn(async () => result)
        return { client: { emails: { send } } as unknown as Pick<Resend, 'emails'>, send }
    }

    it('sends the key as the idempotency key and returns the message id', async () => {
        const { client, send } = clientReturning({ data: { id: 'em_1' }, error: null })
        const result = await resendSender(client, 'Gym <gym@example.com>').send({ ...message, to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>' })
        expect(result).toEqual({ ok: true, providerMessageId: 'em_1' })
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ from: 'Gym <gym@example.com>', to: 'a@b.com', subject: 'Hi' }),
            { idempotencyKey: 'n1' },
        )
    })

    it('treats a busy provider as retryable and a rejected address as final', async () => {
        const busy = clientReturning({ data: null, error: { name: 'rate_limit_exceeded', message: 'Slow down', statusCode: 429 } })
        expect(await resendSender(busy.client, 'x').send(message)).toMatchObject({ ok: false, retryable: true })
        const bad = clientReturning({ data: null, error: { name: 'validation_error', message: 'Bad address', statusCode: 422 } })
        expect(await resendSender(bad.client, 'x').send(message)).toMatchObject({ ok: false, retryable: false, error: 'Bad address' })
    })

    it('treats a thrown network error as retryable', async () => {
        const client = { emails: { send: vi.fn(async () => { throw new Error('socket hang up') }) } } as unknown as Pick<Resend, 'emails'>
        expect(await resendSender(client, 'x').send(message)).toMatchObject({ ok: false, retryable: true, error: 'socket hang up' })
    })
})

describe('telnyxSender', () => {
    const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

    it('posts the text with the bearer key and returns the message id', async () => {
        const fetchImpl = reply(200, { data: { id: 'tx_1' } })
        const sender = telnyxSender({ apiKey: 'KEY', from: '+15550000000', messagingProfileId: 'prof', fetchImpl })
        expect(await sender.send(message)).toEqual({ ok: true, providerMessageId: 'tx_1' })

        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('https://api.telnyx.com/v2/messages')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer KEY')
        expect(JSON.parse(init.body as string)).toEqual({
            from: '+15550000000',
            to: '+15552345678',
            text: 'Hello',
            messaging_profile_id: 'prof',
        })
    })

    it('does not retry a rejected number, but retries a busy or broken provider', async () => {
        const rejected = telnyxSender({ apiKey: 'K', from: '+1', fetchImpl: reply(422, { errors: [{ title: 'Invalid number', detail: 'Not a mobile' }] }) })
        expect(await rejected.send(message)).toEqual({ ok: false, retryable: false, error: 'Invalid number: Not a mobile' })
        const busy = telnyxSender({ apiKey: 'K', from: '+1', fetchImpl: reply(429, { errors: [] }) })
        expect(await busy.send(message)).toMatchObject({ ok: false, retryable: true })
        const broken = telnyxSender({ apiKey: 'K', from: '+1', fetchImpl: reply(503, {}) })
        expect(await broken.send(message)).toMatchObject({ ok: false, retryable: true })
    })

    it('retries when the network fails', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
        expect(await telnyxSender({ apiKey: 'K', from: '+1', fetchImpl }).send(message)).toMatchObject({ ok: false, retryable: true })
    })
})