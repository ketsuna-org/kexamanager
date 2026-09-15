import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { GetNodeStatistics, GetNodeInfo } from "../../utils/apiWrapper"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Chip from "@mui/material/Chip"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import RefreshIcon from "@mui/icons-material/Refresh"
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined"
import type { components } from "../../types/openapi"
import PageHeader from "../../components/PageHeader"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import { useProject } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"

type InfoResp = components["schemas"]["MultiResponse_LocalGetNodeInfoResponse"]
type StatsResp = components["schemas"]["MultiResponse_LocalGetNodeStatisticsResponse"]

type NodeCombined = {
    id: string
    info?: components["schemas"]["LocalGetNodeInfoResponse"]
    stats?: components["schemas"]["LocalGetNodeStatisticsResponse"]
    error?: string
}

/** Rend la liste `garageFeatures` (chaines, objets a plat) sans tableau imbrique. */
function GarageFeatures({ features }: { features: unknown }): ReactNode {
    if (!Array.isArray(features)) return <>-</>
    return (
        <Stack spacing={0.5}>
            {features.map((f, i) => {
                if (f == null) return null
                if (typeof f === "string") return <Chip key={`f-${i}`} label={f} size="small" />
                if (typeof f === "object") {
                    const entries = Object.entries(f as Record<string, unknown>)
                    return (
                        <Box key={`f-${i}`} sx={{ display: "grid", gridTemplateColumns: "minmax(80px, auto) 1fr", gap: 0.5 }}>
                            {entries.map(([k, v]) => (
                                <Fragment key={k}>
                                    <Box sx={{ fontWeight: "bold", pr: 1 }}>{k}</Box>
                                    <Box>{v == null ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v)}</Box>
                                </Fragment>
                            ))}
                        </Box>
                    )
                }
                return <Chip key={`f-${i}`} label={String(f)} size="small" />
            })}
        </Stack>
    )
}

/** Indexe la recherche sur les caracteristiques, quel que soit leur type. */
function featuresText(features: unknown): string {
    if (!Array.isArray(features)) return ""
    return features
        .map((f) => {
            if (f == null) return ""
            if (typeof f === "string") return f
            if (typeof f === "object") return Object.entries(f as Record<string, unknown>).map(([k, v]) => `${k}:${String(v)}`).join(" ")
            return String(f)
        })
        .join(" ")
}

