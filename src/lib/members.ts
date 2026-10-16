import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { ListQuery } from '@/lib/validation'

export const PAGE_SIZE = 10

export async function listMembers({ page, q, status }: ListQuery) {
    const where: Prisma.UserWhereInput = {
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    }

    const [total, items] = await db.$transaction([
        db.user.count({ where }),
        db.user.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: { _count: { select: { memberships: true } } },
        }),
    ])

    return {
        items,
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    }
}

export async function getMember(id: string) {
    return db.user.findUnique({
        where: { id },
        include: { memberships: { orderBy: { startDate: 'desc' } } },
    })
}