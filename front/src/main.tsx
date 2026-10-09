import { createRoot } from "react-dom/client"
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript"
import "@fontsource/ibm-plex-sans/400.css"
import "@fontsource/ibm-plex-sans/500.css"
import "@fontsource/ibm-plex-sans/600.css"
import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-mono/500.css"
import "./i18n"
import { DEFAULT_MODE, MODE_STORAGE_KEY } from "./theme"
import { SettingsProvider } from "./contexts/SettingsContext"
import App from "./App.tsx"

// The stored mode is applied to <html> before React renders: `InitColorSchemeScript`
// only emits its inline script on a server render, which a client side SPA never
// does, so the class is set here to guarantee the first paint uses the right scheme.
const storedMode = localStorage.getItem(MODE_STORAGE_KEY)
document.documentElement.classList.add(storedMode === "light" ? "light" : DEFAULT_MODE)

createRoot(document.getElementById("root")!).render(
    <>
        <InitColorSchemeScript
            attribute="class"
            defaultMode={DEFAULT_MODE}
            modeStorageKey={MODE_STORAGE_KEY}
        />
        <SettingsProvider>
            <App />
        </SettingsProvider>
    </>,
)
