import { describe, expect, test } from "bun:test"
import {
    boundedValue,
    buildBreadcrumb,
    joinPrefix,
    matchUsageEntry,
    parentPrefix,
    quotaPercent,
    resolveStatsSources,
    sortEntries,
    toErrorMessage,
} from "../storage"
import type { AdminCapabilities, BucketUsageEntry, Capabilities, S3Capabilities } from "../types"

describe("buildBreadcrumb", () => {
    test("la racine ne produit aucun fil d'Ariane", () => {
        expect(buildBreadcrumb("")).toEqual([])
    })

    test("un niveau", () => {
        expect(buildBreadcrumb("releases/")).toEqual([{ label: "releases", prefix: "releases/" }])
    })

    test("deux niveaux", () => {
        expect(buildBreadcrumb("releases/v2/")).toEqual([
            { label: "releases", prefix: "releases/" },
            { label: "v2", prefix: "releases/v2/" },
        ])
    })

    test("un prefixe sans slash final est traite pareil", () => {
        expect(buildBreadcrumb("releases/v2")).toEqual([
            { label: "releases", prefix: "releases/" },
            { label: "v2", prefix: "releases/v2/" },
        ])
    })
})

describe("joinPrefix", () => {
    test("sans double slash quand le prefixe finit deja par un slash", () => {
        expect(joinPrefix("releases/", "v2/")).toBe("releases/v2/")
    })

    test("ajoute le slash manquant au prefixe", () => {
        expect(joinPrefix("releases", "v2/")).toBe("releases/v2/")
    })

    test("racine vide", () => {
        expect(joinPrefix("", "a.zip")).toBe("a.zip")
    })

    test("le nom ne garde pas de slash de tete", () => {
        expect(joinPrefix("releases/", "/v2/")).toBe("releases/v2/")
    })
})

describe("parentPrefix", () => {
    test("la racine reste la racine", () => {
        expect(parentPrefix("")).toBe("")
    })

    test("un seul niveau remonte a la racine", () => {
        expect(parentPrefix("releases/")).toBe("")
    })

    test("deux niveaux remontent d'un cran", () => {
        expect(parentPrefix("releases/v2/")).toBe("releases/")
    })

    test("une cle d'objet remonte au dossier qui la contient", () => {
        expect(parentPrefix("releases/v2/a.zip")).toBe("releases/v2/")
    })
})

describe("quotaPercent", () => {
    test("quota illimite => null (jamais une barre a 0 %)", () => {
        expect(quotaPercent({ maxSize: null }, 1024)).toBeNull()
    })

    test("quota absent => null", () => {
        expect(quotaPercent(null, 1024)).toBeNull()
        expect(quotaPercent(undefined, 1024)).toBeNull()
    })

    test("50 sur 100 => 50", () => {
        expect(quotaPercent({ maxSize: 100 }, 50)).toBe(50)
    })

    test("arrondi a une decimale", () => {
        expect(quotaPercent({ maxSize: 5368709120 }, 310568960)).toBe(5.8)
    })

    test("taille inconnue => null", () => {
        expect(quotaPercent({ maxSize: 100 }, Number.NaN)).toBeNull()
    })
})

describe("sortEntries", () => {
    test("les dossiers passent avant les objets", () => {
        const sorted = sortEntries([
            { kind: "object" as const, name: "readme.md" },
            { kind: "prefix" as const, name: "zone/" },
        ])
        expect(sorted.map((entry) => entry.name)).toEqual(["zone/", "readme.md"])
    })

    test("tri alphabetique insensible a la casse dans chaque groupe", () => {
        const sorted = sortEntries([
            { kind: "object" as const, name: "readme.md" },
            { kind: "object" as const, name: "Archive.zip" },
            { kind: "object" as const, name: "beta.txt" },
            { kind: "prefix" as const, name: "Zone/" },
            { kind: "prefix" as const, name: "apps/" },
        ])
        expect(sorted.map((entry) => entry.name)).toEqual(["apps/", "Zone/", "Archive.zip", "beta.txt", "readme.md"])
    })

    test("ne modifie pas le tableau d'entree", () => {
        const input = [
            { kind: "object" as const, name: "a" },
            { kind: "prefix" as const, name: "b/" },
        ]
        sortEntries(input)
        expect(input.map((entry) => entry.name)).toEqual(["a", "b/"])
    })
})

