import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import { logout as authLogout, getCurrentUser, isLoggedIn } from "./auth/tokenAuth"
import { adminGet } from "./utils/adminClient"
import { ListBlockErrors, ListBuckets, ListKeys } from "./utils/apiWrapper"
import { getCapabilities, listS3Buckets } from "./api/storage"
import type { Capabilities } from "./api/types"
import {
    ProjectContext,
    persistSelectedProjectId,
    readStoredProjectId,
    useProject,
    type NavCounts,
    type ProjectContextValue,
    type ProjectSummary,
} from "./contexts/ProjectContext"
import { FeedbackContext, feedbackDuration, type FeedbackContextValue, type FeedbackItem, type FeedbackMessage } from "./contexts/FeedbackContext"
import { AppShell } from "./shell/AppShell"
import { Page } from "./shell/Page"
import { k } from "./theme"
import LoginPage from "./pages/LoginPage"
import OverviewPage from "./pages/OverviewPage"
import ProjectsPage from "./pages/projects/ProjectsPage"
import ProjectWizard from "./pages/projects/ProjectWizard"
import BucketsPage from "./pages/buckets/BucketsPage"
import BucketPage from "./pages/buckets/BucketPage"
import KeysPage from "./pages/KeysPage"
import AdminTokensPage from "./pages/AdminTokensPage"
import UsersPage from "./pages/UsersPage"
import TopologyPage from "./pages/TopologyPage"
import MaintenancePage from "./pages/MaintenancePage"
import ActivityPage from "./pages/ActivityPage"

/** Project-scoped screens need an active project; otherwise back to the project list. */
function RequireProject({ children }: { children: ReactNode }) {
    const { selectedProject, loading } = useProject()
    const location = useLocation()
    // The id is known from storage before the project list arrives: wait for the
    // list so pages always get a resolved project.
    if (!selectedProject) {
        if (loading) return null
        return <Navigate to="/projects" replace state={{ projectRequired: true, from: location.pathname }} />
    }
    return children
}

/** Access and cluster screens need the Garage admin API. */
function RequireAdmin({ children }: { children: ReactNode }) {
    const { hasAdmin } = useProject()
    return <RequireProject>{hasAdmin ? children : <Navigate to="/overview" replace />}</RequireProject>
}

function Home() {
    const { selectedProjectId } = useProject()
    return <Navigate to={selectedProjectId === null ? "/projects" : "/overview"} replace />
}

function NotFound() {
    const { t } = useTranslation()
    return (
        <Page crumbs={[{ label: "404" }]} title={t("notFound.title")} description={t("notFound.description")}>
            <Box>
                <Button component={Link} to="/" variant="contained">
                    {t("notFound.back")}
                </Button>
            </Box>
        </Page>
    )
}

function FeedbackToast({ item, onDismiss }: { item: FeedbackItem; onDismiss: (id: number) => void }) {
    useEffect(() => {
        const timer = window.setTimeout(() => onDismiss(item.id), feedbackDuration(item.severity))
        return () => window.clearTimeout(timer)
    }, [item.id, item.severity, onDismiss])

    return (
        <Alert
            severity={item.severity}
            onClose={() => onDismiss(item.id)}
            sx={{ width: "100%", boxShadow: k.shadow, border: `1px solid ${k.borderStrong}` }}
            action={
                item.action && (
                    <Button color="inherit" size="small" onClick={item.action.onClick}>
                        {item.action.label}
                    </Button>
                )
            }
        >
            {item.message}
        </Alert>
    )
}

/** The application's single notification stack (`useFeedback().notify`). */
function FeedbackProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<FeedbackItem[]>([])
    const nextId = useRef(0)
    const dismiss = useCallback((id: number) => setItems((previous) => previous.filter((item) => item.id !== id)), [])
    const notify = useCallback((feedback: FeedbackMessage) => {
        const id = nextId.current
        nextId.current += 1
        setItems((previous) => [...previous, { id, ...feedback }])
    }, [])
    const value = useMemo<FeedbackContextValue>(() => ({ notify }), [notify])

    return (
        <FeedbackContext.Provider value={value}>
            {children}
            <Box
                sx={{
                    position: "fixed",
                    right: 16,
                    bottom: 16,
                    zIndex: "snackbar",
                    display: "flex",
                    flexDirection: "column-reverse",
                    gap: 1,
                    width: "min(420px, calc(100vw - 32px))",
                }}
            >
                {items.map((item) => (
                    <FeedbackToast key={item.id} item={item} onDismiss={dismiss} />
                ))}
            </Box>
        </FeedbackContext.Provider>
    )
}

const EMPTY_COUNTS: NavCounts = { buckets: null, keys: null, blockErrors: null }

