import Login from "./pages/Login"
import Buckets from "./pages/dashboard/Buckets"
import S3Browser from "./pages/dashboard/S3Browser"
import Projects from "./pages/dashboard/Projects"
import ApplicationsKeys from "./pages/dashboard/ApplicationsKeys"
import AdminTokens from "./pages/dashboard/AdminTokens"
import Nodes from "./pages/dashboard/Nodes"
import Blocks from "./pages/dashboard/Blocks"
import Workers from "./pages/dashboard/Workers"
import ClusterLayout from "./pages/dashboard/ClusterLayout"
import PreviewPage from "./pages/dashboard/PreviewPage"
import UserManager from "./pages/dashboard/UserManager"

import { logout as authLogout, isLoggedIn } from "./auth/tokenAuth"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import Typography from "@mui/material/Typography"
import DashboardLayout from "./layouts/DashboardLayout"
import {
    ProjectContext,
    persistSelectedProjectId,
    readStoredProjectId,
    useProject,
    type ProjectContextValue,
    type ProjectSummary,
} from "./contexts/ProjectContext"
import {
    FeedbackContext,
    feedbackDuration,
    useFeedback,
    type FeedbackContextValue,
    type FeedbackItem,
    type FeedbackMessage,
} from "./contexts/FeedbackContext"

interface S3Config extends ProjectSummary {
    admin_url?: string
}

/**
 * Route guard: project-scoped screens are only reachable with an active
 * project, otherwise the user is sent back to `/projects` with an explanation
 * carried in the navigation state.
 */
function RequireProject({ children }: { children: ReactNode }) {
    const { selectedProjectId } = useProject()
    const location = useLocation()

    if (selectedProjectId === null) {
        return <Navigate to="/projects" replace state={{ projectRequired: true, from: location.pathname }} />
    }

    return children
}

/** Displays the explanation attached to a redirect issued by `RequireProject`. */
function ProjectRequiredNotice() {
    const { notify } = useFeedback()
    const location = useLocation()
    const navigate = useNavigate()
    const projectRequired = Boolean((location.state as { projectRequired?: boolean } | null)?.projectRequired)

    useEffect(() => {
        if (!projectRequired) return
        notify({ severity: "info", message: "Aucun projet sélectionné : choisissez un projet pour accéder à cet écran." })
        navigate(location.pathname, { replace: true, state: null })
    }, [projectRequired, notify, navigate, location.pathname])

    return null
}

/** Explicit 404 instead of silently bouncing unknown URLs to a dashboard. */
function NotFound() {
    return (
        <Box
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                p: 4,
                textAlign: "center",
            }}
        >
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
                404
            </Typography>
            <Typography variant="body1" color="text.secondary">
                Cette page n'existe pas.
            </Typography>
            <Button component={Link} to="/projects" variant="contained">
                Retour aux projets
            </Button>
        </Box>
    )
}

