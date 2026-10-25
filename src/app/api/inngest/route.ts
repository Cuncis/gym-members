import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { functions } from '@/inngest/functions'

// Inngest calls this address to run your functions. In production it proves who it is with a
// signing key (INNGEST_SIGNING_KEY), so this address is deliberately not behind sign-in.
export const { GET, POST, PUT } = serve({ client: inngest, functions })