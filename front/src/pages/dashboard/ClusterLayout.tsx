import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
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
    GetClusterStatistics,
} from "../../utils/apiWrapper"
import Snackbar from "@mui/material/Snackbar"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Button from "@mui/material/Button"
import Paper from "@mui/material/Paper"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import CircularProgress from "@mui/material/CircularProgress"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Chip from "@mui/material/Chip"
// Grid not used; using Box-based layout instead
import Divider from "@mui/material/Divider"
// note: List imports removed (unused)
import MetricPaper from "./components/MetricPaper"
import RawCollapse from "./components/RawCollapse"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogContentText from "@mui/material/DialogContentText"
import DialogTitle from "@mui/material/DialogTitle"
import DevicesIcon from "@mui/icons-material/Devices"
import StorageIcon from "@mui/icons-material/Storage"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import GroupWorkIcon from "@mui/icons-material/GroupWork"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

export default function ClusterLayout() {
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
    const [stats, setStats] = useState<components["schemas"]["GetClusterStatisticsResponse"] | null>(null)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Snackbar
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

    useEffect(() => {
        refreshAll()
    }, [])

    function refreshAll() {
        setLoading(true)
        setError(null)
        Promise.allSettled([GetClusterStatus(), GetClusterLayout(), GetClusterLayoutHistory(), GetClusterHealth(), GetClusterStatistics()])
            .then((results) => {
                const [rStatus, rLayout, rHistory, rHealth, rStats] = results
                if (rStatus.status === "fulfilled") setStatus(rStatus.value as components["schemas"]["GetClusterStatusResponse"])
                if (rLayout.status === "fulfilled") setLayout(rLayout.value as components["schemas"]["GetClusterLayoutResponse"])
                if (rHistory.status === "fulfilled") setHistory(rHistory.value as components["schemas"]["GetClusterLayoutHistoryResponse"])
                if (rHealth.status === "fulfilled") setHealth(rHealth.value as components["schemas"]["GetClusterHealthResponse"])
                if (rStats.status === "fulfilled") setStats(rStats.value as components["schemas"]["GetClusterStatisticsResponse"])
                const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined
                if (rejected) {
                    const reason = (rejected as PromiseRejectedResult).reason as unknown
                    setError((reason as { message?: string })?.message || String(reason ?? "Error"))
                }
            })
            .catch((e: unknown) => setError((e as { message?: string })?.message || String(e)))
            .finally(() => setLoading(false))
    }

    async function handleUpdateLayout() {
        setError(null)
        try {
            const req: components["schemas"]["UpdateClusterLayoutRequest"] = {}
            // parameters
            if (zoneRedundancyType === "maximum") req.parameters = { zoneRedundancy: "maximum" }
            else if (zoneRedundancyAtLeast !== "" && zoneRedundancyAtLeast !== null) req.parameters = { zoneRedundancy: { atLeast: Number(zoneRedundancyAtLeast) } }
            // roles
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
            setError(msg)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    async function handleApplyLayout() {
        setError(null)
        try {
            // First update staged layout using same input as Update
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
                setError("No current layout available")
                return
            }
            const version = 1 + newLayout.version;
            const res = await ApplyClusterLayout({ version } as components["schemas"]["ApplyClusterLayoutRequest"])
            // apply may return a status-like response; refresh afterward
            await refreshAll()
            setSnack({ open: true, severity: "success", message: t("dashboard.cluster_apply_success", "Layout applied") })
            setApplyConfirmOpen(false)
            return res
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setError(msg)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    async function handlePreview() {
        setError(null)
        try {
            const res = await PreviewClusterLayoutChanges()
            // if API returns an error payload like { error: '...' } we show a snack and do not update history
            const asUnknown = res as unknown
            if (asUnknown && typeof asUnknown === "object" && "error" in (asUnknown as Record<string, unknown>)) {
                const msg = String((asUnknown as Record<string, unknown>)["error"] ?? JSON.stringify(asUnknown))
                setSnack({ open: true, severity: "error", message: msg })
                return
            }
            // preview response not stored separately; put in history for quick view
            setHistory(res as unknown as components["schemas"]["GetClusterLayoutHistoryResponse"])
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    async function handleRevert() {
        setError(null)
        try {
            const res = await RevertClusterLayout()
            await refreshAll()
            setSnack({ open: true, severity: "success", message: t("dashboard.cluster_revert_success", "Layout reverted") })
            return res
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e)
            setError(msg)
            setSnack({ open: true, severity: "error", message: msg })
        }
    }

    async function handleSkipDead() {
        setError(null)
        try {
            // Accept either JSON array of node IDs or comma-separated list
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
            setError(msg)
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
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Stack direction="column" spacing={2} sx={{ mb: 2, flexShrink: 0 }}>
                <Box>
                    <Typography variant="h5">{t("dashboard.cluster")}</Typography>
                    <Typography variant="body2">{t("dashboard.cluster_desc")}</Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap" }}>
                    <Button variant="outlined" onClick={refreshAll}>
                        {t("common.refresh")}
                    </Button>
                </Stack>
            </Stack>

            <Box sx={{ flex: 1, overflow: "auto" }}>
                {loading && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2 }}>
                        <CircularProgress size={18} /> <Typography>{t("common.loading")}</Typography>
                    </Box>
                )}
                {error && <Typography color="error" sx={{ p: 2 }}>{error}</Typography>}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6">{t("dashboard.cluster_status")}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                        variant="contained"
                        onClick={() =>
                            GetClusterStatus()
                                .then((r) => setStatus(r as components["schemas"]["GetClusterStatusResponse"]))
                                .catch((e: unknown) => setError((e as { message?: string })?.message || String(e)))
                        }
                    >
                        {t("dashboard.cluster_get_status", "Get status")}
                    </Button>
                </Stack>
                {status && (
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="subtitle2">
                            {t("dashboard.cluster_status")}: {status.layoutVersion}
                        </Typography>
                        <TableContainer sx={{ overflowX: "auto" }}>
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
                                        <TableCell>Available Partition</TableCell>
                                        <TableCell>Used Partition</TableCell>
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
                                                <TableCell>{n.isUp ? <Chip label="up" color="success" size="small" /> : <Chip label="down" color="default" size="small" />}</TableCell>
                                                <TableCell>{n.draining ? <Chip label="draining" size="small" /> : "-"}</TableCell>
                                                <TableCell>{n.role?.zone ?? "-"}</TableCell>
                                                <TableCell>
                                                    {Array.isArray(n.role?.tags) ? n.role!.tags.map((tg: string, i: number) => <Chip key={i} label={tg} size="small" sx={{ mr: 0.5 }} />) : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    {n.dataPartition ? (
                                                            <Typography variant="caption" color="text.secondary">
                                                                {formatBytes(n.dataPartition.available)}
                                                            </Typography>
                                                    ) : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    {n.dataPartition ? (

                                                            <Typography variant="caption" color="text.secondary">
                                                                {formatBytes(n.dataPartition.total)}
                                                            </Typography>
                                                    ) : "-"}
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
            </Paper>

            {/* Cluster Storage Overview Chart */}
            {status && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6">{t("dashboard.cluster_storage_overview", "Cluster Storage Overview")}</Typography>
                    {(() => {
                        const storageData = calculateClusterStorage()
                        if (!storageData) return null

                        const chartData = [
                            {
                                name: t("dashboard.data_storage", "Data Storage"),
                                total: storageData.data.total,
                                used: storageData.data.used,
                                available: storageData.data.available
                            }
                        ]

                        const pieData = [
                            { name: t("dashboard.used_space", "Used"), value: storageData.data.used, color: "#f44336" },
                            { name: t("dashboard.available_space", "Available"), value: storageData.data.available, color: "#4caf50" }
                        ]

                        return (
                            <Box sx={{ mt: 2 }}>
                                <Stack direction={{ xs: "column", lg: "row" }} spacing={3}>
                                    {/* Bar Chart */}
                                    <Box sx={{ flex: 1, minHeight: 300 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                            {t("dashboard.storage_breakdown", "Storage Breakdown")}
                                        </Typography>
                                        <ResponsiveContainer width="100%" height={250}>
                                            <BarChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis tickFormatter={(value) => formatBytes(value)} />
                                                <Tooltip formatter={(value: number) => [formatBytes(value), ""]} />
                                                <Bar dataKey="used" stackId="a" fill="#f44336" name={t("dashboard.used", "Used")} />
                                                <Bar dataKey="available" stackId="a" fill="#4caf50" name={t("dashboard.available", "Available")} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Box>

                                    {/* Pie Chart */}
                                    <Box sx={{ flex: 1, minHeight: 300 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                            {t("dashboard.total_usage", "Total Usage")}
                                        </Typography>
                                        <ResponsiveContainer width="100%" height={250}>
                                            <PieChart>
                                                <Pie
                                                    data={pieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={80}
                                                    dataKey="value"
                                                >
                                                    {pieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value: number) => [formatBytes(value), ""]} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </Box>
                                </Stack>

                                {/* Summary Stats */}
                                <Box sx={{ mt: 3, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
                                    <MetricPaper
                                        color="primary"
                                        icon={<StorageIcon />}
                                        label={t("dashboard.total_data_capacity", "Total Data Capacity")}
                                        value={formatBytes(storageData.data.total)}
                                    />
                                    <MetricPaper
                                        color="secondary"
                                        icon={<StorageIcon />}
                                        label={t("dashboard.used_data", "Used Data")}
                                        value={formatBytes(storageData.data.used)}
                                    />
                                </Box>
                            </Box>
                        )
                    })()}
                </Paper>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6">{t("dashboard.cluster_stats")}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                        variant="contained"
                        onClick={() =>
                            GetClusterStatistics()
                                .then((r) => setStats(r as components["schemas"]["GetClusterStatisticsResponse"]))
                                .catch((e: unknown) => setError((e as { message?: string })?.message || String(e)))
                        }
                    >
                        {t("dashboard.cluster_stats")}
                    </Button>
                </Stack>
                {stats && (
                    <Box sx={{ mt: 1 }}>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: "background.paper" }}>
                            <Typography variant="caption" color="text.secondary">
                                {t("dashboard.cluster_stats_freeform")}
                            </Typography>
                            <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, marginBottom: 8 }}>{stats.freeform}</pre>
                            <Box display="flex" justifyContent="flex-end" gap={1}>
                                <Button size="small" onClick={() => copyJSON(stats)} startIcon={<></>}>
                                    {t("dashboard.copy_json")}
                                </Button>
                            </Box>
                        </Paper>
                    </Box>
                )}
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6">{t("dashboard.cluster_status")}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                        variant="contained"
                        onClick={() =>
                            GetClusterHealth()
                                .then((r) => setHealth(r as components["schemas"]["GetClusterHealthResponse"]))
                                .catch((e: unknown) => setError((e as { message?: string })?.message || String(e)))
                        }
                    >
                        {t("dashboard.cluster_get_health", "Get health")}
                    </Button>
                </Stack>
                {health && (
                    <Box sx={{ mt: 1 }}>
                        <Box sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "1fr 1fr",
                                lg: "repeat(4, 1fr)"
                            },
                            gap: 2
                        }}>
                            <MetricPaper color="primary" icon={<DevicesIcon />} label={t("dashboard.connected_nodes")} value={`${health.connectedNodes} / ${health.knownNodes}`} />
                            <MetricPaper color="primary" icon={<StorageIcon />} label={t("dashboard.storage_nodes")} value={`${health.storageNodesUp} / ${health.storageNodes}`} />
                            <MetricPaper color="primary" icon={<CheckCircleIcon />} label={t("dashboard.partitions_all_ok")} value={`${health.partitionsAllOk} / ${health.partitions}`} />
                            <MetricPaper color="primary" icon={<GroupWorkIcon />} label={t("dashboard.partitions_quorum")} value={`${health.partitionsQuorum} / ${health.partitions}`} />
                        </Box>
                        <Box sx={{ mt: 1 }}>
                            <RawCollapse data={health} defaultOpen={false} />
                        </Box>
                    </Box>
                )}
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6">{t("dashboard.cluster")}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }}>
                    <Button
                        onClick={() => {
                            GetClusterLayout()
                                .then((r) => setLayout(r as components["schemas"]["GetClusterLayoutResponse"]))
                                .catch((e: unknown) => setError((e as { message?: string })?.message || String(e)))
                        }}
                    >
                        {t("dashboard.cluster_get_layout", "Get layout")}
                    </Button>
                    <Button
                        onClick={() => {
                            GetClusterLayoutHistory()
                                .then((r) => setHistory(r as components["schemas"]["GetClusterLayoutHistoryResponse"]))
                                .catch((e: unknown) => setError((e as { message?: string })?.message || String(e)))
                        }}
                    >
                        {t("dashboard.cluster_get_history", "Get history")}
                    </Button>
                    <Button onClick={handlePreview}>{t("dashboard.cluster_preview_changes", "Preview changes")}</Button>
                    <Button color="error" onClick={handleRevert}>
                        {t("dashboard.cluster_revert_layout", "Revert layout")}
                    </Button>
                </Stack>

                <Box sx={{ mt: 1 }}>
                    <Typography variant="subtitle2">{t("dashboard.cluster_layout_parameters")}</Typography>
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">{t("dashboard.zone_redundancy")}</Typography>
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
                                sx={{ width: 120, mt: 1 }}
                            />
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="subtitle2">{t("dashboard.cluster_roles_edit")}</Typography>
                    <Box sx={{
                        display: "grid",
                        gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, 1fr)",
                            lg: "repeat(3, 1fr)"
                        },
                        gap: 2,
                        mt: 1
                    }}>
                        <TextField
                            label="node id"
                            value={roleDraft.id}
                            onChange={(e) => setRoleDraft({ ...roleDraft, id: e.target.value })}
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="zone"
                            value={roleDraft.zone}
                            onChange={(e) => setRoleDraft({ ...roleDraft, zone: e.target.value })}
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="capacity (bytes)"
                            type="number"
                            value={roleDraft.capacity ?? ""}
                            onChange={(e) => setRoleDraft({ ...roleDraft, capacity: e.target.value === "" ? null : Number(e.target.value) })}
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="tags (comma)"
                            value={roleDraft.tags}
                            onChange={(e) => setRoleDraft({ ...roleDraft, tags: e.target.value })}
                            fullWidth
                            size="small"
                        />
                        <FormControlLabel
                            control={<Checkbox checked={Boolean(roleDraft.remove)} onChange={(e) => setRoleDraft({ ...roleDraft, remove: e.target.checked })} />}
                            label={t("dashboard.remove_role")}
                        />
                        <Button
                            onClick={() => {
                                if (!roleDraft.id) {
                                    setError("node id required")
                                    return
                                }
                                setRoleEdits((prev) => [...prev, roleDraft])
                                setRoleDraft({ id: "", remove: false, capacity: null, tags: "", zone: "" })
                            }}
                            variant="outlined"
                            size="small"
                            sx={{ alignSelf: "start" }}
                        >
                            {t("dashboard.add_role_change")}
                        </Button>
                    </Box>

                    {roleEdits.length > 0 && (
                        <TableContainer sx={{ mt: 2, overflowX: "auto" }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>id</TableCell>
                                        <TableCell>zone</TableCell>
                                        <TableCell>capacity</TableCell>
                                        <TableCell>tags</TableCell>
                                        <TableCell>remove</TableCell>
                                        <TableCell>actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {roleEdits.map((r, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{r.id}</TableCell>
                                            <TableCell>{r.zone ?? "-"}</TableCell>
                                            <TableCell>{r.capacity ?? "-"}</TableCell>
                                            <TableCell>{r.tags ?? "-"}</TableCell>
                                            <TableCell>{r.remove ? "yes" : "no"}</TableCell>
                                            <TableCell>
                                                <Button size="small" onClick={() => setRoleEdits((prev) => prev.filter((_, j) => j !== i))}>
                                                    remove
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button variant="contained" onClick={handleUpdateLayout}>
                            {t("dashboard.cluster_update_layout", "Update layout")}
                        </Button>
                        <Button variant="contained" color="success" onClick={() => setApplyConfirmOpen(true)}>
                            {t("dashboard.cluster_apply_layout", "Apply layout")}
                        </Button>
                    </Stack>

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
                </Box>

                {layout && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle1">{t("dashboard.cluster")}</Typography>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 1 }}>
                            <Box sx={{ minWidth: 180 }}>
                                <Typography>
                                    <b>partitionSize:</b> {formatBytes(layout.partitionSize ?? null)}
                                </Typography>
                            </Box>
                            <Box sx={{ minWidth: 120 }}>
                                <Typography>
                                    <b>version:</b> {String(layout.version)}
                                </Typography>
                            </Box>
                            <Box sx={{ minWidth: 200 }}>
                                <Typography>
                                    <b>zoneRedundancy:</b>{" "}
                                    {typeof layout.parameters.zoneRedundancy === "string"
                                        ? layout.parameters.zoneRedundancy
                                        : "atLeast" in (layout.parameters.zoneRedundancy as object)
                                          ? `atLeast ${(layout.parameters.zoneRedundancy as { atLeast: number }).atLeast}`
                                          : String(layout.parameters.zoneRedundancy)}
                                </Typography>
                            </Box>
                        </Box>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2">Roles</Typography>
                        <TableContainer sx={{ overflowX: "auto" }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>ID</TableCell>
                                        <TableCell>Zone</TableCell>
                                        <TableCell>Capacity</TableCell>
                                        <TableCell>Stored partitions</TableCell>
                                        <TableCell>Usable capacity</TableCell>
                                        <TableCell>Tags</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {Array.isArray(layout.roles) &&
                                        layout.roles.map((r) => (
                                            <TableRow key={r.id}>
                                                <TableCell>{r.id}</TableCell>
                                                <TableCell>{r.zone}</TableCell>
                                                <TableCell>{formatBytes(r.capacity)}</TableCell>
                                                <TableCell>{r.storedPartitions ?? "-"}</TableCell>
                                                <TableCell>{formatBytes(r.usableCapacity)}</TableCell>
                                                <TableCell>{Array.isArray(r.tags) ? r.tags.map((tg, i) => <Chip key={i} label={tg} size="small" sx={{ mr: 0.5 }} />) : "-"}</TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Button size="small" onClick={() => copyJSON(layout)} sx={{ mt: 1 }}>
                            {t("dashboard.copy_json")}
                        </Button>
                    </Box>
                )}

                {history && (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle1">{t("dashboard.cluster_history")}</Typography>
                        <TableContainer sx={{ overflowX: "auto" }}>
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
                        <Button size="small" onClick={() => copyJSON(history)} sx={{ mt: 1 }}>
                            {t("dashboard.copy_json")}
                        </Button>
                    </Box>
                )}
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6">{t("dashboard.cluster_skip_dead_nodes", "Skip dead nodes")}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <TextField placeholder={t("dashboard.cluster_skip_nodes_placeholder") as string} value={skipNodesInput} onChange={(e) => setSkipNodesInput(e.target.value)} sx={{ width: "60%" }} />
                    <Button variant="contained" color="warning" onClick={handleSkipDead}>
                        {t("dashboard.cluster_skip_dead_nodes", "Skip dead nodes")}
                    </Button>
                </Stack>
            </Paper>

            <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
                <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
                    {snack.message}
                </Alert>
            </Snackbar>
            </Box>
        </Box>
    )
}
