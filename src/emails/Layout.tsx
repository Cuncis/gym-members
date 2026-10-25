import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { ReactNode } from 'react'

// The frame every email shares. Email clients are picky: styles must be inline, and layout is simple.
export function Layout({ preview, gymName, children }: { preview: string; gymName: string; children: ReactNode }) {
    return (
        <Html lang="en">
            <Head />
            <Preview>{preview}</Preview>
            <Body style={{ backgroundColor: '#f5f5f5', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: '24px 0' }}>
                <Container style={{ backgroundColor: '#ffffff', borderRadius: 8, maxWidth: 520, padding: 24 }}>
                    <Text style={{ fontSize: 14, fontWeight: 700, color: '#525252', margin: 0 }}>{gymName}</Text>
                    <Section>{children}</Section>
                    <Hr style={{ borderColor: '#e5e5e5', margin: '24px 0 12px' }} />
                    <Text style={{ fontSize: 12, color: '#737373', margin: 0 }}>
                        You are receiving this because you have a membership at {gymName}.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

export const heading = { fontSize: 20, fontWeight: 700, color: '#171717', margin: '16px 0 8px' } as const
export const paragraph = { fontSize: 15, lineHeight: '22px', color: '#262626', margin: '8px 0' } as const
export const link = { color: '#2563eb' } as const