/** One stacked notification; it dismisses itself after the delay of its severity. */
function FeedbackToast({ item, onDismiss }: { item: FeedbackItem; onDismiss: (id: number) => void }) {
    useEffect(() => {
        const timer = window.setTimeout(() => onDismiss(item.id), feedbackDuration(item.severity))
        return () => window.clearTimeout(timer)
    }, [item.id, item.severity, onDismiss])

    return (
        <Alert
            severity={item.severity}
            variant="filled"
            onClose={() => onDismiss(item.id)}
            sx={{ width: "100%", boxShadow: 6 }}
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

/**
 * Owns the application's single notification stack: screens call `notify` from
 * `useFeedback` and every message shares the same rendering, anchor and timing.
 */
function FeedbackProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<FeedbackItem[]>([])
    const nextId = useRef(0)

    const dismiss = useCallback((id: number) => {
        setItems(previous => previous.filter(item => item.id !== id))
    }, [])

    const notify = useCallback((feedback: FeedbackMessage) => {
        const id = nextId.current
        nextId.current += 1
        setItems(previous => [...previous, { id, ...feedback }])
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
                {items.map(item => (
                    <FeedbackToast key={item.id} item={item} onDismiss={dismiss} />
                ))}
            </Box>
        </FeedbackContext.Provider>
    )
}

function App() {
    // Auth State
    const [authed, setAuthed] = useState(false)

    // Project State
    const [projects, setProjects] = useState<S3Config[]>([])
    const [projectsLoading, setProjectsLoading] = useState(false)
    const [selectedProject, setSelectedProject] = useState<number | null>(readStoredProjectId)

    // Load Projects
    useEffect(() => {
        const loadProjects = async () => {
            setProjectsLoading(true)
            try {
                const response = await fetch('/api/s3-configs', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('kexamanager:token')}`
                    }
                })
                if (response.ok) {
                    const data: S3Config[] = await response.json()
                    setProjects(data)
                }
            } catch (error) {
                console.error('Failed to load projects:', error)
            } finally {
                setProjectsLoading(false)
            }
        }
        if (authed) {
            loadProjects()
        }
    }, [authed])

    // Active project resolved from the list: screens get its name, not just its id
    const selectedProjectInfo = projects.find(project => project.id === selectedProject) ?? null
    const isS3Only = selectedProjectInfo?.type === "s3"

    // Helper to check auth
    useEffect(() => {
        const authenticated = isLoggedIn()
        setAuthed(authenticated)
    }, [])

    // Validate selected project exists when projects load
    useEffect(() => {
        if (projects.length > 0 && selectedProject) {
            const projectExists = projects.some(p => p.id === selectedProject)
            if (!projectExists) {
                setSelectedProject(null)
            }
        }
    }, [projects, selectedProject])

    // Synch selected project persistence (localStorage + admin client)
    useEffect(() => {
        persistSelectedProjectId(selectedProject)
    }, [selectedProject])

    const projectContext = useMemo<ProjectContextValue>(() => ({
        projects,
        selectedProjectId: selectedProject,
        selectedProject: selectedProjectInfo,
        selectProject: setSelectedProject,
        loading: projectsLoading,
    }), [projects, selectedProject, selectedProjectInfo, projectsLoading])

    function onAuth() {
        setAuthed(true)
    }

    function logout() {
        authLogout()
        setAuthed(false)
    }

    if (!authed) {
        return (
            <FeedbackProvider>
                <Login onAuth={onAuth} />
            </FeedbackProvider>
        )
    }

    return (
        <FeedbackProvider>
            <ProjectContext.Provider value={projectContext}>
                <BrowserRouter>
                    <ProjectRequiredNotice />
                    <Routes>
                        <Route
                            path="/"
                            element={<DashboardLayout onLogout={logout} hasProject={selectedProject !== null} projectType={selectedProjectInfo?.type} />}
                        >
                            <Route index element={<Navigate to="/projects" replace />} />

                            <Route path="projects" element={
                                <Projects
                                    selectedProject={selectedProject}
                                    onSelectProject={setSelectedProject}
                                    onProjectsChange={setProjects}
                                />
                            } />

                            {/* Pages that require context/project */}
                            {/* D12 : `/buckets` est accessible a TOUS les types de projet,
                                la redirection `isS3Only` vers /s3 a ete supprimee ici. Les
                                compteurs viennent de l'admin Garage ou du calcul S3. */}
                            <Route
                                path="buckets"
                                element={
                                    <RequireProject>
                                        <Buckets selectedProject={selectedProjectInfo} />
                                    </RequireProject>
                                }
                            />
                            <Route
                                path="apps"
                                element={isS3Only ? <Navigate to="/s3" replace /> : (
                                    <RequireProject>
                                        <ApplicationsKeys />
                                    </RequireProject>
                                )}
                            />
                            <Route
                                path="manager"
                                element={<UserManager />}
                            />
                            <Route
                                path="s3"
                                element={
                                    <RequireProject>
                                        <S3Browser selectedProject={selectedProjectInfo} />
                                    </RequireProject>
                                }
                            />
                            <Route
                                path="adminTokens"
                                element={isS3Only ? <Navigate to="/s3" replace /> : (
                                    <RequireProject>
                                        <AdminTokens />
                                    </RequireProject>
                                )}
                            />
                            <Route
                                path="nodes"
                                element={isS3Only ? <Navigate to="/s3" replace /> : (
                                    <RequireProject>
                                        <Nodes />
                                    </RequireProject>
                                )}
                            />
                            <Route
                                path="blocks"
                                element={isS3Only ? <Navigate to="/s3" replace /> : (
                                    <RequireProject>
                                        <Blocks />
                                    </RequireProject>
                                )}
                            />
                            <Route
                                path="workers"
                                element={isS3Only ? <Navigate to="/s3" replace /> : (
                                    <RequireProject>
                                        <Workers />
                                    </RequireProject>
                                )}
                            />
                            <Route
                                path="cluster"
                                element={isS3Only ? <Navigate to="/s3" replace /> : (
                                    <RequireProject>
                                        <ClusterLayout selectedProject={selectedProjectInfo} />
                                    </RequireProject>
                                )}
                            />
                            <Route
                                path="preview"
                                element={
                                    <RequireProject>
                                        <PreviewPage selectedProject={selectedProjectInfo} />
                                    </RequireProject>
                                }
                            />

                            <Route path="*" element={<NotFound />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </ProjectContext.Provider>
        </FeedbackProvider>
    )
}

export default App
