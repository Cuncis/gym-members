'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { safeRedirect } from '@/lib/redirect'

export type SignInState = { error?: string; email?: string }

export async function signInWithCredentials(_prev: SignInState, formData: FormData): Promise<SignInState> {
    const email = String(formData.get('email') ?? '')

    try {
        await signIn('credentials', {
            email,
            password: String(formData.get('password') ?? ''),
            redirectTo: safeRedirect(String(formData.get('callbackUrl') ?? '')),
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return {
                email,
                error:
                    error.type === 'CredentialsSignin'
                        ? 'Wrong email or password.'
                        : 'Something went wrong. Please try again.',
            }
        }
        // A successful sign-in redirects by throwing a special error. It must be rethrown.
        throw error
    }

    return {}
}

export async function signInWithGoogle(formData: FormData) {
    await signIn('google', { redirectTo: safeRedirect(String(formData.get('callbackUrl') ?? '')) })
}