import { Suspense } from 'react'
import { DomainManager } from '@/components/DomainManager'
import { listDomains, verifyRecordName, verifyRecordValue } from '@/lib/domains'
import { requirePageRole } from '@/lib/guards'
import { rootHostname } from '@/lib/host'
import { ADMIN_ROLES } from '@/lib/permissions'

async function Content() {
    await requirePageRole(ADMIN_ROLES, '/admin/domains')
    const domains = await listDomains()

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-3xl font-bold">Domains</h1>
            <p className="mt-2 text-sm text-neutral-600">
                Use your own address, such as members.yourgym.com. Add it here, create the DNS records shown, then press Verify.
                Also point the domain at {rootHostname()} with a CNAME record.
            </p>
            <DomainManager
                domains={domains.map((d) => ({
                    id: d.id,
                    hostname: d.hostname,
                    verified: d.verifiedAt !== null,
                    recordName: verifyRecordName(d.hostname),
                    recordValue: verifyRecordValue(d.verifyToken),
                }))}
            />
        </main>
    )
}

export default function DomainsPage() {
    return (
        <Suspense fallback={<p className="p-6">Loading…</p>}>
            <Content />
        </Suspense>
    )
}
