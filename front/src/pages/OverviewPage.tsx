import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link as RouterLink, useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Link from "@mui/material/Link"
import Tooltip from "@mui/material/Tooltip"
import { Plus, RefreshCw } from "lucide-react"
import { useActiveProject, useProject } from "../contexts/ProjectContext"
import { getBucketUsage, getClusterOverview, getStorageOverview, listS3Buckets } from "../api/storage"
import { GetClusterLayout } from "../utils/apiWrapper"
import { useAsync } from "../hooks/useAsync"
import { Page } from "../shell/Page"
import { k } from "../theme"
import { Bar, Card, CardHeader, ErrorBlock, Muted, Pill, Spinner, type Tone } from "../ui/kit"
import { formatBytes, formatCompact, formatCount, formatRelative } from "../utils/format"
import { fetchLogs } from "./activity/logs"
import { LogLine } from "./activity/LogLine"
import { bucketPath } from "./buckets/paths"

function Kpi({ label, value, note, span }: { label: ReactNode; value: ReactNode; note?: ReactNode; span?: boolean }) {
    return (
        <Card sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: "20px", gridColumn: span ? { sm: "span 2" } : undefined }}>
            <Muted>{label}</Muted>
            <Box sx={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</Box>
            {note && <Muted small>{note}</Muted>}
        </Card>
    )
}

function healthTone(status?: string): Tone {
    if (status === "healthy") return "ok"
    if (status === "degraded") return "warn"
    return "err"
}

/** Re-renders every 10 s so "updated 20 s ago" stays true. */
function useTick(ms = 10_000) {
    const [, setTick] = useState(0)
    useEffect(() => {
        const id = window.setInterval(() => setTick((n) => n + 1), ms)
        return () => window.clearInterval(id)
    }, [ms])
}

interface Attention {
    id: string
    label: ReactNode
    text: ReactNode
    action: ReactNode
    tone: Tone
}

