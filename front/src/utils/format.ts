import i18n from "../i18n"

/**
 * Byte units, decimal like Garage itself (`garage layout` counts 1 TB as 10^12
 * bytes). French uses its own symbols (o, ko, Mo, Go…).
 */
const BYTE_UNITS = {
    fr: ["o", "ko", "Mo", "Go", "To", "Po"],
    other: ["B", "kB", "MB", "GB", "TB", "PB"],
} as const

function currentLocale(language?: string): string {
    return language || i18n.language || "en"
}

function isFrench(language?: string): boolean {
    return currentLocale(language).toLowerCase().startsWith("fr")
}

/** Unit symbols of the current language, smallest first. */
export function byteUnits(language?: string): readonly string[] {
    return isFrench(language) ? BYTE_UNITS.fr : BYTE_UNITS.other
}

/**
 * Human readable size, base 1000.
 * `formatBytes(1_800_000_000_000)` → `1,8 To` (FR) / `1.8 TB` (EN); `null` → `-`.
 */
export function formatBytes(bytes?: number | null, language?: string): string {
    if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return "-"
    const units = byteUnits(language)
    if (bytes <= 0) return `0 ${units[0]}`
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1)
    const value = bytes / Math.pow(1000, i)
    const formatted = new Intl.NumberFormat(currentLocale(language), {
        maximumFractionDigits: value >= 100 || i === 0 ? 0 : 1,
    }).format(value)
    return `${formatted} ${units[i]}`
}

/** Grouped integer: `1284310` → `1 284 310` (FR). */
export function formatCount(value?: number | null, language?: string): string {
    if (value === undefined || value === null || !Number.isFinite(value)) return "-"
    return new Intl.NumberFormat(currentLocale(language)).format(value)
}

/** Compact integer: `4_200_000` → `4,2 M`. */
export function formatCompact(value?: number | null, language?: string): string {
    if (value === undefined || value === null || !Number.isFinite(value)) return "-"
    return new Intl.NumberFormat(currentLocale(language), { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function toDate(value?: string | number | Date | null): Date | null {
    if (value === undefined || value === null || value === "") return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Date and time in the interface language, not the browser locale.
 * `formatDateTime("2026-02-01T14:03:00Z", "fr")` → `01/02/2026 14:03`.
 */
export function formatDateTime(value?: string | number | Date | null, language?: string): string {
    const date = toDate(value)
    if (!date) return "-"
    return new Intl.DateTimeFormat(currentLocale(language), { dateStyle: "short", timeStyle: "short" }).format(date)
}

/** `12 mars 2025`. */
export function formatDate(value?: string | number | Date | null, language?: string): string {
    const date = toDate(value)
    if (!date) return "-"
    return new Intl.DateTimeFormat(currentLocale(language), { dateStyle: "medium" }).format(date)
}

/** `14:02`. */
export function formatTime(value?: string | number | Date | null, language?: string): string {
    const date = toDate(value)
    if (!date) return "-"
    return new Intl.DateTimeFormat(currentLocale(language), { timeStyle: "short" }).format(date)
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
]

/** Relative to now: `il y a 20 s`, `dans 89 jours`. */
export function formatRelative(value?: string | number | Date | null, language?: string, now: number = Date.now()): string {
    const date = toDate(value)
    if (!date) return "-"
    let delta = (date.getTime() - now) / 1000
    const rtf = new Intl.RelativeTimeFormat(currentLocale(language), { numeric: "auto", style: "short" })
    for (const [unit, size] of RELATIVE_STEPS) {
        if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit)
        delta /= size
    }
    return rtf.format(Math.round(delta), "year")
}

/** Milliseconds from now until `value` (negative when it is in the past). */
export function msFromNow(value: string | number | Date): number {
    return new Date(value).getTime() - Date.now()
}

/** Relative duration expressed in seconds ago (Garage reports `lastSeenSecsAgo`). */
export function formatSecondsAgo(seconds?: number | null, language?: string): string {
    if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) return "-"
    return formatRelative(Date.now() - seconds * 1000, language)
}

/** Middle-truncated identifier: `9f2c1a7e…b41d`. */
export function shortId(id?: string | null, head = 8, tail = 4): string {
    if (!id) return "-"
    if (id.length <= head + tail + 1) return id
    return `${id.slice(0, head)}…${tail > 0 ? id.slice(-tail) : ""}`
}