export default function Nodes() {
    const { t } = useTranslation()
    const { selectedProject } = useProject()
    const [nodes, setNodes] = useState<NodeCombined[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statsNodeId, setStatsNodeId] = useState<string | null>(null)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const results = await Promise.allSettled([GetNodeInfo({}), GetNodeStatistics({})])
            if (!mountedRef.current) return

            const failures = results.filter((r) => r.status === "rejected")
            if (failures.length === results.length && failures.length > 0) {
                const reason: unknown = failures[0].reason
                setError(reason instanceof Error ? reason.message : String(reason))
                return
            }

            const parseInfo = (v: unknown): InfoResp => (v && typeof v === "object" ? (v as InfoResp) : { success: {}, error: {} })
            const parseStats = (v: unknown): StatsResp => (v && typeof v === "object" ? (v as StatsResp) : { success: {}, error: {} })

            const [infoRes, statsRes] = results
            const info = infoRes.status === "fulfilled" ? parseInfo(infoRes.value) : { success: {}, error: {} }
            const stats = statsRes.status === "fulfilled" ? parseStats(statsRes.value) : { success: {}, error: {} }

            const ids = new Set<string>()
            Object.keys(info.success || {}).forEach((k) => ids.add(k))
            Object.keys(info.error || {}).forEach((k) => ids.add(k))
            Object.keys(stats.success || {}).forEach((k) => ids.add(k))
            Object.keys(stats.error || {}).forEach((k) => ids.add(k))

            const combined: NodeCombined[] = Array.from(ids).map((id) => ({
                id,
                info: (info.success && (info.success as Record<string, components["schemas"]["LocalGetNodeInfoResponse"]>)[id]) ?? undefined,
                stats: (stats.success && (stats.success as Record<string, components["schemas"]["LocalGetNodeStatisticsResponse"]>)[id]) ?? undefined,
                error: (info.error && info.error[id]) ?? (stats.error && stats.error[id]) ?? undefined,
            }))

            setNodes(combined)
        } catch (e) {
            if (mountedRef.current) setError((e as unknown as { message?: string })?.message || String(e))
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const statsNode = statsNodeId === null ? null : nodes.find((n) => n.id === statsNodeId) ?? null

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title={t("dashboard.nodes")}
                subtitle={t("dashboard.nodes_desc")}
                badge={projectBadge(selectedProject)}
                action={
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                        {t("common.refresh")}
                    </Button>
                }
            />

            <DataTable<NodeCombined>
                rows={nodes}
                getRowId={(node) => node.id}
                loading={loading}
                error={error}
                errorTitle={t("dashboard.nodes_load_error") as string}
                retryLabel={t("common.retry") as string}
                onRetry={() => { void load() }}
                tableLabel={t("dashboard.nodes") as string}
                columns={[
                    {
                        id: "node_id",
                        header: t("dashboard.nodes_table.node_id"),
                        cell: (node) => <Typography variant="code">{node.id}</Typography>,
                        sortValue: (node) => node.id,
                        minWidth: 160,
                    },
                    {
                        id: "garage_version",
                        header: t("dashboard.nodes_table.garage_version"),
                        cell: (node) => node.info?.garageVersion ?? "-",
                        sortValue: (node) => node.info?.garageVersion ?? null,
                        minWidth: 130,
                    },
                    {
                        id: "rust_version",
                        header: t("dashboard.nodes_table.rust_version"),
                        cell: (node) => node.info?.rustVersion ?? "-",
                        sortValue: (node) => node.info?.rustVersion ?? null,
                        minWidth: 120,
                    },
                    {
                        id: "db_engine",
                        header: t("dashboard.nodes_table.db_engine"),
                        cell: (node) => node.info?.dbEngine ?? "-",
                        sortValue: (node) => node.info?.dbEngine ?? null,
                        minWidth: 110,
                    },
                    {
                        id: "garage_features",
                        header: t("dashboard.nodes_table.garage_features"),
                        cell: (node) => <GarageFeatures features={node.info?.garageFeatures} />,
                        sortValue: (node) => featuresText(node.info?.garageFeatures),
                        minWidth: 180,
                    },
                    {
                        id: "error",
                        header: t("dashboard.nodes_table.error"),
                        cell: (node) =>
                            node.error ? (
                                <Typography variant="body2" sx={{ color: "error.main" }}>
                                    {node.error}
                                </Typography>
                            ) : (
                                "-"
                            ),
                        sortValue: (node) => node.error ?? "",
                        minWidth: 160,
                    },
                    {
                        id: "actions",
                        header: t("common.actions"),
                        align: "right" as const,
                        minWidth: 110,
                        cell: (node) => (
                            <Button size="small" onClick={() => setStatsNodeId(node.id)}>
                                {t("common.details")}
                            </Button>
                        ),
                    },
                ] satisfies DataTableColumn<NodeCombined>[]}
                searchValue={(node) =>
                    [
                        node.id,
                        node.info?.garageVersion ?? "",
                        node.info?.rustVersion ?? "",
                        node.info?.dbEngine ?? "",
                        featuresText(node.info?.garageFeatures),
                        node.error ?? "",
                    ].join(" ")
                }
                defaultSort={{ id: "node_id", dir: "asc" }}
                pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                emptyState={{
                    icon: <DnsOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                    title: t("dashboard.no_nodes") as string,
                    description: t("dashboard.nodes_empty_desc") as string,
                    primaryAction: { label: t("common.refresh") as string, onClick: () => { void load() } },
                }}
            />

            <Dialog open={statsNode !== null} onClose={() => setStatsNodeId(null)} fullWidth maxWidth="md">
                <DialogTitle>{t("dashboard.nodes_table.stats")}</DialogTitle>
                <DialogContent>
                    <Typography variant="subtitle2">{statsNode?.id}</Typography>
                    <Paper variant="outlined" sx={{ mt: 1, p: 1 }}>
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{statsNode?.stats?.freeform ?? "-"}</pre>
                    </Paper>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStatsNodeId(null)}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
