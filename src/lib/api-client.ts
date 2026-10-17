export class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
    const res = await fetch(input, init)
    if (res.status === 204) return undefined as T

    const json = await res.json().catch(() => null)

    if (!res.ok) {
        throw new ApiError(json?.error ?? 'Something went wrong. Please try again.', res.status)
    }
    return json as T
}

export function errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : 'Could not reach the server. Check your connection and try again.'
}