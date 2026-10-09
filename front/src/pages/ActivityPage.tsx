import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import InputAdornment from "@mui/material/InputAdornment"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import { ChevronDown, ChevronRight, Download, History, Search } from "lucide-react"
import { toErrorMessage } from "../api/storage"
import { useActiveProject } from "../contexts/ProjectContext"
import { useFeedback } from "../contexts/FeedbackContext"
import { Page } from "../shell/Page"
import { k } from "../theme"
import { Avatar, Card, EmptyBlock, ErrorBlock, Mono, Muted, Segmented, Spinner, Tag, TextInput } from "../ui/kit"
import { formatDate, formatTime } from "../utils/format"
import { LogSentence, StatusPill } from "./activity/LogLine"
import { actionTag, downloadLogsCsv, fetchLogs, LOG_CATEGORIES, parseDetails, type LogCategory, type LogEntry, type LogFilters } from "./activity/logs"

type Period = "24h" | "7d" | "30d"
const PAGE_SIZE = 50

function dayKey(value: string): string {
    const date = new Date(value)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** "Aujourd'hui", "Hier" or the date, for the day headers. */
function dayLabel(key: string, value: string, t: (key: string) => string): string {
    if (key === dayKey(new Date().toISOString())) return t("activity.today")
    if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return t("activity.yesterday")
    return formatDate(value)
}

function useDebounced<T>(value: T, ms = 300): T {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), ms)
        return () => clearTimeout(timer)
    }, [value, ms])
    return debounced
}

function EventRow({ entry }: { entry: LogEntry }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const fields = parseDetails(entry.details)
    const hasDetails = Boolean(entry.details)
    return (
        <Box sx={{ borderTop: `1px solid ${k.rowBorder}` }}>
            <Box
                component={hasDetails ? "button" : "div"}
                type={hasDetails ? "button" : undefined}
                onClick={hasDetails ? () => setOpen((v) => !v) : undefined}
                aria-expanded={hasDetails ? open : undefined}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: "20px",
                    py: "12px",
                    width: "100%",
                    flexWrap: "wrap",
                    border: 0,
                    bgcolor: "transparent",
                    color: "inherit",
                    font: "inherit",
                    textAlign: "left",
                    cursor: hasDetails ? "pointer" : "default",
                    "&:hover": hasDetails ? { bgcolor: k.rowHover } : undefined,
                }}
            >
                <Mono sx={{ color: k.label, width: 44 }}>{formatTime(entry.CreatedAt)}</Mono>
                <Avatar name={entry.username || "·"} size={26} />
                <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
                    <LogSentence entry={entry} />
                </Box>
                <Tag sx={{ display: { xs: "none", sm: "inline-flex" } }}>{actionTag(entry.action)}</Tag>
                <StatusPill status={entry.status} />
                <Box sx={{ width: 16, color: k.label, display: "flex" }}>{hasDetails && (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}</Box>
            </Box>
            {open && (
                <Box sx={{ px: "20px", pb: "14px", pl: { xs: "20px", sm: "98px" } }}>
                    <Box sx={{ bgcolor: k.input, border: `1px solid ${k.border}`, borderRadius: "8px", p: "10px 14px", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}>
                        {fields ? (
                            Object.entries(fields).map(([key, value]) => (
                                <Box key={key} sx={{ display: "contents" }}>
                                    <Mono sx={{ color: k.label }}>{key}</Mono>
                                    <Mono sx={{ overflowWrap: "anywhere" }}>{value}</Mono>
                                </Box>
                            ))
                        ) : (
                            <Mono sx={{ gridColumn: "1 / -1", overflowWrap: "anywhere" }}>{entry.details}</Mono>
                        )}
                        <Mono sx={{ color: k.label }}>{t("activity.at")}</Mono>
                        <Mono>{new Date(entry.CreatedAt).toLocaleString()}</Mono>
                    </Box>
                </Box>
            )}
        </Box>
    )
}

