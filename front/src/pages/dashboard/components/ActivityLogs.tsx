import { useState, useEffect, useCallback } from "react"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Paper from "@mui/material/Paper"
import CircularProgress from "@mui/material/CircularProgress"
import Chip from "@mui/material/Chip"
import Button from "@mui/material/Button"
import RefreshIcon from "@mui/icons-material/Refresh"
import { useTranslation } from "react-i18next"

interface LogEntry {
    ID: number
    CreatedAt: string
    project_id: number
    user_id: number
    action: string
    details: string
    status: string
}

interface ActivityLogsProps {
    selectedProject: { id: number; name: string } | null
}

export default function ActivityLogs({ selectedProject }: ActivityLogsProps) {
    const { t } = useTranslation()
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchLogs = useCallback(async () => {
        if (!selectedProject) return
        setLoading(true)
        setError(null)
        try {
            const jwtToken = localStorage.getItem("kexamanager:token")
            const response = await fetch(`/api/${selectedProject.id}/logs`, {
                headers: {
                    'Authorization': `Bearer ${jwtToken}`
                }
            })
            if (!response.ok) {
                throw new Error(`Failed to fetch logs: ${response.statusText}`)
            }
            const data = await response.json()
            setLogs(data.logs || data)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [selectedProject])

    useEffect(() => {
        fetchLogs()
    }, [fetchLogs])

    if (!selectedProject) {
        return (
            <Box sx={{ p: 2, display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                <Typography color="text.secondary">
                    {t("logs.no_cluster_logs", "Cluster-wide logs are not available. Please navigate to a specific project to view its activity logs.")}
                </Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 2, height: "100%", overflow: "hidden" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6">{t("logs.title", "Activity Logs")}</Typography>
                <Button startIcon={<RefreshIcon />} onClick={fetchLogs} disabled={loading}>
                    {t("common.refresh", "Refresh")}
                </Button>
            </Box>

            {error && (
                <Box sx={{ mb: 2 }}>
                    <Chip color="error" label={error} />
                </Box>
            )}

            <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Time</TableCell>
                            <TableCell>Action</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Details</TableCell>
                            {/* <TableCell>User</TableCell> */}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center">
                                    <CircularProgress size={24} />
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center">
                                    {t("logs.empty", "No activity logs found.")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.ID} hover>
                                    <TableCell>{new Date(log.CreatedAt).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Chip label={log.action} size="small" variant="outlined" />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={log.status}
                                            size="small"
                                            color={log.status === "success" ? "success" : log.status === "error" ? "error" : "default"}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: 400 }}>{log.details}</TableCell>
                                    {/* <TableCell>{log.user_id}</TableCell> */}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    )
}