describe("toErrorMessage", () => {
    test("extrait le message d'une Error", () => {
        expect(toErrorMessage(new Error("boum"))).toBe("boum")
    })

    test("accepte un objet {message}", () => {
        expect(toErrorMessage({ message: "HTTP Error: 502" })).toBe("HTTP Error: 502")
    })
})

// --------------------------------------------------------------------------
// Contrat a deux groupes (D9) et regles d'affichage (D12).
// --------------------------------------------------------------------------

/** Capacites completes dont seuls les drapeaux admin varient. */
function capabilitiesWith(admin: Partial<AdminCapabilities>): Capabilities {
    const s3: S3Capabilities = {
        versioning: false,
        tagging: false,
        lifecycle: true,
        cors: true,
        location: true,
        encryption: true,
        storageClasses: false,
    }
    const adminFull: AdminCapabilities = {
        available: false,
        bucketUsage: false,
        quotas: false,
        multipart: false,
        bucketKeys: false,
        objectInspect: false,
        clusterStats: false,
        website: false,
        ...admin,
    }
    return { s3, admin: adminFull, s3Url: "http://s3.local", region: "garage" }
}

function usageEntry(name: string, overrides: Partial<BucketUsageEntry> = {}): BucketUsageEntry {
    return { name, objects: 1, bytes: 2, complete: true, prefixes: 0, storageClasses: {}, error: null, ...overrides }
}

describe("boundedValue", () => {
    test("mesure complete: la valeur est rendue telle quelle", () => {
        expect(boundedValue("1 234", true)).toBe("1 234")
    })

    test("balayage borne: marqueur >= pour ne pas faire passer une borne basse pour un total", () => {
        expect(boundedValue("1 234", false)).toBe("≥ 1 234")
    })

    test("zero borne basse reste marque", () => {
        expect(boundedValue("0", false)).toBe("≥ 0")
    })
})

describe("matchUsageEntry", () => {
    const byName = new Map([["photos", usageEntry("photos")]])

    test("correspondance par nom", () => {
        expect(matchUsageEntry(["photos"], byName)?.name).toBe("photos")
    })

    test("correspondance par alias global quand l'id du listing differe", () => {
        expect(matchUsageEntry(["bkt-0001", "photos"], byName)?.name).toBe("photos")
    })

    test("aucune correspondance => undefined (aucun compteur invente)", () => {
        expect(matchUsageEntry(["autre", "encore"], byName)).toBeUndefined()
    })

    test("liste de noms vide => undefined", () => {
        expect(matchUsageEntry([], byName)).toBeUndefined()
    })
})

describe("resolveStatsSources", () => {
    test("admin Garage complet: compteurs Garage et colonne quota", () => {
        const sources = resolveStatsSources(capabilitiesWith({ available: true, bucketUsage: true, quotas: true }))
        expect(sources).toEqual({ counters: "garage", quotas: true })
    })

    test("admin sans quotas: compteurs Garage mais pas de colonne quota", () => {
        const sources = resolveStatsSources(capabilitiesWith({ available: true, bucketUsage: true, quotas: false }))
        expect(sources.counters).toBe("garage")
        expect(sources.quotas).toBe(false)
    })

    test("projet s3 (pas d'admin): compteurs calcules par l'API S3, quotas masques", () => {
        const sources = resolveStatsSources(capabilitiesWith({ available: false }))
        expect(sources).toEqual({ counters: "s3", quotas: false })
    })

    test("admin.quotas sans admin.bucketUsage: le balayage S3 prend le relais", () => {
        const sources = resolveStatsSources(capabilitiesWith({ available: true, bucketUsage: false, quotas: true }))
        expect(sources).toEqual({ counters: "s3", quotas: false })
    })

    test("reponse de capacites absente ou en echec: le balayage S3 reste la source", () => {
        expect(resolveStatsSources(null)).toEqual({ counters: "s3", quotas: false })
        expect(resolveStatsSources(undefined)).toEqual({ counters: "s3", quotas: false })
    })
})
