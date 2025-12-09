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
// import Overview from "./pages/dashboard/Overview"

import { logout as authLogout, isLoggedIn } from "./auth/tokenAuth"
import { useState, useEffect, useCallback } from "react"
import { setCurrentProjectId } from "./utils/adminClient"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import DashboardLayout from "./layouts/DashboardLayout"
import { SettingsProvider } from "./contexts/SettingsContext"

interface S3Config {
    id: number
    name: string
    admin_url?: string
    type?: string
}

function App() {
    // Auth State
    const [authed, setAuthed] = useState(false)

    // Project State
    const [projects, setProjects] = useState<S3Config[]>([])
    const [selectedProject, setSelectedProject] = useState<number | null>(() => {
        const saved = localStorage.getItem("kexamanager:selectedProject")
        const parsed = saved ? parseInt(saved) : null
        return (parsed && !isNaN(parsed)) ? parsed : null
    })

    // Load Projects
    useEffect(() => {
        const loadProjects = async () => {
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
            }
        }
        if (authed) {
            loadProjects()
        }
    }, [authed])

    // Helper to get project info
    const getSelectedProjectInfo = useCallback(() => {
        if (!selectedProject) return null
        return projects.find(p => p.id === selectedProject) || null
    }, [selectedProject, projects])

    const selectedProjectInfo = getSelectedProjectInfo()
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
                localStorage.removeItem("kexamanager:selectedProject")
            }
        }
    }, [projects])

    // Synch selected project persistence
    useEffect(() => {
        if (selectedProject !== null && selectedProject !== undefined) {
            localStorage.setItem("kexamanager:selectedProject", selectedProject.toString())
        } else {
            localStorage.removeItem("kexamanager:selectedProject")
        }
        setCurrentProjectId(selectedProject)
    }, [selectedProject])

    function onAuth() {
        setAuthed(true)
    }

    function logout() {
        authLogout()
        setAuthed(false)
    }

    if (!authed) return <Login onAuth={onAuth} />

    return (
        <SettingsProvider>
            <BrowserRouter>
                <Routes>
                    <Route
                        path="/"
                        element={<DashboardLayout onLogout={logout} hasProject={selectedProject !== null} projectType={selectedProjectInfo?.type} />}
                    >
                        <Route index element={<Navigate to="/projects" replace />} />
                        {/* <Route path="overview" element={<Overview />} /> */}

                        <Route path="projects" element={
                            <Projects
                                selectedProject={selectedProject}
                                onSelectProject={setSelectedProject}
                                onProjectsChange={setProjects}
                            />
                        } />

                        {/* Pages that require context/project */}
                        <Route
                            path="buckets"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <Buckets selectedProject={selectedProjectInfo} />}
                        />
                        <Route
                            path="apps"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <ApplicationsKeys />}
                        />
                        <Route
                            path="manager"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <UserManager />}
                        />
                        <Route path="s3" element={<S3Browser selectedProject={selectedProjectInfo} />} />
                        <Route
                            path="adminTokens"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <AdminTokens />}
                        />
                        <Route
                            path="nodes"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <Nodes />}
                        />
                        <Route
                            path="blocks"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <Blocks />}
                        />
                        <Route
                            path="workers"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <Workers />}
                        />
                        <Route
                            path="cluster"
                            element={isS3Only ? <Navigate to="/s3" replace /> : <ClusterLayout selectedProject={selectedProjectInfo} />}
                        />
                        <Route path="preview" element={<PreviewPage selectedProject={selectedProjectInfo} />} />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/projects" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </SettingsProvider>
    )
}

export default App
