import { Prisma, type Role } from '@prisma/client'
import { z } from 'zod'
import { db } from './db'

export const BOOKING_PAGE_SIZE = 20

const SORTS = ['startsAt', 'member', 'class', 'status', 'bookedAt'] as const
type Sort = (typeof SORTS)[number]

// '?status=' (empty) means "no filter", not an error
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)

export const bookingListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    q: z.string().trim().max(100).optional(),
    status: z.preprocess(emptyToUndefined, z.enum(['BOOKED', 'WAITLISTED', 'CANCELLED']).optional()),
    classId: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
    sort: z.enum(SORTS).default('startsAt'),
    dir: z.enum(['asc', 'desc']).default('asc'),
})

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>

export async function listBookings(query: BookingListQuery, viewer: { role: Role; id: string }) {
    const now = new Date()

    const where: Prisma.GymClassBookingWhereInput = {
        instance: {
            ...(query.when === 'upcoming' ? { startsAt: { gte: now } } : {}),
            ...(query.when === 'past' ? { startsAt: { lt: now } } : {}),
            gymClass: {
                // A trainer only ever sees bookings for their own classes, whatever the URL says.
                ...(viewer.role === 'TRAINER' ? { trainerId: viewer.id } : {}),
                ...(query.classId ? { id: query.classId } : {}),
            },
        },
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { user: { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }] } } : {}),
    }

    // The browser sends a column name; this map is the only way it turns into a database sort.
    const dir = query.dir
    const orderByMap: Record<Sort, Prisma.GymClassBookingOrderByWithRelationInput> = {
        startsAt: { instance: { startsAt: dir } },
        member: { user: { name: dir } },
        class: { instance: { gymClass: { name: dir } } },
        status: { status: dir },
        bookedAt: { createdAt: dir },
    }

    const [total, items] = await db.$transaction([
        db.gymClassBooking.count({ where }),
        db.gymClassBooking.findMany({
            where,
            orderBy: [orderByMap[query.sort], { id: 'asc' }],
            skip: (query.page - 1) * BOOKING_PAGE_SIZE,
            take: BOOKING_PAGE_SIZE,
            include: {
                user: { select: { name: true, email: true } },
                instance: { select: { startsAt: true, gymClass: { select: { name: true } } } },
            },
        }),
    ])

    return {
        items,
        page: query.page,
        pageSize: BOOKING_PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / BOOKING_PAGE_SIZE)),
    }
}