// Panneau d'usage agrege de la page `/buckets`. Il rend les DEUX sources du
// contrat fige (D12) : l'agregat admin Garage (`/stats/buckets`, autoritatif,
// quotas inclus) et le calcul 100 % S3 (`POST /s3/bucket-usage`, sans admin).
// La source affichee est donc toujours nommee, un agregat partiel est declare
// comme tel, et les alertes de quota n'apparaissent que si l'admin Garage
// expose `quotas` - le seul endroit ou des chiffres de quota existent.
//
// Aucun compteur n'est invente : un bucket non mesurable est exclu du classement
// et une valeur issue d'un balayage borne est rendue avec le marqueur `>=`.

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import LinearProgress from "@mui/material/LinearProgress"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import EmptyState from "../../../components/EmptyState"
import { boundedValue } from "../../../api/storage"
import { formatBytes, formatDateTime } from "../../../utils/format"
import type { BucketUsage, StorageOverview } from "../../../api/types"

/** Seuil au-dela duquel un bucket est signale comme proche de son quota. */
const QUOTA_WARNING_PERCENT = 80

/** Nombre de buckets affiches dans le classement par taille. */
const TOP_BUCKETS_COUNT = 5

/** Une valeur d'octets ou de compteur, avec son libelle au-dessus. */
function UsageMetric({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                {label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {value}
            </Typography>
        </Box>
    )
}

/**
 * Remplissage d'un quota : barre + libelle `x % de <taille>`.
 * `percent === null` (aucun quota configure) rend un tiret, jamais une barre a 0 %.
 * Le quota n'existe que cote admin Garage, la colonne n'est donc construite que
 * lorsque `admin.quotas` est vrai.
 */
export function QuotaBar({ percent, maxSize }: { percent: number | null; maxSize: number | null }) {
    const { t, i18n } = useTranslation()
    if (percent === null || !Number.isFinite(percent)) {
        return (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                —
            </Typography>
        )
    }
    const label = maxSize !== null && Number.isFinite(maxSize) && maxSize > 0
        ? t("storageUsage.quotaLabel", { percent, size: formatBytes(maxSize, i18n.language) })
        : t("storageUsage.quotaPercentOnly", { percent })
    return (
        <Stack spacing={0.5} sx={{ minWidth: 130 }}>
            <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, percent))}
                color={percent > QUOTA_WARNING_PERCENT ? "warning" : "primary"}
                aria-label={label}
                sx={{ height: 6, borderRadius: 3 }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                {label}
            </Typography>
        </Stack>
    )
}

/** Source des chiffres affiches par le panneau. */
export type StorageUsageSource = "garage" | "s3"

/** Un bucket ramene a ce que l'affichage consomme, quelle que soit la source. */
interface UsageBucket {
    id: string
    name: string
    objects: number
    bytes: number
    /** `false` : bucket non mesurable, ses compteurs sont des tirets. */
    available: boolean
    /** `true` : balayage borne, les compteurs sont des bornes basses (`>=`). */
    partial: boolean
    quotaUsagePercent: number | null
}

/** Vue commune aux deux sources : le rendu ne branche qu'ici, jamais sur le JSON. */
interface UsageView {
    source: StorageUsageSource
    buckets: UsageBucket[]
    totals: {
        buckets: number
        objects: number
        bytes: number
        partial: boolean
        bucketsPartial: boolean
    }
    generatedAt: string
    stale: boolean
}

/** Agregat autoritatif de l'admin Garage (`/stats/buckets`). */
function viewOfGarage(overview: StorageOverview): UsageView {
    return {
        source: "garage",
        buckets: overview.buckets.map((bucket) => ({
            id: bucket.id,
            name: bucket.name,
            objects: bucket.objects,
            bytes: bucket.bytes,
            available: bucket.statsAvailable,
            partial: false,
            quotaUsagePercent: bucket.quotaUsagePercent,
        })),
        totals: {
            buckets: overview.totals.buckets,
            objects: overview.totals.objects,
            bytes: overview.totals.bytes,
            partial: !overview.totals.objectsComplete || !overview.totals.bytesComplete,
            bucketsPartial: false,
        },
        generatedAt: overview.generatedAt,
        stale: overview.stale,
    }
}

