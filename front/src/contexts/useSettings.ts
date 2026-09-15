import { createContext, useContext } from "react"

export type ThemeMode = "light" | "dark"

export interface SettingsContextType {
    lang: string
    setLang: (lang: string) => void
    themeMode: ThemeMode
    toggleTheme: () => void
    sidebarCollapsed: boolean
    toggleSidebar: () => void
}

export const SettingsContext = createContext<SettingsContextType | null>(null)

export const useSettings = () => {
    const context = useContext(SettingsContext)
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider")
    }
    return context
}
