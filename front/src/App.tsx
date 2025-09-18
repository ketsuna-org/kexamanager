import { useState, useEffect } from "react"
import Login from "./pages/Login"
import Buckets from "./pages/dashboard/Buckets"
import ApplicationsKeys from "./pages/dashboard/ApplicationsKeys"
import AdminTokens from "./pages/dashboard/AdminTokens"
import Nodes from "./pages/dashboard/Nodes"
import Blocks from "./pages/dashboard/Blocks"
import Workers from "./pages/dashboard/Workers"
import ClusterLayout from "./pages/dashboard/ClusterLayout"
import { ThemeProvider } from "@mui/material/styles"
import { lightTheme, darkTheme } from "./theme"
import Switch from "@mui/material/Switch"
import FormControlLabel from "@mui/material/FormControlLabel"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Drawer from "@mui/material/Drawer"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import CssBaseline from "@mui/material/CssBaseline"
import AppBar from "@mui/material/AppBar"
import Toolbar from "@mui/material/Toolbar"
import IconButton from "@mui/material/IconButton"
import MenuIcon from "@mui/icons-material/Menu"
import StorageIcon from "@mui/icons-material/Storage"
import VpnKeyIcon from "@mui/icons-material/VpnKey"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import DevicesIcon from "@mui/icons-material/Devices"
import AppsIcon from "@mui/icons-material/Apps"
import BuildIcon from "@mui/icons-material/Build"
import AccountTreeIcon from "@mui/icons-material/AccountTree"
import LogoutIcon from "@mui/icons-material/Logout"
import { useTranslation } from "react-i18next"
import i18n from "./i18n"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import Divider from "@mui/material/Divider"
import { logout as authLogout, isLoggedIn } from "./auth/tokenAuth"

