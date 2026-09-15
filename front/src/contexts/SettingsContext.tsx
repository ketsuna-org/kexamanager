import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ThemeProvider, useColorScheme } from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"
import { DEFAULT_MODE, MODE_STORAGE_KEY, theme } from "../theme"
import { SettingsContext, type ThemeMode } from "./useSettings"

interface SettingsState {
    lang: string
    setLang: (lang: string) => void
    sidebarCollapsed: boolean
    toggleSidebar: () => void
}

/**
 * Second provider layer: it lives inside `ThemeProvider` so it can drive the MUI
 * color scheme (`useColorScheme`) while exposing the historical context API.
 * The mode itself is persisted by `ThemeProvider` under `MODE_STORAGE_KEY`.
 */
const ColorSchemeBridge = ({ value, children }: { value: SettingsState; children: ReactNode }) => {
    const { mode, setMode } = useColorScheme()

    const themeMode: ThemeMode = mode === "light" ? "light" : "dark"

    const toggleTheme = useCallback(() => {
        setMode(themeMode === "light" ? "dark" : "light")
    }, [setMode, themeMode])

    const contextValue = useMemo(
        () => ({ ...value, themeMode, toggleTheme }),
        [value, themeMode, toggleTheme],
    )

    return (
        <SettingsContext.Provider value={contextValue}>
            <CssBaseline />
            {children}
        </SettingsContext.Provider>
    )
}

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const { i18n } = useTranslation()

    // Language State
    const [lang, setLang] = useState<string>(() => localStorage.getItem("kexamanager:lang") || "fr")

    // Sidebar State
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        return localStorage.getItem("kexamanager:sidebarCollapsed") === "true"
    })

    // Sync Language
    useEffect(() => {
        i18n.changeLanguage(lang)
        localStorage.setItem("kexamanager:lang", lang)
    }, [lang, i18n])

    // Sync Sidebar
    useEffect(() => {
        localStorage.setItem("kexamanager:sidebarCollapsed", String(sidebarCollapsed))
    }, [sidebarCollapsed])

    const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), [])

    const state = useMemo<SettingsState>(
        () => ({ lang, setLang, sidebarCollapsed, toggleSidebar }),
        [lang, sidebarCollapsed, toggleSidebar],
    )

    return (
        <ThemeProvider
            theme={theme}
            defaultMode={DEFAULT_MODE}
            modeStorageKey={MODE_STORAGE_KEY}
            disableTransitionOnChange
        >
            <ColorSchemeBridge value={state}>{children}</ColorSchemeBridge>
        </ThemeProvider>
    )
}
