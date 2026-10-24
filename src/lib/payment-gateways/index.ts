import { FakeGateway } from './fake'
import { stripeGateway } from './stripe'
import type { PaymentGateway } from './types'

let fake: FakeGateway | null = null

export function getGateway(): PaymentGateway {
    if (process.env.PAYMENT_GATEWAY === 'fake') {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('PAYMENT_GATEWAY=fake is not allowed in production')
        }
        fake ??= new FakeGateway()
        return fake
    }
    return stripeGateway
}