function App() {
    // example counter removed
    const [authed, setAuthed] = useState(false)
    const [tab, setTab] = useState<string>("buckets")
    const [dark, setDark] = useState<boolean>(() => localStorage.getItem("kexamanager:dark") === "1")

    const { t } = useTranslation()
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

                {/* AppBar for mobile to show hamburger */}
                <AppBar
                    position="fixed"
                    sx={{
                        display: { md: "none" },
                        zIndex: (theme) => theme.zIndex.drawer + 1,
                        background: theme.palette.background.paper,
                        color: theme.palette.text.primary,
                        boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                        height: 56,
                    }}
                >
                    <Toolbar>
                        <IconButton edge="start" color="inherit" aria-label="menu" onClick={() => setMobileOpen(true)}>
                            <MenuIcon />
                        </IconButton>
                        <Typography variant="h6" sx={{ flex: 1, fontWeight: 600 }}>
                            {t("dashboard.title")}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        size="small"
                                        checked={dark}
                                        onChange={(e) => {
                                            setDark(e.target.checked)
                                            localStorage.setItem("kexamanager:dark", e.target.checked ? "1" : "0")
                                        }}
                                    />
                                }
                                label=""
                            />
                            <Select value={lang} size="small" onChange={(e) => setLang(String(e.target.value))} sx={{ minWidth: 80 }}>
                                <MenuItem value="fr">FR</MenuItem>
                                <MenuItem value="en">EN</MenuItem>
                            </Select>
                        </Box>
                    </Toolbar>
                </AppBar>

                {/* Temporary Drawer for mobile */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    PaperProps={{
                        sx: {
                            width: 280,
                            bgcolor: "background.paper",
                            color: "text.primary",
                        },
                    }}
                    sx={{ display: { xs: "block", md: "none" } }}
                >
                    <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" fontWeight={700}>
                            {t("dashboard.title")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t("dashboard.subtitle", "Cluster Management")}
                        </Typography>
                    </Box>
                    <List sx={{ px: 2, py: 1 }}>
                        <ListItemButton
                            selected={tab === "buckets"}
                            onClick={() => {
                                setTab("buckets")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <StorageIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.buckets")} />
                        </ListItemButton>
                        <ListItemButton
                            selected={tab === "apps"}
                            onClick={() => {
                                setTab("apps")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <VpnKeyIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.apps")} />
                        </ListItemButton>
                        <Divider sx={{ my: 1 }} />
                        <ListItemButton
                            selected={tab === "adminTokens"}
                            onClick={() => {
                                setTab("adminTokens")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <AdminPanelSettingsIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.adminTokens")} />
                        </ListItemButton>
                        <ListItemButton
                            selected={tab === "nodes"}
                            onClick={() => {
                                setTab("nodes")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <DevicesIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.nodes")} />
                        </ListItemButton>
                        <ListItemButton
                            selected={tab === "blocks"}
                            onClick={() => {
                                setTab("blocks")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <AppsIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.blocks")} />
                        </ListItemButton>
                        <ListItemButton
                            selected={tab === "workers"}
                            onClick={() => {
                                setTab("workers")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <BuildIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.workers")} />
                        </ListItemButton>
                        <ListItemButton
                            selected={tab === "cluster"}
                            onClick={() => {
                                setTab("cluster")
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <AccountTreeIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.cluster")} />
                        </ListItemButton>
                        <Divider sx={{ my: 1 }} />
                        <ListItemButton
                            onClick={() => {
                                logout()
                                setMobileOpen(false)
                            }}
                        >
                            <ListItemIcon>
                                <LogoutIcon />
                            </ListItemIcon>
                            <ListItemText
                                primary={t("dashboard.logout", {
                                    defaultValue: "Se déconnecter",
                                })}
                            />
                        </ListItemButton>
                    </List>
                </Drawer>

                {/* Permanent Drawer for md+ */}
                <Drawer
                    variant="permanent"
                    open
                    PaperProps={{
                        sx: {
                            width: 280,
                            bgcolor: "background.paper",
                            color: "text.primary",
                            position: "relative",
                            height: "100vh",
                            borderRight: "1px solid",
                            borderColor: "divider",
                        },
                    }}
                    sx={{
                        display: { xs: "none", md: "block" },
                        "& .MuiDrawer-paper": {
                            width: 280,
                            position: "relative",
                            height: "100vh",
                        }
                    }}
                >
                    <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h5" fontWeight={700}>
                            {t("dashboard.title")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {t("dashboard.subtitle", "Cluster Management")}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        size="small"
                                        checked={dark}
                                        onChange={(e) => {
                                            setDark(e.target.checked)
                                            localStorage.setItem("kexamanager:dark", e.target.checked ? "1" : "0")
                                        }}
                                    />
                                }
                                label={t("settings.darkMode", "Dark")}
                            />
                            <Select value={lang} size="small" onChange={(e) => setLang(String(e.target.value))}>
                                <MenuItem value="fr">Français</MenuItem>
                                <MenuItem value="en">English</MenuItem>
                            </Select>
                        </Box>
                    </Box>

                    <List sx={{ px: 2, py: 1, flex: 1 }}>
                        <ListItemButton selected={tab === "buckets"} onClick={() => setTab("buckets")}>
                            <ListItemIcon>
                                <StorageIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.buckets")} />
                        </ListItemButton>
                        <ListItemButton selected={tab === "apps"} onClick={() => setTab("apps")}>
                            <ListItemIcon>
                                <VpnKeyIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.apps")} />
                        </ListItemButton>
                        <Divider sx={{ my: 1 }} />
                        <ListItemButton selected={tab === "adminTokens"} onClick={() => setTab("adminTokens")}>
                            <ListItemIcon>
                                <AdminPanelSettingsIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.adminTokens")} />
                        </ListItemButton>
                        <ListItemButton selected={tab === "nodes"} onClick={() => setTab("nodes")}>
                            <ListItemIcon>
                                <DevicesIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.nodes")} />
                        </ListItemButton>
                        <ListItemButton selected={tab === "blocks"} onClick={() => setTab("blocks")}>
                            <ListItemIcon>
                                <AppsIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.blocks")} />
                        </ListItemButton>
                        <ListItemButton selected={tab === "workers"} onClick={() => setTab("workers")}>
                            <ListItemIcon>
                                <BuildIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.workers")} />
                        </ListItemButton>
                        <ListItemButton selected={tab === "cluster"} onClick={() => setTab("cluster")}>
                            <ListItemIcon>
                                <AccountTreeIcon />
                            </ListItemIcon>
                            <ListItemText primary={t("dashboard.cluster")} />
                        </ListItemButton>
                        <Divider sx={{ my: 1 }} />
                        <ListItemButton
                            onClick={() => {
                                logout()
                            }}
                        >
                            <ListItemIcon>
                                <LogoutIcon />
                            </ListItemIcon>
                            <ListItemText
                                primary={t("dashboard.logout", {
                                    defaultValue: "Se déconnecter",
                                })}
                            />
                        </ListItemButton>
                    </List>
                </Drawer>

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
