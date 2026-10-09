// Single access layer for the storage feature: every storage call of the app
// goes through this module, nothing else is allowed to build storage URLs.
//
// Two transport styles coexist on purpose:
// - `/api/{project}/capabilities` and `/api/{project}/stats/*` are project-scoped
//   aggregate routes of the proxy. They go through the shared admin client
//   (`adminGet(path, { projectId })`), which emits `/api/{project}{path}` for any
//   path outside `/v2` and `/s3`. Authentication and error handling therefore
//   have a single implementation, like every other call of the app.
// - `/api/{project}/s3/*` keeps the legacy POST contract and reuses
//   `s3ApiRequest`, extracted from S3Browser so there is exactly one definition.

import { adminGet, getAuthToken } from "../utils/adminClient"
import { getS3Session } from "./s3session"
import type {
    BucketConfig,
    BucketUsage,
    BucketUsageEntry,
    Capabilities,
    ClusterOverview,
    CopyObjectResult,
    DeleteObjectsResult,
    ObjectListing,
    ObjectStat,
    StorageOverview,
} from "./types"

export type {
    AdminCapabilities,
    BucketAlias,
    BucketConfig,
    BucketConfigFeature,
    BucketQuotas,
    BucketStat,
    BucketUsage,
    BucketUsageEntry,
    BucketUsageTotals,
    Capabilities,
    ClusterHealth,
    ClusterNode,
    ClusterOverview,
    ClusterStatistics,
    CopyObjectResult,
    DeleteObjectsError,
    DeleteObjectsResult,
    ObjectEntry,
    ObjectListing,
    ObjectStat,
    S3Capabilities,
    StorageOverview,
    StorageTotals,
} from "./types"

const API_BASE = "/api"

function readStoredS3Value(storageKey: string): string | null {
    try {
        return sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)
    } catch {
        return null
    }
}

/** Access key id stored by the S3 screens for the active project. */
export function getStoredS3KeyId(): string | null {
    return readStoredS3Value("kexamanager:s3:keyId")
}

/** Secret access key stored by the S3 screens for the active project. */
export function getStoredS3Token(): string | null {
    return readStoredS3Value("kexamanager:s3:secretAccessKey")
}

/**
 * Key sent with an S3 request: the project's session key first (see
 * `s3session.ts`), then the key stored by the previous interface. Both are
 * empty for projects whose configuration carries its own key.
 */
export function s3RequestCredentials(configId?: number): { keyId: string | null; token: string | null } {
    const session = configId ? getS3Session(configId) : null
    if (session) return { keyId: session.keyId, token: session.secret }
    return { keyId: getStoredS3KeyId(), token: getStoredS3Token() }
}

