// S3 key used by the browser for a project whose configuration has no S3 key
// of its own (a Garage project connected through its admin API only). The
// proxy accepts a per-request key for Garage projects; it is chosen
// automatically per bucket, or explicitly from the Keys screen, and kept for
// the browser session only.

export interface S3Session {
    keyId: string
    secret: string
    name?: string
    /** `true` when the user picked this key explicitly ("browse with this key"). */
    pinned?: boolean
}

const storageKey = (projectId: number) => `kexamanager:s3session:${projectId}`

export function getS3Session(projectId: number): S3Session | null {
    try {
        const raw = sessionStorage.getItem(storageKey(projectId))
        return raw ? (JSON.parse(raw) as S3Session) : null
    } catch {
        return null
    }
}

export function setS3Session(projectId: number, session: S3Session | null): void {
    try {
        if (session) sessionStorage.setItem(storageKey(projectId), JSON.stringify(session))
        else sessionStorage.removeItem(storageKey(projectId))
    } catch {
        // storage unavailable: the key is simply asked again next time
    }
}
