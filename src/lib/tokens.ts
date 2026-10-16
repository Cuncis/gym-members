import { createHash, randomBytes } from 'node:crypto'

// 32 random bytes as 64 hex characters: impossible to guess.
export const generateToken = () => randomBytes(32).toString('hex')

// What goes in the database. SHA-256 is enough here because the token is already long and random.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')