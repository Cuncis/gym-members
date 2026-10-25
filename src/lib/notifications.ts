import type { Prisma } from '@prisma/client'
import { db } from './db'
import { getGym, gymBaseUrl } from './gym'
import {
    CHANNELS,
    renderEmail,
    renderSms,
    type RenderContext,
    type TemplateDataMap,
    type TemplateId,
} from './messages'
import { normalizePhone } from './messaging/phone'
import type { Senders } from './messaging/types'

export const MAX_DELIVERY_ATTEMPTS = 5
// While a message is being sent it is reserved for this long. If the process dies mid-send,
// the message becomes available again after this time.
const RESERVE_MS = 10 * 60_000

// Writes the promise to send, not the sending. Safe to call twice for the same event:
// `key` identifies the event ("receipt:<paymentId>"), and the database refuses a second row for it.
// Returns true when this was new, and false when the same event had already been queued.
export async function queueNotification<T extends TemplateId>(input: {
    userId: string
    template: T
    key: string
    data: TemplateDataMap[T]
}): Promise<boolean> {
    const channels = CHANNELS[input.template]
    const base = { userId: input.userId, template: input.template, data: input.data as unknown as Prisma.InputJsonValue }
    const rows: Prisma.NotificationCreateManyInput[] = []
    if (channels.email) rows.push({ ...base, channel: 'EMAIL', dedupeKey: `${input.key}:email` })
    // Whether this person may be texted is decided when sending, so the log can show why one was skipped.
    if (channels.sms) rows.push({ ...base, channel: 'SMS', dedupeKey: `${input.key}:sms` })

    const result = await db.notification.createMany({ data: rows, skipDuplicates: true })
    return result.count > 0
}

export type DeliveryReport = { examined: number; sent: number; skipped: number; failed: number; retrying: number }

type Outcome =
    | { kind: 'sent'; providerMessageId: string }
    | { kind: 'skipped'; reason: string }
    | { kind: 'failed'; error: string }
    | { kind: 'retry'; error: string }

const clip = (text: string) => text.slice(0, 480)

// Sends everything that is waiting and due. Called after each job, and every ten minutes as a safety net.
// It is "at least once": in rare crashes a message can go out twice, but it is never silently lost.
export async function deliverPending(
    senders: Senders,
    now = new Date(),
    // userIds limits a run to certain people. The proof script uses it so it never touches real data.
    options: { limit?: number; userIds?: string[] } = {},
): Promise<DeliveryReport> {
    const report: DeliveryReport = { examined: 0, sent: 0, skipped: 0, failed: 0, retrying: 0 }

    const due = await db.notification.findMany({
        where: {
            status: 'PENDING',
            nextAttemptAt: { lte: now },
            ...(options.userIds ? { userId: { in: options.userIds } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: options.limit ?? 50,
        include: { user: { select: { name: true, email: true, phone: true, smsOptIn: true } } },
    })
    if (due.length === 0) return report

    const gym = await getGym()
    const ctx: RenderContext = {
        timeZone: gym.timeZone,
        gymName: gym.name,
        appUrl: await gymBaseUrl(gym),
    }

    for (const n of due) {
        // Reserve the message. If two runs overlap, only one of them wins this update.
        const claim = await db.notification.updateMany({
            where: { id: n.id, status: 'PENDING', attempts: n.attempts },
            data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + RESERVE_MS) },
        })
        if (claim.count === 0) continue

        report.examined++
        const attempts = n.attempts + 1

        let outcome: Outcome
        try {
            outcome = await sendOne(n, senders, ctx)
        } catch (error) {
            // Rendering or a bug: the same input will fail the same way, so do not retry.
            outcome = { kind: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
        }

        if (outcome.kind === 'sent') {
            await db.notification.update({
                where: { id: n.id },
                data: { status: 'SENT', providerMessageId: outcome.providerMessageId, sentAt: now, error: null },
            })
            report.sent++
        } else if (outcome.kind === 'skipped') {
            await db.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED', error: clip(outcome.reason) } })
            report.skipped++
        } else if (outcome.kind === 'retry' && attempts < MAX_DELIVERY_ATTEMPTS) {
            // Wait longer each time: 5 minutes, 20 minutes, 45 minutes, 80 minutes.
            const wait = attempts * attempts * 5 * 60_000
            await db.notification.update({
                where: { id: n.id },
                data: { error: clip(outcome.error), nextAttemptAt: new Date(now.getTime() + wait) },
            })
            report.retrying++
        } else {
            await db.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: clip(outcome.error) } })
            report.failed++
        }
    }
    return report
}

type DueNotification = Prisma.NotificationGetPayload<{
    include: { user: { select: { name: true; email: true; phone: true; smsOptIn: true } } }
}>

async function sendOne(n: DueNotification, senders: Senders, ctx: RenderContext): Promise<Outcome> {
    const template = n.template as TemplateId
    const data = n.data as unknown as TemplateDataMap[typeof template]

    if (n.channel === 'SMS') {
        if (!n.user.smsOptIn) return { kind: 'skipped', reason: 'The member has not opted in to texts' }
        const to = n.user.phone ? normalizePhone(n.user.phone) : null
        if (!to) return { kind: 'skipped', reason: 'No usable phone number' }
        const text = renderSms(template, data, ctx)
        if (!text) return { kind: 'skipped', reason: 'This message has no text version' }
        const result = await senders.sms.send({ to, text, idempotencyKey: n.id })
        return result.ok
            ? { kind: 'sent', providerMessageId: result.providerMessageId }
            : { kind: result.retryable ? 'retry' : 'failed', error: result.error }
    }

    const mail = await renderEmail(template, data, ctx)
    const result = await senders.email.send({
        to: n.user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        idempotencyKey: n.id,
    })
    return result.ok
        ? { kind: 'sent', providerMessageId: result.providerMessageId }
        : { kind: result.retryable ? 'retry' : 'failed', error: result.error }
}