function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const jwtToken = getAuthToken()
    if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`
    return headers
}

async function errorMessageFrom(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: string; message?: string; details?: string }
        const reason = body.error || body.message
        if (reason) return body.details ? `${reason}: ${body.details}` : reason
    } catch {
        // non-JSON error body: fall back to the status line below
    }
    return `API request failed: ${response.status} ${response.statusText}`
}

/**
 * POST `/api/{configId}/s3/{endpoint}` with the stored S3 credentials and the
 * user JWT, exactly as the S3 screens always did. Extracted from S3Browser so
 * the contract has a single definition; `configId` is also echoed in the body
 * (part of the frozen request contract).
 */
export async function s3ApiRequest<T>(endpoint: string, body: unknown, configId?: number): Promise<T> {
    const { keyId, token } = s3RequestCredentials(configId)
    const baseUrl = configId ? `${API_BASE}/${configId}/s3` : `${API_BASE}/s3`
    const payload: Record<string, unknown> = {
        keyId,
        token,
        ...(body as Record<string, unknown> | undefined),
    }
    if (configId) payload.configId = configId
    const response = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(await errorMessageFrom(response))
    return (await response.json()) as T
}

export function getCapabilities(projectId: number): Promise<Capabilities> {
    return adminGet<Capabilities>("/capabilities", { projectId, timeoutMs: 10_000 })
}

export function getStorageOverview(projectId: number): Promise<StorageOverview> {
    return adminGet<StorageOverview>("/stats/buckets", { projectId })
}

export function getClusterOverview(projectId: number): Promise<ClusterOverview> {
    return adminGet<ClusterOverview>("/stats/cluster", { projectId })
}

/**
 * POST `/api/{project}/s3/bucket-usage`: per-bucket counters measured over S3
 * alone, so it works for every project type, with or without the Garage admin
 * API. The scan is bounded server side (`maxObjectsPerBucket`/`maxBuckets`); a
 * bucket that hit a cap comes back `complete: false` (its counters are lower
 * bounds) and a bucket that could not be read at all comes back with `error`.
 */
export interface S3BucketSummary {
    name: string
    creationDate?: string | null
}

/**
 * POST `/api/{project}/s3/list-buckets`: the pure S3 listing, the only one a
 * project without Garage admin can answer - the admin `ListBuckets` endpoint
 * (`GET /v2/ListBuckets`) has no answer there. Credentials are resolved server
 * side from the project configuration.
 */
export async function listS3Buckets(projectId: number): Promise<S3BucketSummary[]> {
    const response = await s3ApiRequest<{ buckets?: S3BucketSummary[] }>("list-buckets", {}, projectId)
    return response.buckets ?? []
}

export function getBucketUsage(projectId: number, buckets?: string[]): Promise<BucketUsage> {
    const body: Record<string, unknown> = {}
    if (buckets && buckets.length > 0) body.buckets = buckets
    return s3ApiRequest<BucketUsage>("bucket-usage", body, projectId)
}

/**
 * POST `/api/{project}/s3/bucket-config`: what the bucket says about itself
 * (location, versioning, tagging, lifecycle, CORS, encryption). Each feature is
 * probed independently and answers `supported: false` when the bucket does not
 * implement it: callers display only the supported ones.
 */
export function getBucketConfig(projectId: number, bucket: string): Promise<BucketConfig> {
    return s3ApiRequest<BucketConfig>("bucket-config", { bucket }, projectId)
}

export interface ListObjectsBody {
    bucket: string
    prefix?: string
    delimiter?: string
    maxKeys?: number
    continuationToken?: string
}

export interface StatObjectBody {
    bucket: string
    key: string
}

export interface CopyObjectBody {
    sourceBucket: string
    sourceKey: string
    destinationBucket: string
    destinationKey: string
}

export interface DeleteObjectsBody {
    bucket: string
    keys: string[]
}

export interface PresignBody {
    bucket: string
    key: string
    /** Validity in seconds; omitted = 15 minutes. */
    expiresIn?: number
    /** Ask the browser to download instead of displaying. */
    download?: boolean
}

export function presignObject(projectId: number, body: PresignBody): Promise<{ presignedUrl: string; expiresAt?: string }> {
    return s3ApiRequest("get-object", body, projectId)
}

export function listObjects(projectId: number, body: ListObjectsBody): Promise<ObjectListing> {
    return s3ApiRequest<ObjectListing>("list-objects", body, projectId)
}

export function statObject(projectId: number, body: StatObjectBody): Promise<ObjectStat> {
    return s3ApiRequest<ObjectStat>("stat-object", body, projectId)
}

export function copyObject(projectId: number, body: CopyObjectBody): Promise<CopyObjectResult> {
    return s3ApiRequest<CopyObjectResult>("copy-object", body, projectId)
}

export function deleteObjects(projectId: number, body: DeleteObjectsBody): Promise<DeleteObjectsResult> {
    return s3ApiRequest<DeleteObjectsResult>("delete-objects", body, projectId)
}

// ---------------------------------------------------------------------------
// Pure helpers: no network, no React. They exist so the explorer does not
// re-invent prefix arithmetic in every component, and they are unit tested.
// ---------------------------------------------------------------------------

export interface BreadcrumbSegment {
    label: string
    prefix: string
}

/**
 * Splits an S3 prefix into clickable segments.
 * `"releases/v2/"` → `[{label:"releases",prefix:"releases/"},{label:"v2",prefix:"releases/v2/"}]`.
 * The root prefix yields an empty list.
 */
export function buildBreadcrumb(prefix: string): BreadcrumbSegment[] {
    const segments = prefix.split("/").filter((segment) => segment.length > 0)
    const out: BreadcrumbSegment[] = []
    let accumulated = ""
    for (const segment of segments) {
        accumulated += `${segment}/`
        out.push({ label: segment, prefix: accumulated })
    }
    return out
}

/**
 * Appends a name to a prefix without ever producing a double slash.
 * `("releases/", "v2/")` → `"releases/v2/"`, `("", "a.zip")` → `"a.zip"`.
 */
export function joinPrefix(prefix: string, name: string): string {
    const cleanName = name.replace(/^\/+/, "")
    if (!prefix) return cleanName
    const base = prefix.endsWith("/") ? prefix : `${prefix}/`
    return cleanName ? `${base}${cleanName}` : base
}

/**
 * Prefix of the parent level. Root stays root.
 * `"releases/v2/"` → `"releases/"`, `"releases/"` → `""`.
 */
export function parentPrefix(prefix: string): string {
    const trimmed = prefix.replace(/\/+$/, "")
    const index = trimmed.lastIndexOf("/")
    return index === -1 ? "" : `${trimmed.slice(0, index)}/`
}

/**
 * Quota usage in percent, or `null` when no maximum is configured (a missing
 * quota must never render as a 0 % bar).
 */
export function quotaPercent(quotas: { maxSize: number | null } | null | undefined, bytes: number): number | null {
    const maxSize = quotas?.maxSize
    if (maxSize === null || maxSize === undefined || !Number.isFinite(maxSize) || maxSize <= 0) return null
    if (!Number.isFinite(bytes)) return null
    return Math.round((bytes / maxSize) * 1000) / 10
}

export interface SortableEntry {
    kind: "prefix" | "object"
    name: string
}

/** Directories first, then objects, each group alphabetical (case insensitive). */
export function sortEntries<T extends SortableEntry>(entries: readonly T[]): T[] {
    return [...entries].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "prefix" ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name)
    })
}

/** Normalises an unknown thrown value into a displayable message. */
export function toErrorMessage(error: unknown): string {
    if (typeof error === "string") return error
    if (error instanceof Error) return error.message
    if (typeof error === "object" && error !== null && "message" in error) {
        const value = (error as { message?: unknown }).message
        if (typeof value === "string") return value
    }
    return String(error)
}

/**
 * Prefixes an already formatted counter with the `>=` marker when the
 * measurement stopped before the end of the bucket. A bounded scan only yields a
 * lower bound, and rendering it as an exact value would be a lie.
 */
export function boundedValue(text: string, complete: boolean): string {
    return complete ? text : `≥ ${text}`
}

/**
 * Entry of a `bucket-usage` aggregate for one bucket of the listing: the listing
 * exposes the bucket id while the aggregate reports names, so the id is tried
 * first and then every alias of the bucket.
 */
export function matchUsageEntry(
    names: Iterable<string>,
    byName: ReadonlyMap<string, BucketUsageEntry>,
): BucketUsageEntry | undefined {
    for (const name of names) {
        const entry = byName.get(name)
        if (entry) return entry
    }
    return undefined
}

/** Where the `Objets`/`Taille` columns take their numbers from. */
export type CounterSource = "garage" | "s3"

export interface StatsSources {
    /** The counter columns always have a source: Garage admin, else pure S3. */
    counters: CounterSource
    /** Garage quota column and bars, `admin.quotas` only. Quota figures exist in
     *  the admin aggregate alone, so this implies `counters === "garage"`. */
    quotas: boolean
}

/**
 * Display rules of the frozen contract (D12) in one testable place: the counter
 * columns always have a source - the Garage admin aggregate first, otherwise the
 * pure S3 scan. The S3 scan needs no browser-side credentials: the proxy resolves
 * the key pair from the project configuration itself (`GetS3Credentials`), so a
 * project without Garage admin still gets its object counts and sizes. Quotas stay
 * a Garage-admin-only metric.
 */
export function resolveStatsSources(capabilities: Capabilities | null | undefined): StatsSources {
    const admin = capabilities?.admin
    if (admin?.available === true && admin.bucketUsage === true) {
        return { counters: "garage", quotas: admin.quotas === true }
    }
    return { counters: "s3", quotas: false }
}
