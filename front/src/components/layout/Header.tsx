import { Box, Typography, Button, IconButton, Tooltip, Select, MenuItem } from "@mui/material"
import { Plus, Sun, Moon } from "lucide-react"
import { useSettings } from "../../contexts/SettingsContext"

interface HeaderProps {
    title: string
    action?: React.ReactNode
}

const Header = ({ title, action }: HeaderProps) => {
    const { lang, setLang, themeMode, toggleTheme } = useSettings()

    return (
        <Box sx={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 3,
            borderBottom: "1px solid", // Optional: might strictly not need border if background matches
            borderColor: "divider",
        }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {title}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <Select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    size="small"
                    sx={{ height: 32, minWidth: 60 }}
                    variant="outlined"
                >
                    <MenuItem value="en">EN</MenuItem>
                    <MenuItem value="fr">FR</MenuItem>
                </Select>

                <Tooltip title={themeMode === "dark" ? "Light Mode" : "Dark Mode"}>
                    <IconButton onClick={toggleTheme} size="small">
                        {themeMode === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                    </IconButton>
                </Tooltip>

                {action || (
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={<Plus size={16} />}
                    >
                        New Project
                    </Button>
                )}
            </Box>
        </Box>
    )
}

export default Header
