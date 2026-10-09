import { deleteObjects, joinPrefix, listObjects, presignObject, s3RequestCredentials } from "../../api/storage"
import { getAuthToken } from "../../utils/adminClient"

/** Uploads one file through the proxy (`/s3/put-object`), reporting progress 0-1. */
export function uploadObject(projectId: number, bucket: string, key: string, file: Blob, onProgress?: (ratio: number) => void): Promise<void> {
    const { keyId, token } = s3RequestCredentials(projectId)
    const form = new FormData()
    form.append("bucket", bucket)
    form.append("key", key)
    form.append("fileSize", String(file.size))
    if (keyId) form.append("keyId", keyId)
    if (token) form.append("token", token)
    form.append("file", file, key.split("/").pop() || "file")
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `/api/${projectId}/s3/put-object`)
        const jwt = getAuthToken()
        if (jwt) xhr.setRequestHeader("Authorization", `Bearer ${jwt}`)
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress?.(event.loaded / event.total)
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
                return
            }
            let message = `HTTP ${xhr.status}`
            try {
                const body = JSON.parse(xhr.responseText) as { error?: string; details?: string }
                message = [body.error, body.details].filter(Boolean).join(": ") || message
            } catch {
                // keep the status line
            }
            reject(new Error(message))
        }
        xhr.onerror = () => reject(new Error("Network error"))
        xhr.send(form)
    })
}

/** Creates an empty folder marker (`prefix/name/`). */
export function createFolder(projectId: number, bucket: string, prefix: string, name: string): Promise<void> {
    const key = joinPrefix(prefix, `${name.replace(/\/+$/, "")}/`)
    return uploadObject(projectId, bucket, key, new Blob([]))
}

/** Every key under a prefix, for deleting or copying a whole folder. */
export async function listAllKeys(projectId: number, bucket: string, prefix: string): Promise<string[]> {
    const keys: string[] = []
    let token: string | undefined
    do {
        const page = await listObjects(projectId, { bucket, prefix, delimiter: "", maxKeys: 1000, continuationToken: token })
        keys.push(...page.objects.map((o) => o.key))
        token = page.isTruncated ? page.nextContinuationToken : undefined
    } while (token)
    return keys
}

/** Deletes keys and folders (recursively), in batches of 1000. Returns the failures. */
export async function deleteEntries(projectId: number, bucket: string, entries: { key: string; isFolder: boolean }[]): Promise<{ deleted: number; errors: string[] }> {
    const keys: string[] = []
    for (const entry of entries) {
        if (entry.isFolder) keys.push(...(await listAllKeys(projectId, bucket, entry.key)))
        else keys.push(entry.key)
    }
    let deleted = 0
    const errors: string[] = []
    for (let i = 0; i < keys.length; i += 1000) {
        const result = await deleteObjects(projectId, { bucket, keys: keys.slice(i, i + 1000) })
        deleted += result.deleted.length
        errors.push(...result.errors.map((e) => `${e.key}: ${e.message || e.code}`))
    }
    return { deleted, errors }
}

/** Opens a download of the object in the browser. */
export async function downloadObject(projectId: number, bucket: string, key: string): Promise<void> {
    const { presignedUrl } = await presignObject(projectId, { bucket, key, download: true })
    const link = document.createElement("a")
    link.href = presignedUrl
    link.rel = "noopener"
    link.click()
}

const MIME_BY_EXT: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    avif: "image/avif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    log: "text/plain",
    html: "text/html",
    xml: "application/xml",
    yml: "text/yaml",
    yaml: "text/yaml",
}

/** Type used to choose a preview when the object carries no Content-Type. */
export function guessMime(key: string, declared?: string): string {
    if (declared && declared !== "application/octet-stream" && declared !== "binary/octet-stream") return declared
    const ext = key.split(".").pop()?.toLowerCase() ?? ""
    return MIME_BY_EXT[ext] ?? declared ?? "application/octet-stream"
}

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none"

export function previewKind(mime: string): PreviewKind {
    if (mime.startsWith("image/")) return "image"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("audio/")) return "audio"
    if (mime === "application/pdf") return "pdf"
    if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return "text"
    return "none"
}

/** Files of a drop event, folders included (walked recursively). */
export async function filesFromDrop(items: DataTransferItemList): Promise<{ file: File; path: string }[]> {
    const entries = [...items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e))
    const out: { file: File; path: string }[] = []
    const walk = async (entry: FileSystemEntry, base: string): Promise<void> => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
            out.push({ file, path: base + file.name })
            return
        }
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        let batch: FileSystemEntry[]
        do {
            batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
            for (const child of batch) await walk(child, `${base}${entry.name}/`)
        } while (batch.length > 0)
    }
    for (const entry of entries) await walk(entry, "")
    return out
}
