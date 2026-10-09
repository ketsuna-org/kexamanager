/** Route of a bucket: its Garage id, or its name for a pure S3 project. */
export function bucketPath(id: string): string {
    return `/buckets/${encodeURIComponent(id)}`
}