/** Somme mesuree cote S3 (`/s3/bucket-usage`), sans admin Garage. */
function viewOfS3(usage: BucketUsage): UsageView {
    return {
        source: "s3",
        buckets: usage.buckets.map((entry) => ({
            id: entry.name,
            name: entry.name,
            objects: entry.objects,
            bytes: entry.bytes,
            available: entry.error === null,
            partial: entry.error === null && !entry.complete,
            quotaUsagePercent: null,
        })),
        totals: {
            buckets: usage.totals.buckets,
            objects: usage.totals.objects,
            bytes: usage.totals.bytes,
            partial: !usage.totals.objectsComplete || !usage.totals.bucketsComplete,
            bucketsPartial: !usage.totals.bucketsComplete,
        },
        generatedAt: usage.generatedAt,
        stale: usage.stale,
    }
}

interface StorageUsagePanelProps {
    /** Agregat admin `/api/{project}/stats/buckets`, prioritaire quand fourni. */
    overview?: StorageOverview | null
    /** Agregat `POST /api/{project}/s3/bucket-usage` (S3 seul, sans admin). */
    usage?: BucketUsage | null
    /** Reporte `admin.quotas` : sans lui, aucune alerte ni barre de quota. */
    showQuotas?: boolean
}

export default function StorageUsagePanel({ overview = null, usage = null, showQuotas = false }: StorageUsagePanelProps) {
    const { t, i18n } = useTranslation()
    // Source deduite des donnees recues : le panneau ne peut jamais afficher un
    // agregat sans dire d'ou il vient.
    const view = useMemo<UsageView | null>(
        () => (overview ? viewOfGarage(overview) : usage ? viewOfS3(usage) : null),
        [overview, usage],
    )
    if (!view) return null

    const totals = view.totals
    const ranked = view.buckets
        .filter((bucket) => bucket.available)
        .slice()
        .sort((left, right) => right.bytes - left.bytes)
    const top = ranked.slice(0, TOP_BUCKETS_COUNT)
    const topBytes = top.length > 0 ? top[0].bytes : 0

    const overQuota = showQuotas
        ? ranked.filter(
            (bucket) => bucket.quotaUsagePercent !== null && bucket.quotaUsagePercent > QUOTA_WARNING_PERCENT,
        )
        : []

    return (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack spacing={2}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {t("storageUsage.title")}
                    </Typography>
                    <Chip
                        size="small"
                        variant="outlined"
                        label={t(view.source === "garage" ? "storageUsage.source.garage" : "storageUsage.source.s3")}
                    />
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 4 }}>
                    <UsageMetric
                        label={t("storageUsage.totalBytes")}
                        value={boundedValue(formatBytes(totals.bytes, i18n.language), !totals.partial)}
                    />
                    <UsageMetric
                        label={t("storageUsage.totalObjects")}
                        value={boundedValue(totals.objects.toLocaleString(i18n.language), !totals.partial)}
                    />
                    <UsageMetric
                        label={t("storageUsage.buckets")}
                        value={boundedValue(totals.buckets.toLocaleString(i18n.language), !totals.bucketsPartial)}
                    />
                </Stack>

                {totals.partial && (
                    <Alert severity="warning">
                        {t(view.source === "s3" ? "storageUsage.partialS3" : "storageUsage.partial")}
                    </Alert>
                )}
                {view.stale && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {t("storageUsage.stale", { date: formatDateTime(view.generatedAt, i18n.language) })}
                    </Typography>
                )}

                {overQuota.length > 0 && (
                    <Alert severity="warning">
                        <Typography variant="subtitle2">{t("storageUsage.quotaAlert")}</Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                            {overQuota.map((bucket) => (
                                <Typography key={bucket.id} variant="body2">
                                    {t("storageUsage.quotaAlertItem", {
                                        name: bucket.name,
                                        percent: bucket.quotaUsagePercent ?? 0,
                                    })}
                                </Typography>
                            ))}
                        </Stack>
                    </Alert>
                )}

                <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        {t("storageUsage.topBuckets")}
                    </Typography>
                    {top.length === 0 ? (
                        <EmptyState size="inline" title={t("storageUsage.empty")} />
                    ) : (
                        <Stack spacing={1.5}>
                            {top.map((bucket) => (
                                <Box key={bucket.id}>
                                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                            {bucket.name}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                            {t("storageUsage.bucketObjects", {
                                                objects: boundedValue(bucket.objects.toLocaleString(i18n.language), !bucket.partial),
                                            })}
                                            {" · "}
                                            {boundedValue(formatBytes(bucket.bytes, i18n.language), !bucket.partial)}
                                        </Typography>
                                    </Stack>
                                    <LinearProgress
                                        variant="determinate"
                                        value={topBytes > 0 ? Math.round((bucket.bytes / topBytes) * 1000) / 10 : 0}
                                        aria-label={bucket.name}
                                        sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                                    />
                                </Box>
                            ))}
                        </Stack>
                    )}
                </Box>
            </Stack>
        </Paper>
    )
}
