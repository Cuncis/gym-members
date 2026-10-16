'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteMemberButton({ id, name }: { id: string; name: string }) {
    const router = useRouter()
    const dialogRef = useRef<HTMLDialogElement>(null)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function confirmDelete() {
        setDeleting(true)
        setError(null)
        try {
            const res = await fetch(`/api/members/${id}`, { method: 'DELETE' })
            // 404 means someone already deleted them, which is the result we wanted anyway.
            if (res.ok || res.status === 404) {
                dialogRef.current?.close()
                router.push('/members')
                router.refresh()
                return
            }
            setError('Could not delete this member. Please try again.')
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        }
        setDeleting(false)
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    setError(null)
                    dialogRef.current?.showModal()
                }}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
            >
                Delete
            </button>

            <dialog
                ref={dialogRef}
                aria-labelledby="delete-title"
                className="m-auto w-full max-w-md rounded-lg p-6 backdrop:bg-black/40"
            >
                <h2 id="delete-title" className="text-lg font-semibold">Delete {name}?</h2>
                <p className="mt-2 text-sm text-neutral-600">
                    This also deletes all of their memberships. This cannot be undone.
                </p>
                {error && (
                    <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={deleting}
                        onClick={() => dialogRef.current?.close()}
                        className="rounded border px-4 py-2"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={deleting}
                        onClick={confirmDelete}
                        className="rounded bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                    >
                        {deleting ? 'Deleting…' : 'Delete member'}
                    </button>
                </div>
            </dialog>
        </>
    )
}