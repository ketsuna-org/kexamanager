import { useTranslation } from "react-i18next"
import AppBar from "@mui/material/AppBar"
import Toolbar from "@mui/material/Toolbar"
import IconButton from "@mui/material/IconButton"
import MenuIcon from "@mui/icons-material/Menu"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import FormControlLabel from "@mui/material/FormControlLabel"
import Switch from "@mui/material/Switch"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import Drawer from "@mui/material/Drawer"
import List from "@mui/material/List"
import ListItemButton from "@mui/material/ListItemButton"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Divider from "@mui/material/Divider"
import StorageIcon from "@mui/icons-material/Storage"
import VpnKeyIcon from "@mui/icons-material/VpnKey"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import DevicesIcon from "@mui/icons-material/Devices"
import AppsIcon from "@mui/icons-material/Apps"
import BuildIcon from "@mui/icons-material/Build"
import AccountTreeIcon from "@mui/icons-material/AccountTree"
import LogoutIcon from "@mui/icons-material/Logout"
import SettingsIcon from "@mui/icons-material/Settings"

type TabKey = "buckets" | "apps" | "projects" | "s3" | "adminTokens" | "nodes" | "blocks" | "workers" | "cluster"

export interface NavigationProps {
  tab: TabKey
  setTab: (t: TabKey) => void
  dark: boolean
  setDark: (v: boolean) => void
  lang: string
  setLang: (l: string) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  onLogout: () => void
  selectedProject?: { id: number; name: string } | null
}

export default function Navigation({ tab, setTab, dark, setDark, lang, setLang, mobileOpen, setMobileOpen, onLogout, selectedProject }: NavigationProps) {
  const { t } = useTranslation()

  const MobileAppBar = (
    <AppBar
      position="fixed"
      sx={{
        display: { md: "none" },
        zIndex: (theme) => theme.zIndex.drawer + 1,
        background: (theme) => theme.palette.background.paper,
        color: (theme) => theme.palette.text.primary,
        boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        height: 56,
      }}
    >
      <Toolbar>
        <IconButton edge="start" color="inherit" aria-label="menu" onClick={() => setMobileOpen(true)}>
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 600 }}>
          {selectedProject ? `${t("dashboard.title")} - ${selectedProject.name}` : t("dashboard.title")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FormControlLabel
            control={<Switch size="small" checked={dark} onChange={(e) => setDark(e.target.checked)} />}
            label=""
          />
          <Select value={lang} size="small" onChange={(e) => setLang(String(e.target.value))} sx={{ minWidth: 80 }}>
            <MenuItem value="fr">FR</MenuItem>
            <MenuItem value="en">EN</MenuItem>
          </Select>
        </Box>
      </Toolbar>
    </AppBar>
  )

  const MobileDrawer = (
    <Drawer
      variant="temporary"
      open={mobileOpen}
      onClose={() => setMobileOpen(false)}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { width: 280, bgcolor: "background.paper", color: "text.primary" } }}
      sx={{ display: { xs: "block", md: "none" } }}
    >
      <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={700}>
          {selectedProject ? `${t("dashboard.title")} - ${selectedProject.name}` : t("dashboard.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("dashboard.subtitle", "Cluster Management")}
        </Typography>
      </Box>
      <List sx={{ px: 2, py: 1 }}>
        <ListItemButton selected={tab === "buckets"} onClick={() => { setTab("buckets"); setMobileOpen(false) }}>
          <ListItemIcon><StorageIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.buckets")} />
        </ListItemButton>
        <ListItemButton selected={tab === "apps"} onClick={() => { setTab("apps"); setMobileOpen(false) }}>
          <ListItemIcon><VpnKeyIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.apps")} />
        </ListItemButton>
        <ListItemButton selected={tab === "projects"} onClick={() => { setTab("projects"); setMobileOpen(false) }}>
          <ListItemIcon><SettingsIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.projects", { defaultValue: "Projects" })} />
        </ListItemButton>
        <ListItemButton selected={tab === "s3"} onClick={() => { setTab("s3"); setMobileOpen(false) }}>
          <ListItemIcon><StorageIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.s3_browser")} />
        </ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton selected={tab === "adminTokens"} onClick={() => { setTab("adminTokens"); setMobileOpen(false) }}>
          <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.adminTokens")} />
        </ListItemButton>
        <ListItemButton selected={tab === "nodes"} onClick={() => { setTab("nodes"); setMobileOpen(false) }}>
          <ListItemIcon><DevicesIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.nodes")} />
        </ListItemButton>
        <ListItemButton selected={tab === "blocks"} onClick={() => { setTab("blocks"); setMobileOpen(false) }}>
          <ListItemIcon><AppsIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.blocks")} />
        </ListItemButton>
        <ListItemButton selected={tab === "workers"} onClick={() => { setTab("workers"); setMobileOpen(false) }}>
          <ListItemIcon><BuildIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.workers")} />
        </ListItemButton>
        <ListItemButton selected={tab === "cluster"} onClick={() => { setTab("cluster"); setMobileOpen(false) }}>
          <ListItemIcon><AccountTreeIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.cluster")} />
        </ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton onClick={() => { onLogout(); setMobileOpen(false) }}>
          <ListItemIcon><LogoutIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.logout", { defaultValue: "Se déconnecter" })} />
        </ListItemButton>
      </List>
    </Drawer>
  )

  const DesktopDrawer = (
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
      sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: 280, position: "relative", height: "100vh" } }}
    >
      <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="h5" fontWeight={700}>{t("dashboard.title")}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t("dashboard.subtitle", "Cluster Management")}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
          <FormControlLabel
            control={<Switch size="small" checked={dark} onChange={(e) => setDark(e.target.checked)} />}
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
          <ListItemIcon><StorageIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.buckets")} />
        </ListItemButton>
        <ListItemButton selected={tab === "apps"} onClick={() => setTab("apps")}>
          <ListItemIcon><VpnKeyIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.apps")} />
        </ListItemButton>
        <ListItemButton selected={tab === "s3"} onClick={() => setTab("s3")}>
          <ListItemIcon><StorageIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.s3_browser")} />
        </ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton selected={tab === "adminTokens"} onClick={() => setTab("adminTokens")}>
          <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.adminTokens")} />
        </ListItemButton>
        <ListItemButton selected={tab === "nodes"} onClick={() => setTab("nodes")}>
          <ListItemIcon><DevicesIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.nodes")} />
        </ListItemButton>
        <ListItemButton selected={tab === "blocks"} onClick={() => setTab("blocks")}>
          <ListItemIcon><AppsIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.blocks")} />
        </ListItemButton>
        <ListItemButton selected={tab === "workers"} onClick={() => setTab("workers")}>
          <ListItemIcon><BuildIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.workers")} />
        </ListItemButton>
        <ListItemButton selected={tab === "cluster"} onClick={() => setTab("cluster")}>
          <ListItemIcon><AccountTreeIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.cluster")} />
        </ListItemButton>
        <Divider sx={{ my: 1 }} />
        <ListItemButton onClick={() => { onLogout() }}>
          <ListItemIcon><LogoutIcon /></ListItemIcon>
          <ListItemText primary={t("dashboard.logout", { defaultValue: "Se déconnecter" })} />
        </ListItemButton>
      </List>
    </Drawer>
  )

  return (
    <>
      {MobileAppBar}
      {MobileDrawer}
      {DesktopDrawer}
    </>
  )
}
