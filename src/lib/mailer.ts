export async function sendPasswordResetEmail(to: string, link: string) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('No email provider is configured yet (added in Project 7)')
    }
    console.log(`\n[dev email] Password reset for ${to}:\n${link}\n`)
}