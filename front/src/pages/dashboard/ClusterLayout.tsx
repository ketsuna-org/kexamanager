import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Grid } from "@mui/material"
import { Activity, HardDrive, Server, Settings, RotateCcw, Play, FileJson } from "lucide-react"

import StatCard from "../../components/dashboard/StatCard"
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
import Snackbar from "@mui/material/Snackbar"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import Card from "@mui/material/Card"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Chip from "@mui/material/Chip"
import Divider from "@mui/material/Divider"
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

interface ClusterLayoutProps {
    selectedProject?: { id: number; name: string; admin_url?: string; type?: string } | null
}

export default function ClusterLayout({ selectedProject }: ClusterLayoutProps) {
    const { t } = useTranslation()
    // helper: format bytes to human readable (KiB, MiB, GiB)
    function formatBytes(bytes?: number | null) {
        if (bytes === undefined || bytes === null) return "-"
        if (bytes === 0) return "0 B"
        const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
        const i = Math.floor(Math.log(bytes) / Math.log(1024))
        const v = bytes / Math.pow(1024, i)
        return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)} ${units[i]}`
    }

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
    // Snackbar for notifications
    const [snack, setSnack] = useState<{ open: boolean; severity: "success" | "error" | "info"; message: string }>({ open: false, severity: "info", message: "" })
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
                    setSnack({ open: true, severity: "error", message: msg })
                }
            })
            .catch((e: unknown) => {
                const msg = (e as { message?: string })?.message || String(e)
                setSnack({ open: true, severity: "error", message: msg })
            })
            .finally(() => setLoading(false))
    }, [])

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
            setSnack({ open: true, severity: "success", message: t("dashboard.cluster_update_success", "Layout updated") })
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setSnack({ open: true, severity: "error", message: msg })
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
                setSnack({ open: true, severity: "error", message: t("dashboard.no_current_layout") })
                return
            }
            const version = 1 + newLayout.version;
            await ApplyClusterLayout({ version } as components["schemas"]["ApplyClusterLayoutRequest"])

            await refreshAll()
            setSnack({ open: true, severity: "success", message: t("dashboard.cluster_apply_success", "Layout applied") })
            setApplyConfirmOpen(false)
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    async function handlePreview() {
        try {
            const res = await PreviewClusterLayoutChanges()
            const asRecord = res as Record<string, unknown>
            if (asRecord && typeof asRecord === "object" && "error" in asRecord) {
                const msg = String(asRecord["error"])
                setSnack({ open: true, severity: "error", message: msg })
                return
            }
            setHistory(res as unknown as components["schemas"]["GetClusterLayoutHistoryResponse"])
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    async function handleRevert() {
        try {
            await RevertClusterLayout()
            await refreshAll()
            setSnack({ open: true, severity: "success", message: t("dashboard.cluster_revert_success", "Layout reverted") })
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setSnack({ open: true, severity: "error", message: msg })
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
            setSnack({ open: true, severity: "success", message: t("dashboard.cluster_skip_success", "Skip dead nodes requested") })
            return res
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    function copyJSON(obj: unknown) {
        try {
            const txt = JSON.stringify(obj, null, 2)
            navigator.clipboard.writeText(txt)
        } catch (e) {
            console.warn("copy failed", e)
        }
    }



    return (
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
            {/* Content Header with Refresh Action */}
            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center", bgcolor: "background.paper" }}>
                <Typography variant="h6" fontWeight={600} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Activity size={20} />
                    {t(`dashboard.cluster_tab_${activeTab.toLowerCase().replace(" ", "_")}`, activeTab)}
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RotateCcw size={14} />}
                        onClick={refreshAll}
                        disabled={loading}
                    >
                        {loading ? t("common.loading", "Loading...") : t("common.refresh", "Refresh")}
                    </Button>
                </Box>
            </Box>

            {/* Content Body */}
            <Box sx={{ flex: 1, overflowY: "auto", p: 0 }}>
                {activeTab === "Overview" && (
                    <Box sx={{ p: 3 }}>
                        {/* Stats Cards */}
                        <Grid container spacing={3} sx={{ mb: 4 }}>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.connected_nodes", "Nodes")}
                                    value={health ? `${health.connectedNodes} / ${health.knownNodes}` : "-"}
                                    icon={Server}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.storage_nodes", "Storage")}
                                    value={health ? `${health.storageNodesUp} / ${health.storageNodes}` : "-"}
                                    icon={HardDrive}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.total_capacity")}
                                    value={storageData ? formatBytes(storageData.data.total) : "-"}
                                    icon={HardDrive}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                <StatCard
                                    label={t("dashboard.used_space")}
                                    value={storageData ? formatBytes(storageData.data.used) : "-"}
                                    icon={Activity}
                                />
                            </Grid>
                        </Grid>

                        {/* Cluster Storage Overview */}
                        {status && storageData && (
                            <Card sx={{ mb: 3 }}>
                                <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                                    <Typography variant="h6" fontWeight={600}>{t("dashboard.cluster_storage_overview", "Cluster Storage Overview")}</Typography>
                                </Box>
                                <Box sx={{ p: 3 }}>
                                    <Grid container spacing={4} alignItems="center">
                                        <Grid size={{ xs: 12, md: 7 }}>
                                            <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
                                                {t("dashboard.storage_breakdown", "Storage Breakdown")}
                                            </Typography>
                                            <Box sx={{ height: 300, width: "100%" }}>
                                                <ResponsiveContainer>
                                                    <BarChart data={[{
                                                        name: t("dashboard.data_storage", "Data Storage"),
                                                        total: storageData.data.total,
                                                        used: storageData.data.used,
                                                        available: storageData.data.available
                                                    }]} layout="vertical" barSize={30}>
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                                                        <XAxis type="number" tickFormatter={(value) => formatBytes(value)} stroke="#94a3b8" fontSize={12} />
                                                        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={100} />
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f1f5f9" }}
                                                            formatter={(value: number) => [formatBytes(value), ""]}
                                                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                                                        />
                                                        <Bar dataKey="used" stackId="a" fill="#0EA5E9" name={t("dashboard.used", "Used")} radius={[4, 0, 0, 4]} />
                                                        <Bar dataKey="available" stackId="a" fill="#1E293B" name={t("dashboard.available", "Available")} radius={[0, 4, 4, 0]} />
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
                    <Box sx={{ p: 3 }}>
                        <Card sx={{ mb: 3 }}>
                            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="h6" fontWeight={600}>{t("dashboard.cluster_nodes", "Cluster Nodes")}</Typography>
                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() =>
                                        GetClusterStatus()
                                            .then((r) => setStatus(r as components["schemas"]["GetClusterStatusResponse"]))
                                            .catch((e: unknown) => setSnack({ open: true, severity: "error", message: (e as { message?: string })?.message || String(e) }))
                                    }
                                >
                                    {t("dashboard.refresh_status", "Refresh")}
                                </Button>
                            </Box>
                            {status && (
                                <Box sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                        {t("dashboard.cluster_status")}: {status.layoutVersion}
                                    </Typography>
                                    <TableContainer sx={{ overflowX: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>ID</TableCell>
                                                    <TableCell>Hostname</TableCell>
                                                    <TableCell>Address</TableCell>
                                                    <TableCell>Garage Version</TableCell>
                                                    <TableCell>Up</TableCell>
                                                    <TableCell>Draining</TableCell>
                                                    <TableCell>Zone</TableCell>
                                                    <TableCell>Tags</TableCell>
                                                    <TableCell>Last seen (s)</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {Array.isArray(status.nodes) &&
                                                    status.nodes.map((n) => (
                                                        <TableRow key={n.id}>
                                                            <TableCell>{n.id}</TableCell>
                                                            <TableCell>{n.hostname ?? "-"}</TableCell>
                                                            <TableCell>{n.addr ?? "-"}</TableCell>
                                                            <TableCell>{n.garageVersion ?? "-"}</TableCell>
                                                            <TableCell>{n.isUp ? <Chip label={t("dashboard.node_up")} color="success" size="small" /> : <Chip label={t("dashboard.node_down")} color="default" size="small" />}</TableCell>
                                                            <TableCell>{n.draining ? <Chip label="draining" size="small" /> : "-"}</TableCell>
                                                            <TableCell>{n.role?.zone ?? "-"}</TableCell>
                                                            <TableCell>
                                                                {Array.isArray(n.role?.tags) ? n.role!.tags.map((tg: string, i: number) => <Chip key={i} label={tg} size="small" sx={{ mr: 0.5 }} />) : "-"}
                                                            </TableCell>
                                                            <TableCell>{n.lastSeenSecsAgo ?? "-"}</TableCell>
                                                        </TableRow>
                                                    ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                    <Button size="small" onClick={() => copyJSON(status)} sx={{ mt: 1 }}>
                                        {t("dashboard.copy_json")}
                                    </Button>
                                </Box>
                            )}
                        </Card>
                    </Box>
                )}

                {activeTab === "Partitions" && (
                    <Box sx={{ p: 3 }}>
                        <Card sx={{ mb: 3 }}>
                            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                                <Typography variant="h6" fontWeight={600}>{t("dashboard.partitions", "Partitions")}</Typography>
                            </Box>
                            {status && (
                                <TableContainer sx={{ p: 2 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>ID</TableCell>
                                                <TableCell>Available</TableCell>
                                                <TableCell>Total</TableCell>
                                                <TableCell>State</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {Array.isArray(status.nodes) && status.nodes.map((n) => (
                                                <TableRow key={n.id}>
                                                    <TableCell>{n.id}</TableCell>
                                                    <TableCell>{n.dataPartition ? formatBytes(n.dataPartition.available) : "-"}</TableCell>
                                                    <TableCell>{n.dataPartition ? formatBytes(n.dataPartition.total) : "-"}</TableCell>
                                                    <TableCell>
                                                        {/* Placeholder for real partition health if available */}
                                                        {n.dataPartition ? <Chip label="OK" color="success" size="small" /> : <Chip label="No Data" size="small" />}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Card>
                    </Box>
                )}

                {activeTab === "Config" && (
                    <Box sx={{ p: 3 }}>
                        {/* Cluster Layout Card */}
                        <Card sx={{ mb: 3 }}>
                            <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="h6" fontWeight={600}>{t("dashboard.cluster_layout", "Cluster Layout")}</Typography>
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<Settings size={14} />}
                                        onClick={() => {
                                            GetClusterLayout()
                                                .then((r) => setLayout(r as components["schemas"]["GetClusterLayoutResponse"]))
                                                .catch((e: unknown) => setSnack({ open: true, severity: "error", message: (e as { message?: string })?.message || String(e) }))
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
                                                .catch((e: unknown) => setSnack({ open: true, severity: "error", message: (e as { message?: string })?.message || String(e) }))
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
                                            <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>{t("dashboard.zone_redundancy")}</Typography>
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
                                <Grid container spacing={2} alignItems="center">
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.node_id_input", "Node ID")}
                                            value={roleDraft.id}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, id: e.target.value })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.zone_input", "Zone")}
                                            value={roleDraft.zone}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, zone: e.target.value })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.capacity_bytes", "Capacity (Bytes)")}
                                            type="number"
                                            value={roleDraft.capacity ?? ""}
                                            onChange={(e) => setRoleDraft({ ...roleDraft, capacity: e.target.value === "" ? null : Number(e.target.value) })}
                                            fullWidth
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 2 }}>
                                        <TextField
                                            label={t("dashboard.tags_comma", "Tags (comma)")}
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
                                                    setSnack({ open: true, severity: "error", message: "Node ID required" })
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
                                    <TableContainer sx={{ mt: 3, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>ID</TableCell>
                                                    <TableCell>{t("dashboard.zone_input", "Zone")}</TableCell>
                                                    <TableCell>{t("dashboard.capacity_bytes", "Capacity")}</TableCell>
                                                    <TableCell>{t("dashboard.tags_comma", "Tags")}</TableCell>
                                                    <TableCell>{t("dashboard.remove_role_col", "Remove")}</TableCell>
                                                    <TableCell align="right">{t("common.actions")}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {roleEdits.map((r, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell sx={{ fontFamily: "monospace" }}>{r.id}</TableCell>
                                                        <TableCell>{r.zone ?? "-"}</TableCell>
                                                        <TableCell>{r.capacity ?? "-"}</TableCell>
                                                        <TableCell>{r.tags ?? "-"}</TableCell>
                                                        <TableCell>{r.remove ? "Yes" : "No"}</TableCell>
                                                        <TableCell align="right">
                                                            <Button size="small" color="error" onClick={() => setRoleEdits((prev) => prev.filter((_, j) => j !== i))}>
                                                                Remove
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}

                                <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                                    <Button variant="contained" onClick={handleUpdateLayout}>
                                        {t("dashboard.cluster_update_layout", "Update layout")}
                                    </Button>
                                    <Button variant="contained" color="success" onClick={() => setApplyConfirmOpen(true)}>
                                        {t("dashboard.cluster_apply_layout", "Apply layout")}
                                    </Button>
                                </Stack>
                            </Box>

                            {layout && (
                                <Box sx={{ mt: 2, p: 3, borderTop: "1px solid", borderColor: "divider" }}>
                                    <Typography variant="subtitle1" fontWeight={600}>{t("dashboard.current_layout", "Current Layout Details")}</Typography>
                                    <Stack direction="row" spacing={4} sx={{ mt: 2 }}>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">{t("dashboard.partition_size", "Partition Size")}</Typography>
                                            <Typography variant="body1">{formatBytes(layout.partitionSize ?? null)}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">{t("dashboard.layout_version", "Version")}</Typography>
                                            <Typography variant="body1">{String(layout.version)}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">{t("dashboard.zone_redundancy", "Zone Redundancy")}</Typography>
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

                                    <Typography variant="subtitle2" sx={{ mb: 2 }}>{t("dashboard.cluster_roles_edit", "Roles")}</Typography>
                                    <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>ID</TableCell>
                                                    <TableCell>{t("dashboard.zone_input", "Zone")}</TableCell>
                                                    <TableCell>{t("dashboard.capacity_bytes", "Capacity")}</TableCell>
                                                    <TableCell>{t("dashboard.stored_partitions", "Stored partitions")}</TableCell>
                                                    <TableCell>{t("dashboard.usable_capacity", "Usable capacity")}</TableCell>
                                                    <TableCell>{t("dashboard.tags_comma", "Tags")}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {Array.isArray(layout.roles) &&
                                                    layout.roles.map((r) => (
                                                        <TableRow key={r.id}>
                                                            <TableCell sx={{ fontFamily: "monospace" }}>{r.id}</TableCell>
                                                            <TableCell>{r.zone ?? "-"}</TableCell>
                                                            <TableCell>{formatBytes(r.capacity)}</TableCell>
                                                            <TableCell>{r.storedPartitions ?? "-"}</TableCell>
                                                            <TableCell>{formatBytes(r.usableCapacity) ?? "-"}</TableCell>
                                                            <TableCell>
                                                                {Array.isArray(r.tags) && r.tags.map((t, i) => (
                                                                    <Chip key={i} label={t} size="small" sx={{ mr: 0.5 }} />
                                                                ))}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
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
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Version</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell>Gateway nodes</TableCell>
                                                <TableCell>Storage nodes</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {Array.isArray(history.versions) &&
                                                history.versions.map((v) => (
                                                    <TableRow key={v.version}>
                                                        <TableCell>{v.version}</TableCell>
                                                        <TableCell>{v.status}</TableCell>
                                                        <TableCell>{v.gatewayNodes}</TableCell>
                                                        <TableCell>{v.storageNodes}</TableCell>
                                                    </TableRow>
                                                ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Card>
                        )
                        }
                        {/* Skip Dead Nodes */}
                        <Card sx={{ mb: 3, p: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>{t("dashboard.cluster_skip_dead_nodes", "Skip dead nodes")}</Typography>
                            <Stack direction="row" spacing={2}>
                                <TextField
                                    placeholder={t("dashboard.cluster_skip_nodes_placeholder") as string}
                                    value={skipNodesInput}
                                    onChange={(e) => setSkipNodesInput(e.target.value)}
                                    fullWidth
                                    size="small"
                                />
                                <Button variant="contained" color="warning" onClick={handleSkipDead} startIcon={<Server size={16} />}>
                                    {t("dashboard.cluster_skip_dead_nodes", "Skip dead nodes")}
                                </Button>
                            </Stack>
                        </Card>
                    </Box >
                )}



                {/* S3 Browser Tab */}
                {
                    activeTab === "S3 Browser" && (
                        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            <S3Browser selectedProject={selectedProject || null} />
                        </Box>
                    )
                }

                {/* Logs Tab */}
                {
                    activeTab === "Logs" && (
                        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            <ActivityLogs selectedProject={selectedProject || null} />
                        </Box>
                    )
                }
            </Box >

            <Dialog open={applyConfirmOpen} onClose={() => setApplyConfirmOpen(false)}>
                <DialogTitle>{t("dashboard.cluster_apply_confirm_title", "Apply staged layout?")}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t(
                            "dashboard.cluster_apply_confirm_desc",
                            "Applying the staged layout will change cluster configuration and may impact availability. Are you sure you want to proceed?",
                        )}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApplyConfirmOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                    <Button color="success" variant="contained" onClick={handleApplyLayout}>
                        {t("common.confirm", "Confirm")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snack.open}
                autoHideDuration={6000}
                onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert onClose={() => setSnack((prev) => ({ ...prev, open: false }))} severity={snack.severity} sx={{ width: "100%" }}>
                    {snack.message}
                </Alert>
            </Snackbar>
        </Box >
    )
}
