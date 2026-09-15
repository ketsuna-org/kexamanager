import i18n from "../i18n"

/**
 * Unités d'octets. FR utilise les symboles IEC francisés (o, Kio, Mio…),
 * les autres langues les symboles IEC internationaux (B, KiB, MiB…).
 */
const BYTE_UNITS = {
    fr: ["o", "Kio", "Mio", "Gio", "Tio", "Pio"],
    other: ["B", "KiB", "MiB", "GiB", "TiB", "PiB"],
} as const

function currentLocale(language?: string): string {
    return language || i18n.language || "en"
}

/**
 * Formate un nombre d'octets en unité lisible (base 1024).
 * `formatBytes(1048576)` → `1 Mio` (UI FR) / `1 MiB` (UI EN) ; `null` → `-`.
 */
export function formatBytes(bytes?: number | null, language?: string): string {
    if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return "-"
    const units = currentLocale(language).toLowerCase().startsWith("fr")
        ? BYTE_UNITS.fr
        : BYTE_UNITS.other
    if (bytes <= 0) return `0 ${units[0]}`
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, i)
    return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[i]}`
}

/**
 * Formate une date (ISO, timestamp ou objet Date) selon la langue de l'interface,
 * et non selon la locale du navigateur.
 * `formatDateTime("2026-02-01T14:03:00Z", "fr")` → `01/02/2026 14:03` (fr-FR).
 */
export function formatDateTime(value?: string | number | Date | null, language?: string): string {
    if (value === undefined || value === null || value === "") return "-"
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return new Intl.DateTimeFormat(currentLocale(language), {
        dateStyle: "short",
        timeStyle: "short",
    }).format(date)
}
