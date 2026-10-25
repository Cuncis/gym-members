import { mkdir, writeFile } from 'node:fs/promises'
import { TEMPLATES, renderEmail, renderSms, type RenderContext, type TemplateDataMap, type TemplateId } from '../src/lib/messages'

// Writes every email as a web page you can open in a browser, so you can see what members will receive.
// No database and no sending: it only needs the templates.
const ctx: RenderContext = { timeZone: 'America/New_York', gymName: 'Iron Works Gym', appUrl: 'http://localhost:3000' }
const who = { name: 'Alex Rivera', planName: 'Monthly' }
const day = (n: number) => new Date(Date.UTC(2030, 2, 10 + n, 12)).toISOString()

const samples: { [K in TemplateId]: TemplateDataMap[K] } = {
    payment_receipt: { ...who, amountCents: 4900, currency: 'usd', paidAt: day(0), periodEnd: day(31) },
    payment_failed: {
        ...who,
        amountCents: 4900,
        currency: 'usd',
        reason: 'Your card was declined',
        attempt: 1,
        nextRetryAt: day(1),
        endsAt: day(8),
    },
    renewal_reminder: { ...who, amountCents: 4900, currency: 'usd', renewsAt: day(3) },
    pass_ending: { ...who, endsAt: day(2) },
    membership_ended: who,
}

async function main() {
    await mkdir('.email-preview', { recursive: true })
    for (const template of TEMPLATES) {
        const data = samples[template]
        const mail = await renderEmail(template, data as never, ctx)
        await writeFile(`.email-preview/${template}.html`, mail.html)
        const sms = renderSms(template, data as never, ctx)
        console.log(`\n${template}\n  subject: ${mail.subject}\n  text message: ${sms ?? '(none)'}`)
    }
    console.log('\nOpen the files in .email-preview/ in your browser.')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})