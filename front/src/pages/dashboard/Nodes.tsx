import { useEffect, useState, Fragment } from "react"
import { useTranslation } from "react-i18next"
import { GetNodeStatistics, GetNodeInfo } from "../../utils/apiWrapper"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import IconButton from "@mui/material/IconButton"
import Collapse from "@mui/material/Collapse"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import type { components } from "../../types/openapi"

type InfoResp = components["schemas"]["MultiResponse_LocalGetNodeInfoResponse"]
type StatsResp = components["schemas"]["MultiResponse_LocalGetNodeStatisticsResponse"]

type NodeCombined = {
    id: string
    info?: components["schemas"]["LocalGetNodeInfoResponse"]
    stats?: components["schemas"]["LocalGetNodeStatisticsResponse"]
    error?: string
}

export default function Nodes() {
    const { t } = useTranslation()
    const [nodes, setNodes] = useState<NodeCombined[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    useEffect(() => {
        let mounted = true

        Promise.allSettled([GetNodeInfo(), GetNodeStatistics()])
            .then((results) => {
                if (!mounted) return

                const [infoRes, statsRes] = results

                const parseInfo = (v: unknown): InfoResp => (v && typeof v === "object" ? (v as InfoResp) : { success: {}, error: {} })
                const parseStats = (v: unknown): StatsResp => (v && typeof v === "object" ? (v as StatsResp) : { success: {}, error: {} })

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
            })
            .catch((e) => {
                if (mounted) setError((e as unknown as { message?: string })?.message || String(e))
            })
            .finally(() => {
                if (mounted) setLoading(false)
            })

        return () => {
            mounted = false
        }
    }, [])

    return (
        <div>
            <Typography variant="h5">{t("dashboard.nodes")}</Typography>
            <Typography variant="body2" gutterBottom>
                {t("dashboard.nodes_desc")}
            </Typography>

            {loading && (
                <Box display="flex" alignItems="center" gap={2}>
                    <CircularProgress size={20} />
                    <Typography>{t("common.loading")}</Typography>
                </Box>
            )}

            {error && <Alert severity="error">{error}</Alert>}

            {!loading && !error && (
                <Box>
                    {nodes.length === 0 ? (
                        <Alert severity="info">{t("dashboard.no_nodes") || "No nodes returned"}</Alert>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead sx={{ backgroundColor: "background.paper", position: "sticky", top: 0 }}>
                                    <TableRow>
                                        <TableCell />
                                        <TableCell>{t("dashboard.nodes_table.node_id")}</TableCell>
                                        <TableCell>{t("dashboard.nodes_table.garage_version")}</TableCell>
                                        <TableCell>{t("dashboard.nodes_table.rust_version")}</TableCell>
                                        <TableCell>{t("dashboard.nodes_table.db_engine")}</TableCell>
                                        <TableCell>{t("dashboard.nodes_table.garage_features")}</TableCell>
                                        <TableCell>{t("dashboard.nodes_table.error")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {nodes.map((n) => (
                                        <Fragment key={n.id}>
                                            <TableRow hover>
                                                <TableCell sx={{ width: 48 }}>
                                                    <IconButton aria-label="expand row" size="small" onClick={() => setExpanded((prev: Record<string, boolean>) => ({ ...prev, [n.id]: !prev[n.id] }))}>
                                                        {expanded[n.id] ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                                    </IconButton>
                                                </TableCell>
                                                <TableCell component="th" scope="row">
                                                    {n.id}
                                                </TableCell>
                                                <TableCell>{n.info?.garageVersion ?? "-"}</TableCell>
                                                <TableCell>{n.info?.rustVersion ?? "-"}</TableCell>
                                                <TableCell>{n.info?.dbEngine ?? "-"}</TableCell>
                                                <TableCell>
                                                    {Array.isArray(n.info?.garageFeatures)
                                                        ? (n.info?.garageFeatures as unknown[]).map((f, i) => {
                                                              if (f == null) return null
                                                              if (typeof f === "string") {
                                                                  return <Chip key={String(i)} label={f} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                                                              }
                                                              // If the feature is an object, render a small key/value table
                                                              if (typeof f === "object") {
                                                                  const entries = Object.entries(f as Record<string, unknown>)
                                                                  return (
                                                                      <Table size="small" key={String(i)} sx={{ mb: 0.5 }}>
                                                                          <TableBody>
                                                                              {entries.map(([k, v]) => (
                                                                                  <TableRow key={k}>
                                                                                      <TableCell sx={{ py: 0.3, pr: 1, fontWeight: "bold", maxWidth: 180 }}>{k}</TableCell>
                                                                                      <TableCell sx={{ py: 0.3 }}>{v == null ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v)}</TableCell>
                                                                                  </TableRow>
                                                                              ))}
                                                                          </TableBody>
                                                                      </Table>
                                                                  )
                                                              }
                                                              // Fallback: show as string
                                                              return <Chip key={String(i)} label={String(f)} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                                                          })
                                                        : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    {n.error ? (
                                                        <Typography color="error" variant="body2">
                                                            {n.error}
                                                        </Typography>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                                                    <Collapse in={!!expanded[n.id]} timeout="auto" unmountOnExit>
                                                        <Box margin={1}>
                                                            <Typography variant="subtitle2">{t("dashboard.nodes_table.stats")}</Typography>
                                                            <Paper variant="outlined" sx={{ mt: 1, p: 1 }}>
                                                                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{n.stats?.freeform ?? "-"}</pre>
                                                            </Paper>
                                                        </Box>
                                                    </Collapse>
                                                </TableCell>
                                            </TableRow>
                                        </Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}
        </div>
    )
}
