import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Grid } from "@mui/material"
import { Activity, HardDrive, Server, Settings, RotateCcw, Play, FileJson } from "lucide-react"

import StatCard from "../../components/dashboard/StatCard"
import PageHeader from "../../components/PageHeader"
import { useProject } from "../../contexts/ProjectContext"
import { useFeedback } from "../../contexts/FeedbackContext"
import { projectBadge } from "./projectBadge"
import { formatBytes } from "../../utils/format"
import type { components } from "../../types/openapi"
import {
    GetClusterStatus,
    GetClusterLayout,
    GetClusterLayoutHistory,
    UpdateClusterLayout,
    ApplyClusterLayout,
    PreviewClusterLayoutChanges,
    RevertClusterLayout,
    ClusterLayoutSkipDeadNodes,
    GetClusterHealth,
} from "../../utils/apiWrapper"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import Card from "@mui/material/Card"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import Chip from "@mui/material/Chip"
import Divider from "@mui/material/Divider"
import DataTable from "../../components/data/DataTable"
import S3Browser from "./S3Browser"
import ActivityLogs from "./components/ActivityLogs"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogContentText from "@mui/material/DialogContentText"
import DialogTitle from "@mui/material/DialogTitle"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

type ClusterNode = components["schemas"]["NodeResp"]
type LayoutRole = components["schemas"]["LayoutNodeRole"]
type LayoutVersion = components["schemas"]["ClusterLayoutVersion"]

interface ClusterLayoutProps {
    /**
     * Project handed over by App.tsx. Only `admin_url` is still needed: it is
     * forwarded to the S3 tab, which the shared context does not carry.
     */
    selectedProject?: { admin_url?: string } | null
}

