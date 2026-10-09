import { useEffect, useMemo, useState } from "react"
import { Outlet } from "react-router-dom"
import Box from "@mui/material/Box"
import Drawer from "@mui/material/Drawer"
import useMediaQuery from "@mui/material/useMediaQuery"
import { k, layout } from "../theme"
import { Sidebar } from "./Sidebar"
import { CommandPalette } from "./CommandPalette"
import { ShellContext } from "./shellContext"

/** Sidebar + content area. Below 1200 px the sidebar becomes a drawer. */
export function AppShell({ onLogout }: { onLogout: () => void }) {
    const docked = useMediaQuery("(min-width:1200px)")
    const [navOpen, setNavOpen] = useState(false)
    const [paletteOpen, setPaletteOpen] = useState(false)

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault()
                setPaletteOpen((open) => !open)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [])

    const shell = useMemo(() => ({ openNav: () => setNavOpen(true) }), [])
    const sidebar = (
        <Sidebar
            onLogout={onLogout}
            onSearch={() => {
                setNavOpen(false)
                setPaletteOpen(true)
            }}
            onNavigate={() => setNavOpen(false)}
        />
    )

    return (
        <ShellContext.Provider value={shell}>
            <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: k.bg }}>
                {docked ? (
                    <Box sx={{ width: layout.sidebar, flex: "none", borderRight: `1px solid ${k.border}`, position: "sticky", top: 0, height: "100vh" }}>{sidebar}</Box>
                ) : (
                    <Drawer open={navOpen} onClose={() => setNavOpen(false)} slotProps={{ paper: { sx: { width: 280 } } }}>
                        {sidebar}
                    </Drawer>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Outlet />
                </Box>
            </Box>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </ShellContext.Provider>
    )
}
