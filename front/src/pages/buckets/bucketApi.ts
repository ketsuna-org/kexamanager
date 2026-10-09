import { getBucketUsage, getStorageOverview, listS3Buckets, s3ApiRequest } from "../../api/storage"
import { AllowBucketKey, CreateBucket, DeleteBucket } from "../../utils/apiWrapper"

/** One row of the bucket list, whatever the project type. */
export interface BucketRow {
    /** Route id: Garage id with the admin API, otherwise the bucket name. */
    id: string
    name: string
    globalAliases: string[]
    created: string | null
    objects: number | null
    bytes: number | null
    /** `false` when the S3 scan stopped early: counters are lower bounds. */
    complete: boolean
    quotaPercent: number | null
    quotaMaxSize: number | null
    keyCount: number | null
    website: boolean | null
    error: string | null
}

export async function loadBuckets(projectId: number, hasAdmin: boolean): Promise<BucketRow[]> {
    if (hasAdmin) {
        const overview = await getStorageOverview(projectId)
        return overview.buckets.map((b) => ({
            id: b.id,
            name: b.name,
            globalAliases: b.globalAliases,
            created: b.created,
            objects: b.statsAvailable ? b.objects : null,
            bytes: b.statsAvailable ? b.bytes : null,
            complete: true,
            quotaPercent: b.quotaUsagePercent,
            quotaMaxSize: b.quotas?.maxSize ?? null,
            keyCount: b.keyCount ?? null,
            website: b.websiteAccess ?? null,
            error: b.statsError,
        }))
    }
    const buckets = await listS3Buckets(projectId)
    const usage = buckets.length ? await getBucketUsage(projectId, buckets.map((b) => b.name)).catch(() => null) : null
    const byName = new Map(usage?.buckets.map((u) => [u.name, u]) ?? [])
    return buckets.map((b) => {
        const u = byName.get(b.name)
        return {
            id: b.name,
            name: b.name,
            globalAliases: [b.name],
            created: b.creationDate ?? null,
            objects: u && !u.error ? u.objects : null,
            bytes: u && !u.error ? u.bytes : null,
            complete: u ? u.complete : true,
            quotaPercent: null,
            quotaMaxSize: null,
            keyCount: null,
            website: null,
            error: u?.error ?? null,
        }
    })
}

export interface NewBucket {
    name: string
    /** Optional key given access right away (Garage admin only). */
    keyId?: string
    read?: boolean
    write?: boolean
}

/** Creates a bucket and returns its route id. */
export async function createBucket(projectId: number, hasAdmin: boolean, input: NewBucket): Promise<string> {
    if (!hasAdmin) {
        await s3ApiRequest("create-bucket", { bucket: input.name }, projectId)
        return input.name
    }
    const created = await CreateBucket({ globalAlias: input.name })
    if (input.keyId) {
        await AllowBucketKey({ bucketId: created.id, accessKeyId: input.keyId, permissions: { read: input.read ?? true, write: input.write ?? false, owner: false } })
    }
    return created.id
}

export async function deleteBucket(projectId: number, hasAdmin: boolean, row: { id: string; name: string }): Promise<void> {
    if (hasAdmin) {
        await DeleteBucket({ id: row.id })
        return
    }
    await s3ApiRequest("delete-bucket", { bucket: row.name }, projectId)
}

/** Garage bucket names: 3-63 chars, lowercase letters, digits, dots and dashes. */
export function isValidBucketName(name: string): boolean {
    return /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)
}
