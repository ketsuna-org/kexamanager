// Live integration test of the storage access layer against a real proxy.
//
// It is skipped unless `KEXA_API_URL` is set, so `bun test` stays green without
// a server:
//
//   KEXA_API_URL=http://localhost:8080 bun test
//
// It drives the real `adminClient` (login + token storage) through `../storage`,
// so a routing regression such as a stray `/admin` service segment fails here.

import { describe, expect, test } from "bun:test"
import { adminGet, adminPost, setAuthToken } from "../../utils/adminClient"
import { getCapabilities } from "../storage"
import type { Capabilities } from "../types"

const API_URL = (process.env.KEXA_API_URL ?? "").replace(/\/+$/, "")
const RUN = API_URL.length > 0

/** Top level fields of the frozen `Capabilities` contract (see ../types). */
const CAPABILITY_KEYS = ["s3", "admin", "s3Url", "region"]

/** Group members of the two independent capability groups (D9). */
const S3_KEYS = [
    "versioning",
    "tagging",
    "lifecycle",
    "cors",
    "location",
    "encryption",
    "storageClasses",
]

const ADMIN_KEYS = [
    "available",
    "bucketUsage",
    "quotas",
    "multipart",
    "bucketKeys",
    "objectInspect",
    "clusterStats",
    "website",
]

/** Minimal browser surface the admin client expects: storage + relative fetch.
 *  In the browser the SPA is served from the same origin as `/api`, so routes
 *  are written relative; here they must be resolved against `API_URL`. */
function installBrowserShims(): void {
    const store = new Map<string, string>()
    const storage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
    }
    const nativeFetch = globalThis.fetch
    const scope = globalThis as unknown as Record<string, unknown>
    scope.localStorage = storage
    scope.sessionStorage = storage
    scope.window = { location: { reload: () => undefined } }
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const target = typeof input === "string" && input.startsWith("/") ? `${API_URL}${input}` : input
        return nativeFetch(target, init)
    }) as typeof fetch
}

/** Logs in and returns the id of a project usable by the storage routes. */
async function loginAndResolveProject(): Promise<number> {
    const login = await adminPost<{ token: string }>("/auth/login", { username: "root", password: "admin" })
    expect(typeof login.token).toBe("string")
    setAuthToken(login.token)

    let projects = await adminGet<Array<{ id: number }>>("/s3-configs")
    expect(Array.isArray(projects)).toBe(true)

    if (projects.length === 0) {
        await adminPost("/s3-configs/create", {
            name: "kexa-integration-test",
            type: "s3",
            s3_url: "http://kexa-s3:9000",
            client_id: "kexa",
            client_secret: "kexa",
            region: "us-east-1",
            force_path_style: true,
        })
        projects = await adminGet<Array<{ id: number }>>("/s3-configs")
    }

    expect(projects.length).toBeGreaterThan(0)
    return projects[0].id
}

describe("storage integration (live proxy)", () => {
    test.skipIf(!RUN)("getCapabilities renvoie les deux groupes du contrat", async () => {
        installBrowserShims()
        const projectId = await loginAndResolveProject()

        const capabilities = await getCapabilities(projectId)

        expect(Object.keys(capabilities).sort()).toEqual([...CAPABILITY_KEYS].sort())
        for (const key of S3_KEYS) {
            expect(typeof capabilities.s3[key as keyof typeof capabilities.s3]).toBe("boolean")
        }
        for (const key of ADMIN_KEYS) {
            expect(typeof capabilities.admin[key as keyof typeof capabilities.admin]).toBe("boolean")
        }
        expect(typeof capabilities.s3Url).toBe("string")
        expect(typeof capabilities.region).toBe("string")
    })

    test.skipIf(!RUN)("admin.available: false implique tous les drapeaux admin derives a false", async () => {
        installBrowserShims()
        const projectId = await loginAndResolveProject()

        const capabilities: Capabilities = await getCapabilities(projectId)
        if (capabilities.admin.available) return // projet avec admin API: invariant non applicable

        for (const key of ADMIN_KEYS) {
            expect(capabilities.admin[key as keyof Capabilities["admin"]]).toBe(false)
        }
    })
})
