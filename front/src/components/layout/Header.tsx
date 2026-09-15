import AppBar from "@mui/material/AppBar"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { Menu, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useSettings } from "../../contexts/useSettings"
import { layout } from "../../theme"
import ProjectSwitcher from "./ProjectSwitcher"

interface HeaderProps {
    title?: string
    action?: React.ReactNode
    /** Opens the mobile navigation drawer; the button only shows below `md`. */
    onMenuClick?: () => void
}

/**
 * Application top bar: navigation toggle (mobile), current screen title, global
 * project switcher and the user settings controls. Height comes from the
 * `layout.appBar` token so every screen shares the same chrome.
 */
const Header = ({ title, action, onMenuClick }: HeaderProps) => {
    const { t } = useTranslation()
    const { lang, setLang, themeMode, toggleTheme } = useSettings()
    const themeLabel = themeMode === "dark" ? t("shell.light_mode") : t("shell.dark_mode")

    return (
        <AppBar
            position="static"
            color="inherit"
            elevation={0}
            sx={{
                height: layout.appBar,
                flexShrink: 0,
                bgcolor: "background.paper",
                borderBottom: "1px solid",
                borderColor: "divider",
            }}
        >
            <Box sx={{ height: layout.appBar, display: "flex", alignItems: "center", gap: 2, px: { xs: 1.5, sm: 3 } }}>
                {onMenuClick && (
                    <IconButton
                        onClick={onMenuClick}
                        aria-label={t("shell.open_nav")}
                        sx={{ display: { xs: "inline-flex", md: "none" } }}
                    >
                        <Menu size={20} />
                    </IconButton>
                )}

                {title ? (
                    <Typography variant="h6" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                        {title}
                    </Typography>
                ) : (
                    <Box sx={{ flex: 1, minWidth: 0 }} />
                )}

                <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 }, minWidth: 0 }}>
                    <ProjectSwitcher />

                    <Select
                        value={lang}
                        onChange={(e) => setLang(e.target.value)}
                        size="small"
                        sx={{ height: 32, minWidth: 60 }}
                        variant="outlined"
                        slotProps={{ input: { "aria-label": t("shell.language") } }}
                    >
                        <MenuItem value="en">EN</MenuItem>
                        <MenuItem value="fr">FR</MenuItem>
                    </Select>

                    <Tooltip title={themeLabel}>
                        <IconButton onClick={toggleTheme} size="small" aria-label={themeLabel}>
                            {themeMode === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                        </IconButton>
                    </Tooltip>

                    {action}
                </Box>
            </Box>
        </AppBar>
    )
}

export default Header
