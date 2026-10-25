import { Inngest } from 'inngest'

// One client for the whole app. It sends events and defines functions.
// Locally, INNGEST_DEV=1 makes it talk to the dev server instead of Inngest Cloud.
export const inngest = new Inngest({ id: 'fitnessgm' })