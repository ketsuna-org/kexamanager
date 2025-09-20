import { useState, useEffect } from "react"
import Login from "./pages/Login"
import Buckets from "./pages/dashboard/Buckets"
import S3Browser from "./pages/dashboard/S3Browser"
import ApplicationsKeys from "./pages/dashboard/ApplicationsKeys"
import AdminTokens from "./pages/dashboard/AdminTokens"
import Nodes from "./pages/dashboard/Nodes"
import Blocks from "./pages/dashboard/Blocks"
import Workers from "./pages/dashboard/Workers"
import ClusterLayout from "./pages/dashboard/ClusterLayout"
import { ThemeProvider } from "@mui/material/styles"
import { lightTheme, darkTheme } from "./theme"
import Box from "@mui/material/Box"
import CssBaseline from "@mui/material/CssBaseline"
import { useTranslation } from "react-i18next"
import i18n from "./i18n"
import { logout as authLogout, isLoggedIn } from "./auth/tokenAuth"
import Navigation, { type NavigationProps } from "./components/Navigation"

function App() {
    // example counter removed
    const [authed, setAuthed] = useState(false)
    const [tab, setTab] = useState<string>(() => {
        const h = window.location.hash.replace('#', '')
        if (h === 's3' || h === 'buckets' || h === 'apps' || h === 'adminTokens' || h === 'nodes' || h === 'blocks' || h === 'workers' || h === 'cluster') {
            return h
        }
        return "buckets"
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

    const theme = dark ? darkTheme : lightTheme

    useEffect(() => {
        const authenticated = isLoggedIn()
        setAuthed(authenticated)
    }, [])

    // sync hash -> tab and tab -> hash
    useEffect(() => {
        function onHashChange() {
            const h = window.location.hash.replace('#', '')
            if (h) setTab(h)
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
                />

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
                    {tab === "buckets" && <Buckets />}
                    {tab === "apps" && <ApplicationsKeys />}
                    {tab === "s3" && <S3Browser />}
                    {tab === "adminTokens" && <AdminTokens />}
                    {tab === "nodes" && <Nodes />}
                    {tab === "blocks" && <Blocks />}
                    {tab === "workers" && <Workers />}
                    {tab === "cluster" && <ClusterLayout />}
                </Box>
            </Box>
        </ThemeProvider>
    )
}

export default App