/** Loads projects, capabilities and navigation counters for the shell. */
function useProjectState(authed: boolean): ProjectContextValue {
    const [projects, setProjects] = useState<ProjectSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
        const stored = readStoredProjectId()
        persistSelectedProjectId(stored)
        return stored
    })
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
    const [counts, setCounts] = useState<NavCounts>(EMPTY_COUNTS)
    const [countsNonce, setCountsNonce] = useState(0)

    const reloadProjects = useCallback(async () => {
        setLoading(true)
        try {
            const data = await adminGet<ProjectSummary[]>("/s3-configs")
            const list = data ?? []
            setProjects(list)
            return list
        } catch {
            return []
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (authed) void reloadProjects()
    }, [authed, reloadProjects])

    const selectProject = useCallback((projectId: number | null) => {
        persistSelectedProjectId(projectId)
        setSelectedProjectId(projectId)
    }, [])

    // Forget a stored selection that no longer exists.
    useEffect(() => {
        if (!loading && selectedProjectId !== null && !projects.some((p) => p.id === selectedProjectId)) {
            selectProject(null)
        }
    }, [loading, projects, selectedProjectId, selectProject])

    const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

    useEffect(() => {
        setCapabilities(null)
        if (!authed || selectedProjectId === null) return
        let cancelled = false
        getCapabilities(selectedProjectId)
            .then((caps) => !cancelled && setCapabilities(caps))
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [authed, selectedProjectId])

    const declaredAdmin = selectedProject?.type !== "s3" && Boolean(selectedProject?.admin_url)
    const hasAdmin = capabilities ? capabilities.admin.available : declaredAdmin

    useEffect(() => {
        if (!authed || selectedProjectId === null || !selectedProject) {
            setCounts(EMPTY_COUNTS)
            return
        }
        let cancelled = false
        const settle = <T,>(promise: Promise<T>, pick: (value: T) => number) =>
            promise.then(pick).catch(() => null as number | null)
        const bucketCount = hasAdmin
            ? settle(ListBuckets(selectedProjectId), (list) => list.length)
            : settle(listS3Buckets(selectedProjectId), (list) => list.length)
        const keyCount = hasAdmin ? settle(ListKeys(), (list) => list.length) : Promise.resolve(null)
        const blockErrors = hasAdmin
            ? settle(ListBlockErrors(), (res) => Object.values(res.success ?? {}).reduce((sum, node) => sum + (node?.length ?? 0), 0))
            : Promise.resolve(null)
        Promise.all([bucketCount, keyCount, blockErrors]).then(([buckets, keys, errors]) => {
            if (!cancelled) setCounts({ buckets, keys, blockErrors: errors })
        })
        return () => {
            cancelled = true
        }
    }, [authed, selectedProjectId, selectedProject, hasAdmin, countsNonce])

    const refreshCounts = useCallback(() => setCountsNonce((n) => n + 1), [])

    return useMemo(
        () => ({
            projects,
            selectedProjectId,
            selectedProject,
            selectProject,
            loading,
            reloadProjects,
            capabilities,
            hasAdmin,
            counts,
            refreshCounts,
        }),
        [projects, selectedProjectId, selectedProject, selectProject, loading, reloadProjects, capabilities, hasAdmin, counts, refreshCounts],
    )
}

function AuthedApp({ onLogout }: { onLogout: () => void }) {
    const project = useProjectState(true)
    const isAdminUser = getCurrentUser()?.role === "admin"
    return (
        <ProjectContext.Provider value={project}>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<AppShell onLogout={onLogout} />}>
                        <Route index element={<Home />} />
                        <Route path="projects" element={<ProjectsPage />} />
                        <Route path="projects/new" element={<ProjectWizard />} />
                        <Route path="projects/:projectId/edit" element={<ProjectWizard />} />
                        <Route path="overview" element={<RequireProject><OverviewPage /></RequireProject>} />
                        <Route path="buckets" element={<RequireProject><BucketsPage /></RequireProject>} />
                        <Route path="buckets/:bucketId" element={<RequireProject><BucketPage tab="objects" /></RequireProject>} />
                        <Route path="buckets/:bucketId/settings" element={<RequireProject><BucketPage tab="settings" /></RequireProject>} />
                        <Route path="activity" element={<RequireProject><ActivityPage /></RequireProject>} />
                        <Route path="keys" element={<RequireAdmin><KeysPage /></RequireAdmin>} />
                        <Route path="admin-tokens" element={<RequireAdmin><AdminTokensPage /></RequireAdmin>} />
                        <Route path="topology" element={<RequireAdmin><TopologyPage /></RequireAdmin>} />
                        <Route path="maintenance" element={<RequireAdmin><MaintenancePage /></RequireAdmin>} />
                        <Route path="users" element={isAdminUser ? <UsersPage /> : <Navigate to="/" replace />} />

                        {/* Addresses of the previous interface. */}
                        <Route path="s3" element={<Navigate to="/buckets" replace />} />
                        <Route path="preview" element={<Navigate to="/buckets" replace />} />
                        <Route path="apps" element={<Navigate to="/keys" replace />} />
                        <Route path="adminTokens" element={<Navigate to="/admin-tokens" replace />} />
                        <Route path="cluster" element={<Navigate to="/topology" replace />} />
                        <Route path="nodes" element={<Navigate to="/topology" replace />} />
                        <Route path="workers" element={<Navigate to="/maintenance" replace />} />
                        <Route path="blocks" element={<Navigate to="/maintenance" replace />} />
                        <Route path="manager" element={<Navigate to="/users" replace />} />

                        <Route path="*" element={<NotFound />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </ProjectContext.Provider>
    )
}

function App() {
    const [authed, setAuthed] = useState(isLoggedIn)

    const logout = () => {
        authLogout()
        setAuthed(false)
    }

    return <FeedbackProvider>{authed ? <AuthedApp onLogout={logout} /> : <LoginPage onAuth={() => setAuthed(true)} />}</FeedbackProvider>
}

export default App
