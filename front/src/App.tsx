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
import { ThemeProvider } from "@mui/material/styles"
import { lightTheme, darkTheme } from "./theme"
import Box from "@mui/material/Box"
import CssBaseline from "@mui/material/CssBaseline"
import { useTranslation } from "react-i18next"
import i18n from "./i18n"
import { logout as authLogout, isLoggedIn } from "./auth/tokenAuth"
import Navigation, { type NavigationProps } from "./components/Navigation"
import { useState, useEffect, useCallback } from "react"
import { setCurrentProjectId } from "./utils/adminClient"

interface S3Config {
    id: number
    name: string
    admin_url?: string
    type?: string
}

function App() {
    // example counter removed
    const [authed, setAuthed] = useState(false)
    const [projects, setProjects] = useState<S3Config[]>([])
    const [selectedProject, setSelectedProject] = useState<number | null>(() => {
        const saved = localStorage.getItem("kexamanager:selectedProject")
        const parsed = saved ? parseInt(saved) : null
        return (parsed && !isNaN(parsed)) ? parsed : null
    })
    const [tab, setTab] = useState<string>(() => {
        const h = window.location.hash.replace('#', '').split('?')[0]
        if (h === 's3' || h === 'buckets' || h === 'apps' || h === 'projects' || h === 'adminTokens' || h === 'nodes' || h === 'blocks' || h === 'workers' || h === 'cluster' || h === 'preview') {
            return h
        }
        return "projects"
    })
    const [dark, setDark] = useState<boolean>(() => localStorage.getItem("kexamanager:dark") === "1")

    useTranslation()
    const [lang, setLang] = useState<string>(() => localStorage.getItem("kexamanager:lang") || "fr")
    // responsive helpers not required here
    const [mobileOpen, setMobileOpen] = useState(false)

    // sync i18n language and persist
    useEffect(() => {
        i18n.changeLanguage(lang)
        localStorage.setItem("kexamanager:lang", lang)
    }, [lang])

    // Load projects list
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

    const getSelectedProjectInfo = useCallback(() => {
        if (!selectedProject) return null
        return projects.find(p => p.id === selectedProject) || null
    }, [selectedProject, projects])

    const theme = dark ? darkTheme : lightTheme

    useEffect(() => {
        const authenticated = isLoggedIn()
        setAuthed(authenticated)
    }, [])

    // Save selected project to localStorage
    useEffect(() => {
        if (selectedProject !== null && selectedProject !== undefined) {
            localStorage.setItem("kexamanager:selectedProject", selectedProject.toString())
        } else {
            localStorage.removeItem("kexamanager:selectedProject")
        }
        // Update the global current project ID for API calls
        setCurrentProjectId(selectedProject)
    }, [selectedProject])

    // When no project is selected, redirect to projects page
    useEffect(() => {
        if (selectedProject === null && tab !== "projects") {
            setTab("projects")
            window.location.hash = "#projects"
        }
    }, [selectedProject, tab])

    // When project is selected and has no admin API, redirect to s3 page if not on s3 or projects
    useEffect(() => {
        const selected = getSelectedProjectInfo()
        if (selected && !selected.admin_url && tab !== "s3" && tab !== "projects") {
            setTab("s3")
            window.location.hash = "#s3"
        }
    }, [selectedProject, tab, getSelectedProjectInfo])

    // Removed automatic redirection to S3 tab - users should be able to access projects management anytime
    useEffect(() => {
        function onHashChange() {
            const h = window.location.hash.replace('#', '').split('?')[0]
            if (h === 's3' || h === 'buckets' || h === 'apps' || h === 'projects' || h === 'adminTokens' || h === 'nodes' || h === 'blocks' || h === 'workers' || h === 'cluster' || h === 'preview') {
                setTab(h)
            }
        }
        window.addEventListener('hashchange', onHashChange)
        return () => window.removeEventListener('hashchange', onHashChange)
    }, [])

    useEffect(() => {
        if (window.location.hash !== `#${tab}`) {
            window.location.hash = `#${tab}`
        }
    }, [tab])

    function onAuth() {
        setAuthed(true)
    }

    function logout() {
        authLogout() // Utilise la fonction de déconnexion du service d'authentification
        setAuthed(false)
    }

    if (!authed) return <Login onAuth={onAuth} />

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
                <CssBaseline />

                {/* Hide navigation when on projects page without selected project */}
                {!(tab === "projects" && !selectedProject) && (
                    <Navigation
                        tab={tab as NavigationProps["tab"]}
                        setTab={(v) => setTab(v)}
                        dark={dark}
                        setDark={(v) => { setDark(v); localStorage.setItem("kexamanager:dark", v ? "1" : "0") }}
                        lang={lang}
                        setLang={(l) => { setLang(l); }}
                        mobileOpen={mobileOpen}
                        setMobileOpen={setMobileOpen}
                        onLogout={logout}
                        selectedProject={getSelectedProjectInfo()}
                        projects={projects}
                        onSelectProject={setSelectedProject}
                    />
                )}

                <Box
                    component="main"
                    sx={{
                        flex: 1,
                        bgcolor: "background.default",
                        p: { xs: 1, sm: 2, md: 3 },
                        mt: { xs: "56px", md: 0 },
                        height: "100vh",
                        overflow: "auto",
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    {tab === "buckets" && <Buckets key="buckets" selectedProject={getSelectedProjectInfo()} />}
                    {tab === "apps" && <ApplicationsKeys key="apps" />}
                    {tab === "projects" && <Projects key="projects" selectedProject={selectedProject} onSelectProject={setSelectedProject} onProjectsChange={setProjects} />}
                    {tab === "s3" && <S3Browser key="s3" selectedProject={getSelectedProjectInfo()} />}
                    {tab === "adminTokens" && <AdminTokens key="adminTokens" />}
                    {tab === "nodes" && <Nodes key="nodes" />}
                    {tab === "blocks" && <Blocks key="blocks" />}
                    {tab === "workers" && <Workers key="workers" />}
                    {tab === "cluster" && <ClusterLayout key="cluster" />}
                    {tab === "preview" && <PreviewPage key="preview" selectedProject={getSelectedProjectInfo()} />}
                </Box>
            </Box>
        </ThemeProvider>
    )
}

export default App
