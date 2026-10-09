import { GetKeyInfo } from "../../utils/apiWrapper"
import { getS3Session, setS3Session } from "../../api/s3session"
import type { components } from "../../types/openapi"
import type { ProjectSummary } from "../../contexts/ProjectContext"

type BucketInfo = components["schemas"]["GetBucketInfoResponse"]

/** How the browser reaches a bucket over S3. */
export type BucketAccess =
    | { ok: true; bucketName: string; keyName?: string; canWrite: boolean }
    | { ok: false; reason: "noAlias" | "noKey"; message?: string }

function aliasFor(info: BucketInfo, keyId?: string): string | null {
    if (info.globalAliases[0]) return info.globalAliases[0]
    if (!keyId) return null
    return info.keys.find((key) => key.accessKeyId === keyId)?.bucketLocalAliases[0] ?? null
}

/**
 * Picks the S3 identity used to browse a Garage bucket. A project with its
 * own S3 key uses it; otherwise a key allowed on the bucket is chosen (one
 * that can also write when there is one), its secret read through the admin
 * API and kept for the browser session.
 */
export async function resolveBucketAccess(project: ProjectSummary, info: BucketInfo): Promise<BucketAccess> {
    if (project.client_id) {
        const name = aliasFor(info)
        return name ? { ok: true, bucketName: name, canWrite: true } : { ok: false, reason: "noAlias" }
    }

    const readable = info.keys.filter((key) => key.permissions.read)
    const session = getS3Session(project.id)
    const current = session ? readable.find((key) => key.accessKeyId === session.keyId) : undefined
    if (session && current) {
        const name = aliasFor(info, current.accessKeyId)
        if (name) return { ok: true, bucketName: name, keyName: current.name || current.accessKeyId, canWrite: Boolean(current.permissions.write) }
    }

    const candidates = readable
        .filter((key) => aliasFor(info, key.accessKeyId))
        .sort((a, b) => Number(Boolean(b.permissions.write)) - Number(Boolean(a.permissions.write)))
    const chosen = candidates[0]
    if (!chosen) return { ok: false, reason: readable.length ? "noAlias" : "noKey" }

    const key = await GetKeyInfo({ id: chosen.accessKeyId, showSecretKey: true })
    if (!key.secretAccessKey) return { ok: false, reason: "noKey" }
    setS3Session(project.id, { keyId: key.accessKeyId, secret: key.secretAccessKey, name: key.name })
    return { ok: true, bucketName: aliasFor(info, chosen.accessKeyId)!, keyName: key.name || key.accessKeyId, canWrite: Boolean(chosen.permissions.write) }
}

/** Public S3 address of a bucket, path style or virtual host. */
export function bucketUrl(project: ProjectSummary, bucketName: string): string {
    const base = (project.s3_url ?? "").replace(/\/+$/, "")
    if (!base) return bucketName
    if (project.force_path_style !== false) return `${base}/${bucketName}`
    try {
        const url = new URL(base.includes("://") ? base : `https://${base}`)
        return `${url.protocol}//${bucketName}.${url.host}`
    } catch {
        return `${base}/${bucketName}`
    }
}
