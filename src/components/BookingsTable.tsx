'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
    flexRender,
    rowSortingFeature,
    tableFeatures,
    useTable,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table'
import { formatDateTime } from '@/lib/time'

export type BookingRow = {
    id: string
    memberName: string
    memberEmail: string
    className: string
    startsAt: string // ISO date text: dates cannot cross from server to browser as Date objects
    bookedAt: string
    status: 'BOOKED' | 'WAITLISTED' | 'CANCELLED'
    canCancel: boolean
}

// Sorting is done by the database, so only the sorting state feature is needed (no sorted row model).
const features = tableFeatures({ rowSortingFeature })

const badge: Record<BookingRow['status'], string> = {
    BOOKED: 'bg-green-100 text-green-800',
    WAITLISTED: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-neutral-100 text-neutral-600',
}

function CancelButton({ id, name }: { id: string; name: string }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function cancel() {
        if (!window.confirm(`Cancel the booking for ${name}?`)) return
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
            if (res.ok) {
                router.refresh()
                return
            }
            const json = await res.json().catch(() => null)
            setError(json?.error ?? 'Could not cancel')
            if (res.status === 409) router.refresh()
        } catch {
            setError('Could not reach the server')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div>
            <button type="button" onClick={cancel} disabled={busy} className="rounded border px-2 py-1 text-xs disabled:opacity-60">
                {busy ? 'Cancelling…' : 'Cancel'}
            </button>
            {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    )
}

type Props = {
    rows: BookingRow[]
    timeZone: string
    sort: string
    dir: 'asc' | 'desc'
}

export function BookingsTable({ rows, timeZone, sort, dir }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // The column ids below are the same words the server accepts in ?sort=
    const columns = useMemo<ColumnDef<typeof features, BookingRow>[]>(
        () => [
            { id: 'class', header: 'Class', cell: ({ row }) => <span className="font-medium">{row.original.className}</span> },
            {
                id: 'startsAt',
                header: 'Session',
                cell: ({ row }) => formatDateTime(new Date(row.original.startsAt), timeZone),
            },
            {
                id: 'member',
                header: 'Member',
                cell: ({ row }) => (
                    <div>
                        <div className="font-medium">{row.original.memberName}</div>
                        <div className="text-neutral-600">{row.original.memberEmail}</div>
                    </div>
                ),
            },
            {
                id: 'status',
                header: 'Status',
                cell: ({ row }) => (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[row.original.status]}`}>
                        {row.original.status}
                    </span>
                ),
            },
            {
                id: 'bookedAt',
                header: 'Booked',
                cell: ({ row }) => formatDateTime(new Date(row.original.bookedAt), timeZone),
            },
            {
                id: 'actions',
                header: () => <span className="sr-only">Actions</span>,
                enableSorting: false,
                cell: ({ row }) =>
                    row.original.canCancel ? <CancelButton id={row.original.id} name={row.original.memberName} /> : null,
            },
        ],
        [timeZone],
    )

    const sorting: SortingState = [{ id: sort, desc: dir === 'desc' }]

    const table = useTable({
        features,
        data: rows,
        columns,
        getRowId: (row) => row.id,
        state: { sorting },
        manualSorting: true, // the database sorts, not the browser
        enableSortingRemoval: false, // clicking cycles ascending and descending only
        sortDescFirst: false,
        onSortingChange: (updater) => {
            const next = typeof updater === 'function' ? updater(sorting) : updater
            const column = next[0]
            if (!column) return
            const params = new URLSearchParams(searchParams.toString())
            params.set('sort', column.id)
            params.set('dir', column.desc ? 'desc' : 'asc')
            params.delete('page') // a new sort order starts from page 1
            router.push(`${pathname}?${params.toString()}`)
        },
    })

    return (
        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-300">
            <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50">
                    {table.getHeaderGroups().map((group) => (
                        <tr key={group.id}>
                            {group.headers.map((header) => {
                                const sorted = header.column.getIsSorted()
                                return (
                                    <th
                                        key={header.id}
                                        scope="col"
                                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                                        className="px-3 py-2 font-semibold"
                                    >
                                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                                            <button
                                                type="button"
                                                onClick={header.column.getToggleSortingHandler()}
                                                className="inline-flex items-center gap-1 hover:underline"
                                            >
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                <span aria-hidden="true" className="text-xs">
                                                    {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : ''}
                                                </span>
                                            </button>
                                        ) : (
                                            flexRender(header.column.columnDef.header, header.getContext())
                                        )}
                                    </th>
                                )
                            })}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-t border-neutral-200 align-top">
                            {row.getAllCells().map((cell) => (
                                <td key={cell.id} className="px-3 py-2">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}