export default function ClusterLayout({ selectedProject: projectConfig }: ClusterLayoutProps) {
    const { t, i18n } = useTranslation()
    const { selectedProject } = useProject()
    const { notify } = useFeedback()

    // helper: calculate cluster storage totals
    function calculateClusterStorage() {
        if (!status?.nodes || !Array.isArray(status.nodes)) return null

        let totalDataCapacity = 0
        let usedDataCapacity = 0
        let totalMetadataCapacity = 0
        let usedMetadataCapacity = 0

        status.nodes.forEach((node) => {
            if (node.dataPartition) {
                totalDataCapacity += node.dataPartition.total || 0
                usedDataCapacity += (node.dataPartition.total || 0) - (node.dataPartition.available || 0)
            }
            if (node.metadataPartition) {
                totalMetadataCapacity += node.metadataPartition.total || 0
                usedMetadataCapacity += (node.metadataPartition.total || 0) - (node.metadataPartition.available || 0)
            }
        })

        return {
            data: {
                total: totalDataCapacity,
                used: usedDataCapacity,
                available: totalDataCapacity - usedDataCapacity
            },
            metadata: {
                total: totalMetadataCapacity,
                used: usedMetadataCapacity,
                available: totalMetadataCapacity - usedMetadataCapacity
            }
        }
    }
    const [status, setStatus] = useState<components["schemas"]["GetClusterStatusResponse"] | null>(null)
    const [layout, setLayout] = useState<components["schemas"]["GetClusterLayoutResponse"] | null>(null)
    const [history, setHistory] = useState<components["schemas"]["GetClusterLayoutHistoryResponse"] | null>(null)
    const [health, setHealth] = useState<components["schemas"]["GetClusterHealthResponse"] | null>(null)


    const [loading, setLoading] = useState(false)
    // confirmation dialog for Apply
    const [applyConfirmOpen, setApplyConfirmOpen] = useState(false)

    // structured update form state (replaces free-text JSON input)
    const [zoneRedundancyType, setZoneRedundancyType] = useState<"maximum" | "atLeast">("atLeast")
    const [zoneRedundancyAtLeast, setZoneRedundancyAtLeast] = useState<number | "">(3)
    type RoleEdit = { id: string; remove?: boolean; capacity?: number | null; tags?: string; zone?: string }
    const [roleDraft, setRoleDraft] = useState<RoleEdit>({ id: "", remove: false, capacity: null, tags: "", zone: "" })

    const [roleEdits, setRoleEdits] = useState<RoleEdit[]>([])
    const [skipNodesInput, setSkipNodesInput] = useState<string>("")
    const [searchParams] = useSearchParams()
    const activeTab = searchParams.get("tab") || "Overview"


    const refreshAll = useCallback(() => {
        setLoading(true)
        Promise.allSettled([GetClusterStatus(), GetClusterLayout(), GetClusterLayoutHistory(), GetClusterHealth()])
            .then((results) => {
                const [rStatus, rLayout, rHistory, rHealth] = results
                if (rStatus.status === "fulfilled") setStatus(rStatus.value as components["schemas"]["GetClusterStatusResponse"])
                if (rLayout.status === "fulfilled") setLayout(rLayout.value as components["schemas"]["GetClusterLayoutResponse"])
                if (rHistory.status === "fulfilled") setHistory(rHistory.value as components["schemas"]["GetClusterLayoutHistoryResponse"])
                if (rHealth.status === "fulfilled") setHealth(rHealth.value as components["schemas"]["GetClusterHealthResponse"])
                const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined
                if (rejected) {
                    const reason = (rejected as PromiseRejectedResult).reason as unknown
                    const msg = (reason as { message?: string })?.message || String(reason ?? "Error")
                    notify({ severity: "error", message: msg })
                }
            })
            .catch((e: unknown) => {
                const msg = (e as { message?: string })?.message || String(e)
                notify({ severity: "error", message: msg })
            })
            .finally(() => setLoading(false))
    }, [notify])

    useEffect(() => {
        refreshAll()
    }, [refreshAll])

    const storageData = calculateClusterStorage()

    async function handleUpdateLayout() {
        try {
            const req: components["schemas"]["UpdateClusterLayoutRequest"] = {}
            if (zoneRedundancyType === "maximum") req.parameters = { zoneRedundancy: "maximum" }
            else if (zoneRedundancyAtLeast !== "" && zoneRedundancyAtLeast !== null) req.parameters = { zoneRedundancy: { atLeast: Number(zoneRedundancyAtLeast) } }
            if (Array.isArray(roleEdits) && roleEdits.length > 0) {
                req.roles = roleEdits.map((r) => {
                    if (r.remove) return { id: r.id, remove: true } as unknown as components["schemas"]["NodeRoleChange"]
                    const roleObj: Record<string, unknown> = { id: r.id }
                    if (r.capacity !== undefined && r.capacity !== null) roleObj.capacity = Number(r.capacity)
                    if (r.zone) roleObj.zone = r.zone
                    if (r.tags)
                        roleObj.tags = r.tags
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                    return roleObj as unknown as components["schemas"]["NodeRoleChange"]
                })
            }
            const res = await UpdateClusterLayout(req)
            setLayout(res as components["schemas"]["GetClusterLayoutResponse"])
            notify({ severity: "success", message: t("dashboard.cluster_update_success") })
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            notify({ severity: "error", message: msg })
        }
    }

    async function handleApplyLayout() {
        try {
            const updateReq: components["schemas"]["UpdateClusterLayoutRequest"] = {}
            if (zoneRedundancyType === "maximum") updateReq.parameters = { zoneRedundancy: "maximum" }
            else if (zoneRedundancyAtLeast !== "" && zoneRedundancyAtLeast !== null) updateReq.parameters = { zoneRedundancy: { atLeast: Number(zoneRedundancyAtLeast) } }
            if (Array.isArray(roleEdits) && roleEdits.length > 0) {
                updateReq.roles = roleEdits.map((r) => {
                    if (r.remove) return { id: r.id, remove: true } as unknown as components["schemas"]["NodeRoleChange"]
                    const roleObj: Record<string, unknown> = { id: r.id }
                    if (r.capacity !== undefined && r.capacity !== null) roleObj.capacity = Number(r.capacity)
                    if (r.zone) roleObj.zone = r.zone
                    if (r.tags)
                        roleObj.tags = r.tags
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                    return roleObj as unknown as components["schemas"]["NodeRoleChange"]
                })
            }
            const updated = await UpdateClusterLayout(updateReq)
            const newLayout = updated as components["schemas"]["GetClusterLayoutResponse"]
            if (!layout) {
                notify({ severity: "error", message: t("dashboard.no_current_layout") })
                return
            }
            const version = 1 + newLayout.version;
            await ApplyClusterLayout({ version } as components["schemas"]["ApplyClusterLayoutRequest"])

            await refreshAll()
            notify({ severity: "success", message: t("dashboard.cluster_apply_success") })
            setApplyConfirmOpen(false)
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            notify({ severity: "error", message: msg })
        }
    }

    async function handlePreview() {
        try {
            const res = await PreviewClusterLayoutChanges()
            const asRecord = res as Record<string, unknown>
            if (asRecord && typeof asRecord === "object" && "error" in asRecord) {
                const msg = String(asRecord["error"])
                notify({ severity: "error", message: msg })
                return
            }
            setHistory(res as unknown as components["schemas"]["GetClusterLayoutHistoryResponse"])
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            notify({ severity: "error", message: msg })
        }
    }

    async function handleRevert() {
        try {
            await RevertClusterLayout()
            await refreshAll()
            notify({ severity: "success", message: t("dashboard.cluster_revert_success") })
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            notify({ severity: "error", message: msg })
        }
    }

    async function handleSkipDead() {
        try {
            let data: unknown = {}
            if (!skipNodesInput) data = {}
            else {
                try {
                    data = JSON.parse(skipNodesInput) as unknown
                } catch {
                    data = {
                        nodes: skipNodesInput
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                    }
                }
            }
            const res = await ClusterLayoutSkipDeadNodes(data as unknown as components["schemas"]["ClusterLayoutSkipDeadNodesRequest"])
            await refreshAll()
            notify({ severity: "success", message: t("dashboard.cluster_skip_success") })
            return res
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            notify({ severity: "error", message: msg })
        }
    }

    function copyJSON(obj: unknown) {
        try {
            const txt = JSON.stringify(obj, null, 2)
            navigator.clipboard.writeText(txt)
            notify({ severity: "success", message: t("dashboard.copy_success") })
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            notify({ severity: "error", message: `${t("dashboard.copy_failed")}: ${msg}` })
        }
    }



    return (
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
            {/* Content Body */}
            <Box sx={{ flex: 1, overflowY: "auto", p: 0 }}>
                <Box sx={{ px: 3, pt: 3 }}>
                    <PageHeader
                        title={t(`dashboard.cluster_tab_${activeTab.toLowerCase().replace(" ", "_")}`, activeTab)}
                        subtitle={t("dashboard.cluster_subtitle")}
                        badge={projectBadge(selectedProject)}
                        action={
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<RotateCcw size={14} />}
                                onClick={refreshAll}
                                disabled={loading}
                            >
                                {loading ? t("common.loading") : t("common.refresh")}
                            </Button>
                        }
                    />
                </Box>
                {activeTab === "Overview" && (
                                    <Box sx={{ px: 3, pb: 3 }}>
                        {/* Stats Cards */}
                        <Grid container spacing={3} sx={{ mb: 4 }}>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.connected_nodes")}
                                    value={health ? `${health.connectedNodes} / ${health.knownNodes}` : "-"}
                                    icon={Server}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.storage_nodes")}
                                    value={health ? `${health.storageNodesUp} / ${health.storageNodes}` : "-"}
                                    icon={HardDrive}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.total_capacity")}
                                    value={storageData ? formatBytes(storageData.data.total, i18n.language) : "-"}
                                    icon={HardDrive}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.used_space")}
                                    value={storageData ? formatBytes(storageData.data.used, i18n.language) : "-"}
                                    icon={Activity}
                                />
                            </Grid>
                        </Grid>

                        {/* Cluster Storage Overview */}
                        {status && storageData && (
                            <Card sx={{ mb: 3 }}>
                                <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                                    <Typography variant="h6" sx={{
                                        fontWeight: 600
                                    }}>{t("dashboard.cluster_storage_overview")}</Typography>
                                </Box>
                                <Box sx={{ p: 3 }}>
                                    <Grid container spacing={4} sx={{
                                        alignItems: "center"
                                    }}>
                                        <Grid size={{ xs: 12, md: 7 }}>
                                            <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
                                                {t("dashboard.storage_breakdown")}
                                            </Typography>
                                            <Box sx={{ height: 300, width: "100%" }}>
                                                <ResponsiveContainer>
                                                    <BarChart data={[{
                                                        name: t("dashboard.data_storage"),
                                                        total: storageData.data.total,
                                                        used: storageData.data.used,
                                                        available: storageData.data.available
                                                    }]} layout="vertical" barSize={30}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                                        <XAxis type="number" tickFormatter={(value) => formatBytes(value, i18n.language)} stroke="#94a3b8" fontSize={12} />
                                                        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={100} />
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f1f5f9" }}
                                                            formatter={(value) => [formatBytes(Number(value), i18n.language), ""]}
                                                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                                                        />
                                                        <Bar dataKey="used" stackId="a" fill="#0EA5E9" name={t("dashboard.used")} radius={[4, 0, 0, 4]} />
                                                        <Bar dataKey="available" stackId="a" fill="#1E293B" name={t("dashboard.available")} radius={[0, 4, 4, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Box>
                            </Card>
                        )}
                    </Box>
                )}

                {activeTab === "Nodes" && (
                                    <Box sx={{ px: 3, pb: 3 }}>
                        <Card sx={{ mb: 3 }}>
                            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="h6" sx={{
                                    fontWeight: 600
                                }}>{t("dashboard.cluster_nodes")}</Typography>
                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() =>
                                        GetClusterStatus()
                                            .then((r) => setStatus(r as components["schemas"]["GetClusterStatusResponse"]))
                                            .catch((e: unknown) => notify({ severity: "error", message: (e as { message?: string })?.message || String(e) }))
                                    }
                                >
                                    {t("dashboard.refresh_status")}
                                </Button>
                            </Box>
                            {status && (
                                <Box sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                        {t("dashboard.cluster_status")}: {status.layoutVersion}
                                    </Typography>
                                    <DataTable<ClusterNode>
                                        rows={Array.isArray(status.nodes) ? status.nodes : []}
                                        getRowId={(n) => n.id}
                                        tableLabel={t("dashboard.cluster_nodes") as string}
                                        searchValue={(n) =>
                                            [n.id, n.hostname ?? "", n.addr ?? "", n.garageVersion ?? "", n.role?.zone ?? "", ...(n.role?.tags ?? [])].join(" ")
                                        }
                                        searchPlaceholder={t("dashboard.cluster_nodes") as string}
                                        defaultSort={{ id: "id", dir: "asc" }}
                                        emptyState={{ title: t("common.no_results"), description: t("common.no_results_desc") }}
                                        columns={[
                                            {
                                                id: "id",
                                                header: t("dashboard.cluster_col.id"),
                                                cell: (n) => n.id,
                                                sortValue: (n) => n.id,
                                                minWidth: 140,
                                                truncate: true,
                                                textValue: (n) => n.id,
                                            },
                                            { id: "hostname", header: t("dashboard.cluster_col.hostname"), cell: (n) => n.hostname ?? "-", sortValue: (n) => n.hostname ?? "", minWidth: 120 },
                                            { id: "addr", header: t("dashboard.cluster_col.address"), cell: (n) => n.addr ?? "-", sortValue: (n) => n.addr ?? "", minWidth: 140 },
                                            { id: "garage", header: t("dashboard.nodes_table.garage_version"), cell: (n) => n.garageVersion ?? "-", sortValue: (n) => n.garageVersion ?? "", minWidth: 120 },
                                            {
                                                id: "up",
                                                header: t("dashboard.cluster_col.up"),
                                                cell: (n) =>
                                                    n.isUp ? (
                                                        <Chip label={t("dashboard.node_up")} color="success" size="small" />
                                                    ) : (
                                                        <Chip label={t("dashboard.node_down")} color="default" size="small" />
                                                    ),
                                                sortValue: (n) => n.isUp,
                                                minWidth: 90,
                                            },
                                            {
                                                id: "draining",
                                                header: t("dashboard.cluster_col.draining"),
                                                cell: (n) => (n.draining ? <Chip label={t("dashboard.cluster_draining_label")} size="small" /> : "-"),
                                                sortValue: (n) => n.draining,
                                                minWidth: 100,
                                            },
                                            { id: "zone", header: t("dashboard.zone_input"), cell: (n) => n.role?.zone ?? "-", sortValue: (n) => n.role?.zone ?? "", minWidth: 100 },
                                            {
                                                id: "tags",
                                                header: t("dashboard.tags_comma"),
                                                cell: (n) =>
                                                    Array.isArray(n.role?.tags)
                                                        ? n.role.tags.map((tg: string, i: number) => <Chip key={i} label={tg} size="small" sx={{ mr: 0.5 }} />)
                                                        : "-",
                                                minWidth: 140,
                                            },
                                            {
                                                id: "lastSeen",
                                                header: t("dashboard.cluster_col.last_seen"),
                                                cell: (n) => n.lastSeenSecsAgo ?? "-",
                                                sortValue: (n) => n.lastSeenSecsAgo ?? null,
                                                numeric: true,
                                                minWidth: 110,
                                            },
                                        ]}
                                    />
                                    <Button size="small" onClick={() => copyJSON(status)} sx={{ mt: 1 }}>
                                        {t("dashboard.copy_json")}
                                    </Button>
                                </Box>
                            )}
                        </Card>
                    </Box>
                )}

                {activeTab === "Partitions" && (
                                    <Box sx={{ px: 3, pb: 3 }}>
                        <Card sx={{ mb: 3 }}>
                            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                                <Typography variant="h6" sx={{
                                    fontWeight: 600
                                }}>{t("dashboard.partitions")}</Typography>
                            </Box>
                            {status && (
                                <Box sx={{ p: 2 }}>
                                    <DataTable<ClusterNode>
                                        rows={Array.isArray(status.nodes) ? status.nodes : []}
                                        getRowId={(n) => n.id}
                                        tableLabel={t("dashboard.partitions") as string}
                                        searchValue={(n) => n.id}
                                        searchPlaceholder={t("dashboard.partitions") as string}
                                        defaultSort={{ id: "id", dir: "asc" }}
                                        emptyState={{ title: t("common.no_results"), description: t("common.no_results_desc") }}
                                        columns={[
                                            {
                                                id: "id",
                                                header: t("dashboard.cluster_col.id"),
                                                cell: (n) => n.id,
                                                sortValue: (n) => n.id,
                                                minWidth: 140,
                                                truncate: true,
                                                textValue: (n) => n.id,
                                            },
                                            {
                                                id: "available",
                                                header: t("dashboard.available"),
                                                cell: (n) => (n.dataPartition ? formatBytes(n.dataPartition.available, i18n.language) : "-"),
                                                sortValue: (n) => n.dataPartition?.available ?? null,
                                                numeric: true,
                                                minWidth: 120,
                                            },
                                            {
                                                id: "total",
                                                header: t("dashboard.cluster_col.total"),
                                                cell: (n) => (n.dataPartition ? formatBytes(n.dataPartition.total, i18n.language) : "-"),
                                                sortValue: (n) => n.dataPartition?.total ?? null,
                                                numeric: true,
                                                minWidth: 120,
                                            },
                                            {
                                                id: "state",
                                                header: t("dashboard.cluster_col.state"),
                                                cell: (n) => (n.dataPartition ? <Chip label={t("dashboard.cluster_state_ok")} color="success" size="small" /> : <Chip label={t("dashboard.cluster_state_no_data")} size="small" />),
                                                minWidth: 100,
                                            },
                                        ]}
                                    />
                                </Box>
                            )}
                        </Card>
                    </Box>
                )}

                {activeTab === "Config" && (
                                    <Box sx={{ px: 3, pb: 3 }}>
                        {/* Cluster Layout Card */}
                        <Card sx={{ mb: 3 }}>
                            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="h6" sx={{
                                    fontWeight: 600
                                }}>{t("dashboard.cluster_layout")}</Typography>
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<Settings size={14} />}
                                        onClick={() => {
                                            GetClusterLayout()
                                                .then((r) => setLayout(r as components["schemas"]["GetClusterLayoutResponse"]))
                                                .catch((e: unknown) => notify({ severity: "error", message: (e as { message?: string })?.message || String(e) }))
                                        }}
                                    >
                                        {t("dashboard.layout")}
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<Settings size={14} />}
                                        onClick={() => {
                                            GetClusterLayoutHistory()
                                                .then((r) => setHistory(r as components["schemas"]["GetClusterLayoutHistoryResponse"]))
                                                .catch((e: unknown) => notify({ severity: "error", message: (e as { message?: string })?.message || String(e) }))
                                        }}
                                    >
                                        {t("dashboard.history")}
                                    </Button>
                                    <Button size="small" variant="outlined" startIcon={<Play size={14} />} onClick={handlePreview}>
                                        {t("dashboard.preview")}
                                    </Button>
                                    <Button size="small" color="error" variant="outlined" startIcon={<RotateCcw size={14} />} onClick={handleRevert}>
                                        {t("dashboard.revert")}
                                    </Button>
                                </Stack>
                            </Box>

                            <Box sx={{ p: 3 }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>{t("dashboard.cluster_layout_parameters")}</Typography>

                                <Grid container spacing={4}>
                                    <Grid size={{ xs: 12 }}>
                                        <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: 500,
                                                    mb: 1
                                                }}>{t("dashboard.zone_redundancy")}</Typography>
                                            <RadioGroup row value={zoneRedundancyType} onChange={(e) => setZoneRedundancyType(e.target.value as "maximum" | "atLeast")}>
                                                <FormControlLabel value="atLeast" control={<Radio />} label={t("dashboard.zone_redundancy_atleast")} />
                                                <FormControlLabel value="maximum" control={<Radio />} label={t("dashboard.zone_redundancy_maximum")} />
                                            </RadioGroup>
                                            {zoneRedundancyType === "atLeast" && (
                                                <TextField
                                                    type="number"
                                                    label={t("dashboard.zone_redundancy_atleast_count") as string}
                                                    value={zoneRedundancyAtLeast}
                                                    onChange={(e) => setZoneRedundancyAtLeast(e.target.value === "" ? "" : Number(e.target.value))}
                                                    sx={{ width: 150, mt: 2 }}
                                                    size="small"
                                                />
                                            )}
                                        </Box>
                                    </Grid>
                                </Grid>

                                <Divider sx={{ my: 4 }} />

                                <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>{t("dashboard.cluster_roles_edit")}</Typography>
                                <Grid container spacing={2} sx={{
                                    alignItems: "center"
                                }}>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.node_id_input")}
                                            value={roleDraft.id}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, id: e.target.value })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.zone_input")}
                                            value={roleDraft.zone}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, zone: e.target.value })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.capacity_bytes")}
                                            type="number"
                                            value={roleDraft.capacity ?? ""}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, capacity: e.target.value === "" ? null : Number(e.target.value) })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.tags_comma")}
                                            value={roleDraft.tags}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, tags: e.target.value })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <FormControlLabel
                                            control={<Checkbox checked={Boolean(roleDraft.remove)} onChange={(e) => setRoleDraft({ ...roleDraft, remove: e.target.checked })} />}
                                            label={t("dashboard.remove_role")}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <Button
                                            onClick={() => {
                                                if (!roleDraft.id) {
                                                    notify({ severity: "error", message: t("dashboard.node_id_required") })
                                                    return
                                                }
                                                setRoleEdits((prev) => [...prev, roleDraft])
                                                setRoleDraft({ id: "", remove: false, capacity: null, tags: "", zone: "" })
                                            }}
                                            variant="contained"
                                            size="small"
                                            fullWidth
                                        >
                                            {t("dashboard.add_role_change")}
                                        </Button>
                                    </Grid>
                                </Grid>

                                {roleEdits.length > 0 && (
                                    <Box sx={{ mt: 3 }}>
                                        <DataTable<RoleEdit>
                                            rows={roleEdits}
                                            getRowId={(r, index) => `${r.id}-${index}`}
                                            tableLabel={t("dashboard.cluster_roles_edit") as string}
                                            defaultSort={{ id: "id", dir: "asc" }}
                                            columns={[
                                                {
                                                    id: "id",
                                                    header: t("dashboard.cluster_col.id"),
                                                    cell: (r) => r.id,
                                                    sortValue: (r) => r.id,
                                                    minWidth: 140,
                                                    truncate: true,
                                                    textValue: (r) => r.id,
                                                },
                                                { id: "zone", header: t("dashboard.zone_input"), cell: (r) => r.zone ?? "-", sortValue: (r) => r.zone ?? "", minWidth: 100 },
                                                {
                                                    id: "capacity",
                                                    header: t("dashboard.capacity_bytes"),
                                                    cell: (r) => formatBytes(r.capacity, i18n.language),
                                                    sortValue: (r) => r.capacity ?? null,
                                                    numeric: true,
                                                    minWidth: 130,
                                                },
                                                { id: "tags", header: t("dashboard.tags_comma"), cell: (r) => r.tags ?? "-", sortValue: (r) => r.tags ?? "", minWidth: 130 },
                                                {
                                                    id: "remove",
                                                    header: t("dashboard.remove_role_col"),
                                                    cell: (r) => (r.remove ? t("common.yes") : t("common.no")),
                                                    sortValue: (r) => Boolean(r.remove),
                                                    minWidth: 100,
                                                },
                                                {
                                                    id: "actions",
                                                    header: t("common.actions"),
                                                    align: "right" as const,
                                                    minWidth: 110,
                                                    cell: (r) => (
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            onClick={() =>
                                                                setRoleEdits((prev) => prev.filter((item) => item !== r))
                                                            }
                                                        >
                                                            {t("dashboard.remove_role_col")}
                                                        </Button>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </Box>
                                )}

                                <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                                    <Button variant="contained" onClick={handleUpdateLayout}>
                                        {t("dashboard.cluster_update_layout")}
                                    </Button>
                                    <Button variant="contained" color="success" onClick={() => setApplyConfirmOpen(true)}>
                                        {t("dashboard.cluster_apply_layout")}
                                    </Button>
                                </Stack>
                            </Box>

                            {layout && (
                                <Box sx={{ mt: 2, p: 3, borderTop: "1px solid", borderColor: "divider" }}>
                                    <Typography variant="subtitle1" sx={{
                                        fontWeight: 600
                                    }}>{t("dashboard.current_layout")}</Typography>
                                    <Stack direction="row" spacing={4} sx={{ mt: 2 }}>
                                        <Box>
                                            <Typography variant="caption" sx={{
                                                color: "text.secondary"
                                            }}>{t("dashboard.partition_size")}</Typography>
                                            <Typography variant="body1">{formatBytes(layout.partitionSize, i18n.language)}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{
                                                color: "text.secondary"
                                            }}>{t("dashboard.layout_version")}</Typography>
                                            <Typography variant="body1">{String(layout.version)}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{
                                                color: "text.secondary"
                                            }}>{t("dashboard.zone_redundancy")}</Typography>
                                            <Typography variant="body1">
                                                {typeof layout.parameters.zoneRedundancy === "string"
                                                    ? layout.parameters.zoneRedundancy
                                                    : "atLeast" in (layout.parameters.zoneRedundancy as object)
                                                        ? `atLeast ${(layout.parameters.zoneRedundancy as { atLeast: number }).atLeast}`
                                                        : String(layout.parameters.zoneRedundancy)}
                                            </Typography>
                                        </Box>
                                    </Stack>

                                    <Divider sx={{ my: 3 }} />

                                    <Typography variant="subtitle2" sx={{ mb: 2 }}>{t("dashboard.cluster_roles_edit")}</Typography>
                                    <DataTable<LayoutRole>
                                        rows={Array.isArray(layout.roles) ? layout.roles : []}
                                        getRowId={(r) => r.id}
                                        tableLabel={t("dashboard.cluster_roles_edit") as string}
                                        searchValue={(r) => [r.id, r.zone ?? "", ...(r.tags ?? [])].join(" ")}
                                        defaultSort={{ id: "id", dir: "asc" }}
                                        emptyState={{ title: t("common.no_results"), description: t("common.no_results_desc") }}
                                        columns={[
                                            {
                                                id: "id",
                                                header: t("dashboard.cluster_col.id"),
                                                cell: (r) => r.id,
                                                sortValue: (r) => r.id,
                                                minWidth: 140,
                                                truncate: true,
                                                textValue: (r) => r.id,
                                            },
                                            { id: "zone", header: t("dashboard.zone_input"), cell: (r) => r.zone ?? "-", sortValue: (r) => r.zone ?? "", minWidth: 100 },
                                            {
                                                id: "capacity",
                                                header: t("dashboard.capacity_bytes"),
                                                cell: (r) => formatBytes(r.capacity, i18n.language),
                                                sortValue: (r) => r.capacity ?? null,
                                                numeric: true,
                                                minWidth: 130,
                                            },
                                            {
                                                id: "stored",
                                                header: t("dashboard.stored_partitions"),
                                                cell: (r) => r.storedPartitions ?? "-",
                                                sortValue: (r) => r.storedPartitions ?? null,
                                                numeric: true,
                                                minWidth: 140,
                                            },
                                            {
                                                id: "usable",
                                                header: t("dashboard.usable_capacity"),
                                                cell: (r) => formatBytes(r.usableCapacity, i18n.language),
                                                sortValue: (r) => r.usableCapacity ?? null,
                                                numeric: true,
                                                minWidth: 140,
                                            },
                                            {
                                                id: "tags",
                                                header: t("dashboard.tags_comma"),
                                                cell: (r) =>
                                                    Array.isArray(r.tags)
                                                        ? r.tags.map((tagName, tagIndex) => <Chip key={tagIndex} label={tagName} size="small" sx={{ mr: 0.5 }} />)
                                                        : "-",
                                                minWidth: 140,
                                            },
                                        ]}
                                    />
                                </Box>
                            )}
                        </Card>

                        {/* Cluster Layout History */}
                        {history && (
                            <Card sx={{ mb: 3, p: 3 }}>
                                <Box sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 2, mb: 2, display: "flex", justifyContent: "space-between" }}>
                                    <Typography variant="h6">{t("dashboard.cluster_history")}</Typography>
                                    <Button size="small" onClick={() => copyJSON(history)} startIcon={<FileJson size={14} />}>
                                        {t("dashboard.copy_json")}
                                    </Button>
                                </Box>
                                <DataTable<LayoutVersion>
                                    rows={Array.isArray(history.versions) ? history.versions : []}
                                    getRowId={(v) => String(v.version)}
                                    tableLabel={t("dashboard.cluster_history") as string}
                                    defaultSort={{ id: "version", dir: "desc" }}
                                    emptyState={{ title: t("common.no_results"), description: t("common.no_results_desc") }}
                                    columns={[
                                        {
                                            id: "version",
                                            header: t("dashboard.cluster_col.version"),
                                            cell: (v) => v.version,
                                            sortValue: (v) => v.version,
                                            numeric: true,
                                            minWidth: 90,
                                        },
                                        { id: "status", header: t("dashboard.cluster_col.status"), cell: (v) => v.status, sortValue: (v) => v.status, minWidth: 110 },
                                        {
                                            id: "gatewayNodes",
                                            header: t("dashboard.cluster_col.gateway_nodes"),
                                            cell: (v) => v.gatewayNodes,
                                            sortValue: (v) => v.gatewayNodes,
                                            numeric: true,
                                            minWidth: 130,
                                        },
                                        {
                                            id: "storageNodes",
                                            header: t("dashboard.cluster_col.storage_nodes"),
                                            cell: (v) => v.storageNodes,
                                            sortValue: (v) => v.storageNodes,
                                            numeric: true,
                                            minWidth: 130,
                                        },
                                    ]}
                                />
                            </Card>
                        )
                        }
                        {/* Skip Dead Nodes */}
                        <Card sx={{ mb: 3, p: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>{t("dashboard.cluster_skip_dead_nodes")}</Typography>
                            <Stack direction="row" spacing={2}>
                                <TextField
                                    placeholder={t("dashboard.cluster_skip_nodes_placeholder") as string}
                                    value={skipNodesInput}
                                    onChange={(e) => setSkipNodesInput(e.target.value)}
                                    fullWidth
                                    size="small"
                                />
                                <Button variant="contained" color="warning" onClick={handleSkipDead} startIcon={<Server size={16} />}>
                                    {t("dashboard.cluster_skip_dead_nodes")}
                                </Button>
                            </Stack>
                        </Card>
                    </Box >
                )}



                {/* S3 Browser Tab */}
                {
                    activeTab === "S3 Browser" && (
                        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            <S3Browser selectedProject={projectConfig ?? null} />
                        </Box>
                    )
                }

                {/* Logs Tab */}
                {
                    activeTab === "Logs" && (
                        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            <ActivityLogs />
                        </Box>
                    )
                }
            </Box >

            <Dialog open={applyConfirmOpen} onClose={() => setApplyConfirmOpen(false)}>
                <DialogTitle>{t("dashboard.cluster_apply_confirm_title")}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t("dashboard.cluster_apply_confirm_desc")}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApplyConfirmOpen(false)}>{t("common.cancel")}</Button>
                    <Button color="success" variant="contained" onClick={handleApplyLayout}>
                        {t("common.confirm")}
                    </Button>
                </DialogActions>
            </Dialog>

        </Box >
    );
}
