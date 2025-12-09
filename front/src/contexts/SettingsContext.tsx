
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ThemeProvider, type Theme } from "@mui/material/styles"
import { lightTheme, darkTheme } from "../theme"
import CssBaseline from "@mui/material/CssBaseline"

type ThemeMode = 'light' | 'dark'

interface SettingsContextType {
    lang: string
    setLang: (lang: string) => void
    themeMode: ThemeMode
    toggleTheme: () => void
    sidebarCollapsed: boolean
    toggleSidebar: () => void
}

const SettingsContext = createContext<SettingsContextType | null>(null)

export const useSettings = () => {
    const context = useContext(SettingsContext)
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider")
    }
    return context
}

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const { i18n } = useTranslation()

    // Language State
    const [lang, setLang] = useState<string>(() => localStorage.getItem("kexamanager:lang") || "fr")

    // Theme State
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem("kexamanager:theme")
        return (saved === "light" || saved === "dark") ? saved : "dark"
    })

    const theme: Theme = themeMode === "light" ? lightTheme : darkTheme

    // Sync Language
    useEffect(() => {
        i18n.changeLanguage(lang)
        localStorage.setItem("kexamanager:lang", lang)
    }, [lang, i18n])

    // Sync Theme
    useEffect(() => {
        localStorage.setItem("kexamanager:theme", themeMode)
    }, [themeMode])

    // Sidebar State
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        return localStorage.getItem("kexamanager:sidebarCollapsed") === "true"
    })

    // Sync Sidebar
    useEffect(() => {
        localStorage.setItem("kexamanager:sidebarCollapsed", String(sidebarCollapsed))
    }, [sidebarCollapsed])

    const toggleSidebar = () => setSidebarCollapsed(prev => !prev)

    const toggleTheme = () => {
        setThemeMode((prev) => (prev === "light" ? "dark" : "light"))
    }

    return (
        <SettingsContext.Provider value={{ lang, setLang, themeMode, toggleTheme, sidebarCollapsed, toggleSidebar }}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </SettingsContext.Provider>
    )
}