export default function ActivityPage() {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const project = useActiveProject()
    const [search, setSearch] = useState("")
    const [category, setCategory] = useState<LogCategory | "">("")
    const [user, setUser] = useState("")
    const [status, setStatus] = useState("")
    const [period, setPeriod] = useState<Period>("7d")
    const q = useDebounced(search)

    const filters: LogFilters = useMemo(() => ({ q, category, user, status, since: period }), [q, category, user, status, period])
    const [entries, setEntries] = useState<LogEntry[]>([])
    const [total, setTotal] = useState(0)
    // The page number belongs to one set of filters: changing them goes back to page 1.
    const [paging, setPaging] = useState({ filters, projectId: project.id, page: 1 })
    const page = paging.filters === filters && paging.projectId === project.id ? paging.page : 1
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)
    const [exporting, setExporting] = useState(false)
    const [authors, setAuthors] = useState<string[]>([])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        fetchLogs(project.id, filters, page, PAGE_SIZE)
            .then((res) => {
                if (cancelled) return
                setEntries((prev) => (page === 1 ? res.logs : [...prev, ...res.logs]))
                setTotal(res.total)
                setAuthors((prev) => {
                    const next = new Set(prev)
                    for (const entry of res.logs) if (entry.username) next.add(entry.username)
                    return next.size === prev.length ? prev : [...next].sort()
                })
            })
            .catch((err) => !cancelled && setError(toErrorMessage(err)))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [project.id, filters, page, nonce])

    const groups = useMemo(() => {
        const out: { key: string; label: string; items: LogEntry[] }[] = []
        for (const entry of entries) {
            const key = dayKey(entry.CreatedAt)
            let group = out[out.length - 1]
            if (!group || group.key !== key) {
                group = { key, label: dayLabel(key, entry.CreatedAt, t), items: [] }
                out.push(group)
            }
            group.items.push(entry)
        }
        return out
    }, [entries, t])

    const filtered = Boolean(q || category || user || status)

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.activity") }]}
            topActions={
                <Button
                    startIcon={exporting ? <CircularProgress size={14} /> : <Download />}
                    disabled={exporting}
                    onClick={async () => {
                        setExporting(true)
                        try {
                            await downloadLogsCsv(project.id, filters)
                        } catch (err) {
                            notify({ severity: "error", message: toErrorMessage(err) })
                        } finally {
                            setExporting(false)
                        }
                    }}
                >
                    {t("activity.exportCsv")}
                </Button>
            }
            title={t("nav.activity")}
            description={t("activity.description")}
        >
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <TextInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("activity.search")}
                    inputProps={{ "aria-label": t("activity.search") }}
                    startAdornment={
                        <InputAdornment position="start">
                            <Search size={16} />
                        </InputAdornment>
                    }
                    sx={{ flex: "1 1 220px", maxWidth: 320 }}
                />
                <Select size="small" value={category} onChange={(e) => setCategory(e.target.value as LogCategory | "")} displayEmpty inputProps={{ "aria-label": t("activity.category") }}>
                    <MenuItem value="">{t("activity.allActions")}</MenuItem>
                    {(Object.keys(LOG_CATEGORIES) as LogCategory[]).map((cat) => (
                        <MenuItem key={cat} value={cat}>
                            {t(`activity.categories.${cat}`)}
                        </MenuItem>
                    ))}
                </Select>
                <Select size="small" value={user} onChange={(e) => setUser(e.target.value)} displayEmpty inputProps={{ "aria-label": t("activity.author") }}>
                    <MenuItem value="">{t("activity.allAuthors")}</MenuItem>
                    {authors.map((name) => (
                        <MenuItem key={name} value={name}>
                            {name}
                        </MenuItem>
                    ))}
                </Select>
                <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)} displayEmpty inputProps={{ "aria-label": t("activity.result") }}>
                    <MenuItem value="">{t("activity.allResults")}</MenuItem>
                    <MenuItem value="success">{t("activity.success")}</MenuItem>
                    <MenuItem value="error">{t("activity.failure")}</MenuItem>
                </Select>
                <Box sx={{ ml: { md: "auto" } }}>
                    <Segmented
                        label={t("activity.period")}
                        value={period}
                        onChange={setPeriod}
                        options={[
                            { value: "24h", label: t("activity.periods.24h") },
                            { value: "7d", label: t("activity.periods.7d") },
                            { value: "30d", label: t("activity.periods.30d") },
                        ]}
                    />
                </Box>
            </Box>

            {error && <ErrorBlock message={error} onRetry={() => setNonce((n) => n + 1)} />}

            {loading && entries.length === 0 ? (
                <Spinner />
            ) : entries.length === 0 ? (
                !error && (
                    <Card>
                        <EmptyBlock icon={<History />} title={filtered ? t("activity.noMatch") : t("activity.empty")} description={filtered ? undefined : t("activity.emptyText")} />
                    </Card>
                )
            ) : (
                <>
                    {groups.map((group) => (
                        <Box key={group.key}>
                            <Box sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: k.label, mb: 1 }}>{group.label}</Box>
                            <Card sx={{ "& > div:first-of-type": { borderTop: 0 } }}>
                                {group.items.map((entry) => (
                                    <EventRow key={entry.ID} entry={entry} />
                                ))}
                            </Card>
                        </Box>
                    ))}
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                        <Muted small>{t("activity.shown", { shown: entries.length, total })}</Muted>
                        {entries.length < total && (
                            <Button onClick={() => setPaging({ filters, projectId: project.id, page: page + 1 })} disabled={loading} startIcon={loading ? <CircularProgress size={14} /> : undefined}>
                                {t("activity.loadMore")}
                            </Button>
                        )}
                    </Box>
                </>
            )}
        </Page>
    )
}
