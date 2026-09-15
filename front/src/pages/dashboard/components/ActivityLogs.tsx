import { useState, useEffect, useCallback } from "react"
import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import RefreshIcon from "@mui/icons-material/Refresh"
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined"
import { useTranslation } from "react-i18next"
import PageHeader from "../../../components/PageHeader"
import DataTable, { type DataTableColumn } from "../../../components/data/DataTable"
import { useProject } from "../../../contexts/ProjectContext"
import { projectBadge } from "../projectBadge"
import EmptyState from "../../../components/EmptyState"
import { formatDateTime } from "../../../utils/format"

interface LogEntry {
    ID: number
    CreatedAt: string
    project_id: number
    user_id: number
    action: string
    details: string
    status: string
}

export default function ActivityLogs() {
    const { t, i18n } = useTranslation()
    const { selectedProject } = useProject()
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
            <Box sx={{ p: 3 }}>
                <EmptyState icon={HistoryOutlinedIcon} title={t("logs.title")} description={t("logs.no_cluster_logs")} />
            </Box>
        )
    }

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 3, height: "100%", overflow: "hidden" }}>
            <PageHeader
                title={t("logs.title")}
                subtitle={t("logs.subtitle")}
                badge={projectBadge(selectedProject)}
                action={
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchLogs} disabled={loading}>
                        {t("common.refresh")}
                    </Button>
                }
            />

            <DataTable<LogEntry>
                rows={logs}
                getRowId={(log, index) => String(log.ID ?? index)}
                loading={loading}
                error={error}
                errorTitle={t("logs.load_error") as string}
                retryLabel={t("common.retry") as string}
                onRetry={() => { void fetchLogs() }}
                tableLabel={t("logs.title") as string}
                columns={[
                    {
                        id: "time",
                        header: t("logs.col.time"),
                        cell: (log) => formatDateTime(log.CreatedAt, i18n.language),
                        sortValue: (log) => new Date(log.CreatedAt),
                        minWidth: 160,
                    },
                    {
                        id: "action",
                        header: t("logs.col.action"),
                        cell: (log) => <Chip label={log.action} size="small" variant="outlined" />,
                        sortValue: (log) => log.action,
                        minWidth: 150,
                    },
                    {
                        id: "status",
                        header: t("logs.col.status"),
                        cell: (log) => (
                            <Chip
                                label={log.status}
                                size="small"
                                color={log.status === "success" ? "success" : log.status === "error" ? "error" : "default"}
                            />
                        ),
                        sortValue: (log) => log.status,
                        minWidth: 120,
                    },
                    {
                        id: "details",
                        header: t("logs.col.details"),
                        cell: (log) => <Typography variant="body2">{log.details}</Typography>,
                        sortValue: (log) => log.details,
                        truncate: true,
                        textValue: (log) => log.details,
                        minWidth: 200,
                    },
                ] satisfies DataTableColumn<LogEntry>[]}
                searchValue={(log) => [log.action, log.status, log.details, formatDateTime(log.CreatedAt, i18n.language)].join(" ")}
                defaultSort={{ id: "time", dir: "desc" }}
                pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                emptyState={{
                    icon: <HistoryOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                    title: t("logs.empty") as string,
                    description: t("logs.empty_desc") as string,
                    primaryAction: { label: t("common.refresh") as string, onClick: () => { void fetchLogs() } },
                }}
            />
        </Box>
    )
}
