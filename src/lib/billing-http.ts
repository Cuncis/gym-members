import { NextResponse } from 'next/server'
import { BillingError } from './billing'

export function billingErrorResponse(error: unknown) {
    if (error instanceof BillingError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error(error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function readJson(
    request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
    try {
        return { ok: true, body: await request.json() }
    } catch {
        return { ok: false, response: NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 }) }
    }
}