export default function OverviewPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const project = useActiveProject()
    const { hasAdmin, counts } = useProject()
    const pid = project.id
    useTick()

    const storage = useAsync(() => (hasAdmin ? getStorageOverview(pid) : undefined), [pid, hasAdmin])
    const cluster = useAsync(() => (hasAdmin ? getClusterOverview(pid) : undefined), [pid, hasAdmin])
    const layout = useAsync(() => (hasAdmin ? GetClusterLayout() : undefined), [pid, hasAdmin])
    const s3Usage = useAsync(
        () => (hasAdmin ? undefined : listS3Buckets(pid).then((list) => (list.length ? getBucketUsage(pid, list.map((b) => b.name)) : null))),
        [pid, hasAdmin],
    )
    const logs = useAsync(() => fetchLogs(pid, {}, 1, 5), [pid])
    const [updatedAt, setUpdatedAt] = useState(() => Date.now())

    const refresh = () => {
        storage.refresh()
        cluster.refresh()
        layout.refresh()
        s3Usage.refresh()
        logs.refresh()
        setUpdatedAt(Date.now())
    }

    const health = cluster.data?.health
    const usable = layout.data?.roles.reduce((sum, role) => sum + (role.usableCapacity ?? 0), 0) ?? 0
    const usedBytes = hasAdmin ? storage.data?.totals.bytes ?? null : s3Usage.data?.totals.bytes ?? null
    const objects = hasAdmin ? storage.data?.totals.objects ?? null : s3Usage.data?.totals.objects ?? null
    const bucketCount = hasAdmin ? storage.data?.totals.buckets ?? null : s3Usage.data?.totals.buckets ?? counts.buckets
    const complete = hasAdmin ? storage.data?.totals.bytesComplete !== false : s3Usage.data?.totals.objectsComplete !== false
    const usedPercent = usable > 0 && usedBytes !== null ? (usedBytes / usable) * 100 : null
    const websites = storage.data?.buckets.filter((b) => b.websiteAccess).length ?? 0
    const unfinished = storage.data?.buckets.reduce((sum, b) => sum + (b.unfinishedMultipartUploadParts ?? 0), 0) ?? 0

    const topBuckets = hasAdmin
        ? [...(storage.data?.buckets ?? [])].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((b) => ({ id: b.id, name: b.name, bytes: b.bytes }))
        : [...(s3Usage.data?.buckets ?? [])].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((b) => ({ id: b.name, name: b.name, bytes: b.bytes }))
    const maxTop = topBuckets[0]?.bytes || 1

    const attention: Attention[] = []
    for (const bucket of storage.data?.buckets ?? []) {
        if (bucket.quotaUsagePercent !== null && bucket.quotaUsagePercent >= 80) {
            attention.push({
                id: `quota:${bucket.id}`,
                label: t("overview.quota"),
                text: t("overview.quotaText", { name: bucket.name, percent: Math.round(bucket.quotaUsagePercent) }),
                action: (
                    <Button size="small" component={RouterLink} to={`${bucketPath(bucket.id)}/settings#quotas`}>
                        {t("overview.adjust")}
                    </Button>
                ),
                tone: bucket.quotaUsagePercent >= 95 ? "err" : "warn",
            })
        }
    }
    if (counts.blockErrors) {
        attention.push({
            id: "blocks",
            label: t("overview.blocks"),
            text: t("overview.blocksText", { count: counts.blockErrors }),
            action: (
                <Button size="small" component={RouterLink} to="/maintenance">
                    {t("overview.handle")}
                </Button>
            ),
            tone: "err",
        })
    }
    for (const node of cluster.data?.nodes ?? []) {
        if (!node.isUp) {
            attention.push({
                id: `node:${node.id}`,
                label: t("overview.node"),
                text: t("overview.nodeDown", { name: node.hostname || node.id.slice(0, 8) }),
                action: (
                    <Button size="small" component={RouterLink} to="/topology">
                        {t("overview.see")}
                    </Button>
                ),
                tone: "err",
            })
        }
    }

    const loadingMain = hasAdmin ? storage.loading && !storage.data : s3Usage.loading && !s3Usage.data

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.overview") }]}
            topActions={
                <>
                    <Muted small>{t("overview.updated", { when: formatRelative(updatedAt) })}</Muted>
                    <Tooltip title={t("ui.refresh")}>
                        <IconButton onClick={refresh} aria-label={t("ui.refresh")} sx={{ border: `1px solid ${k.borderStrong}`, width: 40, height: 40 }}>
                            <RefreshCw />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" startIcon={<Plus />} onClick={() => navigate("/buckets?create=1")}>
                        {t("buckets.create")}
                    </Button>
                </>
            }
        >
            {hasAdmin && (
                <Card role="status" sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", p: "16px 20px" }}>
                    {cluster.error ? (
                        <ErrorBlock message={cluster.error} onRetry={cluster.refresh} sx={{ flex: 1 }} />
                    ) : (
                        <>
                            <Pill tone={healthTone(health?.status)} dot sx={{ height: 28, px: "12px", fontSize: 13 }}>
                                {health ? t(`overview.health.${health.status}`, { defaultValue: health.status }) : t("ui.loading")}
                            </Pill>
                            {health && (
                                <Muted sx={{ flex: "1 1 360px" }}>
                                    {t("overview.healthLine", {
                                        up: health.connectedNodes,
                                        known: health.knownNodes,
                                        ok: health.partitionsQuorum,
                                        total: health.partitions,
                                        version: cluster.data?.layoutVersion ?? "-",
                                    })}
                                </Muted>
                            )}
                            <Link component={RouterLink} to="/topology" sx={{ fontWeight: 500 }}>
                                {t("overview.seeTopology")}
                            </Link>
                        </>
                    )}
                </Card>
            )}

            {(hasAdmin ? storage.error : s3Usage.error) && <ErrorBlock message={hasAdmin ? storage.error : s3Usage.error} onRetry={hasAdmin ? storage.refresh : s3Usage.refresh} />}

            {loadingMain ? (
                <Spinner />
            ) : (
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <Card sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: "20px", gridColumn: { sm: "span 2" } }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1.5, flexWrap: "wrap" }}>
                            <Muted>{t("overview.used")}</Muted>
                            <Muted small>{hasAdmin ? t("overview.sourceAdmin") : t("overview.sourceS3")}</Muted>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.25, flexWrap: "wrap" }}>
                            <Box sx={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
                                {complete ? "" : "≥ "}
                                {formatBytes(usedBytes)}
                            </Box>
                            {usable > 0 && <Muted>{t("overview.ofUsable", { size: formatBytes(usable) })}</Muted>}
                        </Box>
                        {usedPercent !== null && (
                            <>
                                <Bar value={usedPercent} height={10} label={t("overview.used")} />
                                <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", fontSize: 12.5, color: k.text2 }}>
                                    <span>{t("overview.percentUsed", { percent: Math.round(usedPercent) })}</span>
                                    <span>{t("overview.free", { size: formatBytes(Math.max(usable - (usedBytes ?? 0), 0)) })}</span>
                                </Box>
                            </>
                        )}
                        {!hasAdmin && <Muted small>{t("overview.noCapacity")}</Muted>}
                    </Card>
                    <Kpi
                        label={t("overview.objects")}
                        value={(complete ? "" : "≥ ") + formatCompact(objects)}
                        note={hasAdmin && unfinished > 0 ? t("overview.unfinished", { count: unfinished }) : undefined}
                    />
                    <Kpi label={t("overview.buckets")} value={formatCount(bucketCount)} note={hasAdmin && websites > 0 ? t("overview.websites", { count: websites }) : undefined} />
                </Box>
            )}

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", alignItems: "start" }}>
                <Card>
                    <CardHeader
                        title={t("overview.topBuckets")}
                        extra={
                            <Link component={RouterLink} to="/buckets">
                                {t("overview.allBuckets")}
                            </Link>
                        }
                    />
                    <Box sx={{ px: "20px", pb: "18px", display: "flex", flexDirection: "column", gap: 1.5 }}>
                        {topBuckets.length === 0 && <Muted>{t("overview.noBuckets")}</Muted>}
                        {topBuckets.map((bucket) => (
                            <Box key={bucket.id} sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                                    <Link component={RouterLink} to={bucketPath(bucket.id)} sx={{ color: k.text, textDecoration: "none", fontWeight: 500, "&:hover": { color: k.accentText } }}>
                                        {bucket.name}
                                    </Link>
                                    <Muted>{formatBytes(bucket.bytes)}</Muted>
                                </Box>
                                <Bar value={(bucket.bytes / maxTop) * 100} tone="accent" />
                            </Box>
                        ))}
                    </Box>
                </Card>

                <Card>
                    <CardHeader
                        title={
                            <>
                                {t("overview.attention")}
                                {attention.length > 0 && <Pill tone="warn">{attention.length}</Pill>}
                            </>
                        }
                    />
                    {attention.length === 0 ? (
                        <Box sx={{ px: "20px", pb: "18px" }}>
                            <Muted>{hasAdmin ? t("overview.nothingToWatch") : t("overview.nothingToWatchS3")}</Muted>
                        </Box>
                    ) : (
                        attention.map((item) => (
                            <Box key={item.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: "20px", py: "12px", borderTop: `1px solid ${k.rowBorder}`, flexWrap: "wrap" }}>
                                <Pill tone={item.tone}>{item.label}</Pill>
                                <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>{item.text}</Box>
                                {item.action}
                            </Box>
                        ))
                    )}
                </Card>

                {hasAdmin && (
                    <Card>
                        <CardHeader
                            title={t("overview.nodes")}
                            extra={
                                <Link component={RouterLink} to="/topology">
                                    {t("nav.topology")}
                                </Link>
                            }
                        />
                        {(cluster.data?.nodes ?? []).map((node) => (
                            <Box key={node.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: "20px", py: "12px", borderTop: `1px solid ${k.rowBorder}` }}>
                                <Pill tone={!node.isUp ? "err" : node.draining ? "warn" : "ok"} dot>
                                    {!node.isUp ? t("topology.offline") : node.draining ? t("topology.draining") : t("topology.online")}
                                </Pill>
                                <Box sx={{ fontWeight: 500 }}>{node.hostname || node.id.slice(0, 8)}</Box>
                                <Muted sx={{ ml: "auto" }}>
                                    {[node.zone, node.capacity ? formatBytes(node.capacity) : null].filter(Boolean).join(" · ") || t("topology.noRole")}
                                </Muted>
                            </Box>
                        ))}
                    </Card>
                )}

                <Card sx={{ gridColumn: hasAdmin ? undefined : "1 / -1" }}>
                    <CardHeader
                        title={t("overview.latest")}
                        extra={
                            <Link component={RouterLink} to="/activity">
                                {t("overview.allActivity")}
                            </Link>
                        }
                    />
                    {logs.error && <ErrorBlock message={logs.error} sx={{ mx: 2, mb: 2 }} />}
                    {logs.data?.logs.length === 0 && (
                        <Box sx={{ px: "20px", pb: "18px" }}>
                            <Muted>{t("activity.empty")}</Muted>
                        </Box>
                    )}
                    {logs.data?.logs.map((entry) => <LogLine key={entry.ID} entry={entry} />)}
                </Card>
            </Box>
        </Page>
    )
}
