import { Layout, heading, link, paragraph } from './Layout'
import { Text } from '@react-email/components'

// Every prop is plain text that is already formatted ("$49.00", "Mar 14, 2027").
// Formatting happens once, in src/lib/messages.ts, so these files only describe layout.
type Base = { name: string; planName: string; gymName: string; billingUrl: string }

export function PaymentReceipt(p: Base & { amount: string; paidOn: string; nextDate: string | null }) {
    return (
        <Layout preview={`Payment received: ${p.amount}`} gymName={p.gymName}>
            <Text style={heading}>Payment received</Text>
            <Text style={paragraph}>Hi {p.name},</Text>
            <Text style={paragraph}>
                We received {p.amount} for your {p.planName} membership on {p.paidOn}. Thank you!
            </Text>
            {p.nextDate && <Text style={paragraph}>Your membership is paid through {p.nextDate}.</Text>}
            <Text style={paragraph}>
                <a href={p.billingUrl} style={link}>View your billing history</a>
            </Text>
        </Layout>
    )
}

export function PaymentFailed(
    p: Base & { amount: string; reason: string; nextRetry: string | null; endsOn: string },
) {
    return (
        <Layout preview={`We could not charge ${p.amount}`} gymName={p.gymName}>
            <Text style={heading}>We could not take your payment</Text>
            <Text style={paragraph}>Hi {p.name},</Text>
            <Text style={paragraph}>
                We tried to charge {p.amount} for your {p.planName} membership, but it did not go through ({p.reason}).
            </Text>
            {p.nextRetry ? (
                <Text style={paragraph}>
                    We will try again on {p.nextRetry}. Your membership stays active until then. If your card has changed,
                    please contact the gym.
                </Text>
            ) : (
                <Text style={paragraph}>
                    This was our last attempt. Unless the payment is fixed, your membership will end on {p.endsOn}. Please
                    contact the gym as soon as you can.
                </Text>
            )}
            <Text style={paragraph}>
                <a href={p.billingUrl} style={link}>View your billing page</a>
            </Text>
        </Layout>
    )
}

export function RenewalReminder(p: Base & { amount: string; renewsOn: string }) {
    return (
        <Layout preview={`Your membership renews on ${p.renewsOn}`} gymName={p.gymName}>
            <Text style={heading}>Your membership renews soon</Text>
            <Text style={paragraph}>Hi {p.name},</Text>
            <Text style={paragraph}>
                Your {p.planName} membership renews on {p.renewsOn}. We will charge {p.amount} to the card on file.
            </Text>
            <Text style={paragraph}>
                <a href={p.billingUrl} style={link}>Manage your membership</a>
            </Text>
        </Layout>
    )
}

export function PassEnding(p: Base & { endsOn: string }) {
    return (
        <Layout preview={`Your membership ends on ${p.endsOn}`} gymName={p.gymName}>
            <Text style={heading}>Your membership ends soon</Text>
            <Text style={paragraph}>Hi {p.name},</Text>
            <Text style={paragraph}>
                Your {p.planName} membership ends on {p.endsOn}. It will not renew by itself.
            </Text>
            <Text style={paragraph}>
                <a href={p.billingUrl} style={link}>Choose a plan to keep training</a>
            </Text>
        </Layout>
    )
}

export function MembershipEnded(p: Base) {
    return (
        <Layout preview="Your membership has ended" gymName={p.gymName}>
            <Text style={heading}>Your membership has ended</Text>
            <Text style={paragraph}>Hi {p.name},</Text>
            <Text style={paragraph}>
                We could not collect payment for your {p.planName} membership after several tries, so it has ended. You are
                welcome back any time.
            </Text>
            <Text style={paragraph}>
                <a href={p.billingUrl} style={link}>See the plans</a>
            </Text>
        </Layout>
    )
}