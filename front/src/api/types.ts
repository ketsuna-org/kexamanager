// Storage contracts, frozen by the plan (section 2). Field names are the JSON
// names returned by the proxy: do not rename them here without changing the Go
// side, the two must stay in sync.

/** What the bucket itself can do over the S3 protocol. Declarative for a
 *  `type: "s3"` project (only the bucket answers per feature, see
 *  `BucketConfig`); Garage does not implement versioning/tagging/storage
 *  classes itself, so those stay false there. */
export interface S3Capabilities {
    versioning: boolean
    tagging: boolean
    lifecycle: boolean
    cors: boolean
    location: boolean
    encryption: boolean
    storageClasses: boolean
}

/** What the Garage admin API can answer for a project. `available: false` means
 *  the proxy has no AdminURL/token: every derived flag is false as well and no
 *  `/stats/*` route may be called. */
export interface AdminCapabilities {
    available: boolean
    bucketUsage: boolean
    quotas: boolean
    multipart: boolean
    bucketKeys: boolean
    objectInspect: boolean
    clusterStats: boolean
    website: boolean
}

/** Two independent groups: what S3 can tell per bucket, what the Garage admin
 *  API can tell for the cluster. A flag of one group never implies anything
 *  about the other, the UI branches on each group separately. */
export interface Capabilities {
    s3: S3Capabilities
    admin: AdminCapabilities
    s3Url: string
    region: string
}

export interface BucketQuotas {
    maxObjects: number | null
    maxSize: number | null
}

export interface BucketAlias {
    accessKeyId: string
    alias: string
}

/** One bucket of `/stats/buckets`. `statsAvailable: false` means the proxy could
 *  not read the bucket info: the counters are then meaningless and the UI must
 *  show a dash instead of a zero. */
export interface BucketStat {
    id: string
    name: string
    globalAliases: string[]
    localAliases: BucketAlias[]
    created: string
    objects: number
    bytes: number
    quotas: BucketQuotas
    quotaUsagePercent: number | null
    statsAvailable: boolean
    statsError: string | null
    unfinishedMultipartUploadParts: number
    unfinishedMultipartUploadBytes: number
}

/** Sums carried by `/stats/buckets`. `objectsComplete`/`bytesComplete` are false
 *  as soon as one bucket failed: the aggregate never claims to be exhaustive. */
export interface StorageTotals {
    buckets: number
    objects: number
    bytes: number
    objectsComplete: boolean
    bytesComplete: boolean
}

export interface StorageOverview {
    totals: StorageTotals
    buckets: BucketStat[]
    generatedAt: string
    stale: boolean
}

export interface ClusterHealth {
    status: string
    connectedNodes: number
    knownNodes: number
    storageNodes: number
    storageNodesOk: number
    partitions: number
    partitionsAllOk: number
    partitionsQuorum: number
}

export interface ClusterNode {
    id: string
    hostname: string
    isUp: boolean
    draining: boolean
    zone: string
    capacity: number
    /** Partition ids held by the node, as returned by the cluster status. */
    dataPartition: number[]
}

export interface ClusterStatistics {
    available: boolean
    /** Raw `freeform` payload of the admin API, always forwarded as-is. */
    raw: string
    /** Parsed `freeform` when it happens to be JSON, `null` otherwise. */
    parsed: Record<string, unknown> | null
}

export interface ClusterOverview {
    health: ClusterHealth
    layoutVersion: number
    nodes: ClusterNode[]
    statistics: ClusterStatistics
    generatedAt: string
}

export interface ObjectEntry {
    key: string
    size: number
    lastModified: string
    etag: string
    contentType?: string
}

export interface ObjectListing {
    objects: ObjectEntry[]
    commonPrefixes: string[]
    nextContinuationToken?: string
    isTruncated: boolean
    keyCount: number
    totalSize: number
}

export interface ObjectStat {
    key: string
    size: number
    contentType: string
    etag: string
    lastModified: string
    storageClass: string
    metadata: Record<string, string>
    headers: Record<string, string>
}

export interface DeleteObjectsError {
    key: string
    code: string
    message: string
}

export interface DeleteObjectsResult {
    deleted: string[]
    errors: DeleteObjectsError[]
}

export interface CopyObjectResult {
    success: boolean
    etag: string
}

/** One bucket of `POST /api/{project}/s3/bucket-usage` (counters measured over
 *  S3 alone, no Garage admin). `complete: false` means the bounded scan stopped
 *  before the end of the bucket: every counter is then a lower bound, rendered
 *  with a `>=` marker. `error` non-null means the bucket could not be measured
 *  at all and the UI must show a dash instead of a zero. */
export interface BucketUsageEntry {
    name: string
    objects: number
    bytes: number
    complete: boolean
    prefixes: number
    storageClasses: Record<string, { objects: number; bytes: number }>
    error: string | null
}

/** Sums of `bucket-usage`; every `*Complete` flag drops to false as soon as one
 *  bucket was capped or failed, so the aggregate never claims to be exhaustive. */
export interface BucketUsageTotals {
    buckets: number
    objects: number
    bytes: number
    objectsComplete: boolean
    bucketsComplete: boolean
}

export interface BucketUsage {
    totals: BucketUsageTotals
    buckets: BucketUsageEntry[]
    generatedAt: string
    stale: boolean
}

/** One feature probed independently on the bucket by
 *  `POST /api/{project}/s3/bucket-config`. `supported: false` means the bucket
 *  does not implement it (Garage limits included): the UI hides it. */
export interface BucketConfigFeature {
    supported: boolean
    value: unknown
    error: string | null
}

export interface BucketConfig {
    bucket: string
    location: BucketConfigFeature
    versioning: BucketConfigFeature
    tagging: BucketConfigFeature
    lifecycle: BucketConfigFeature
    cors: BucketConfigFeature
    encryption: BucketConfigFeature
}
