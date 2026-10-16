This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Demo accounts (development only)

`pnpm db:seed` creates these accounts. They are skipped when `NODE_ENV=production`. Never use them outside your own computer.

| Role | Email |
|---|---|
| ADMIN | admin@example.com |
| MANAGER | manager@example.com |
| TRAINER | trainer@example.com |
| MEMBER | member@example.com |

Password for all four: `demo-password-123`

## Sign-in and roles

Sign-in uses Auth.js (NextAuth v5) with email and password, plus Google when `AUTH_GOOGLE_ID` and
`AUTH_GOOGLE_SECRET` are set. Sessions are signed cookies (JWT) that last 8 hours.

### Demo accounts (development only, created by `pnpm db:seed`)

| Email | Role | Password |
| --- | --- | --- |
| admin@example.com | ADMIN | demo-password-123 |
| manager@example.com | MANAGER | demo-password-123 |
| trainer@example.com | TRAINER | demo-password-123 |
| member@example.com | MEMBER | demo-password-123 |

### Who can do what

| Action | ADMIN | MANAGER | TRAINER | MEMBER |
| --- | --- | --- | --- | --- |
| Open the members list | yes | yes | yes | no (sent to own profile) |
| Open a member profile | any | any | any | own only |
| Add or edit members | yes | yes | no | no |
| Delete a member | yes (not themselves) | no | no | no |

Rules live in `src/lib/permissions.ts`. They are enforced in pages and API routes; `src/proxy.ts`
only checks that someone is signed in.

### Environment variables

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`, `APP_URL`. See `.env.example`. The Turnstile keys in the example are Cloudflare's
public test keys and must be replaced in production.

### Known limits

- A role change reaches a signed-in user only after their session expires or they sign in again.
- Password reset links are printed to the terminal until real email is added (Project 7).
- A password reset does not sign out sessions that already exist.
- No rate limiting yet on sign-in, sign-up or forgot-password.