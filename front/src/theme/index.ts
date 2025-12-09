import { createTheme, type ThemeOptions } from "@mui/material/styles"

// Sovrabase Color Palette
const colors = {
    background: "#080b13", // Very dark navy
    paper: "#0f1522", // Slightly lighter for cards
    primary: "#0EA5E9", // Bright Sky Blue
    secondary: "#64748B", // Slate
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    textPrimary: "#F8FAFC",
    textSecondary: "#94A3B8",
    border: "#1e293b",
}

const baseTheme: ThemeOptions = {
    typography: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        h1: { fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.025em" },
        h2: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.025em" },
        h3: { fontSize: "1.25rem", fontWeight: 600 },
        h4: { fontSize: "1.125rem", fontWeight: 600 },
        h5: { fontSize: "1rem", fontWeight: 600 },
        h6: { fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" },
        body1: { fontSize: "0.875rem", lineHeight: 1.6 },
        body2: { fontSize: "0.75rem", lineHeight: 1.5 },
        button: { textTransform: "none", fontWeight: 500 },
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    scrollbarColor: "#334155 #0f172a",
                    "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
                        width: "8px",
                        height: "8px",
                    },
                    "&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track": {
                        background: "transparent",
                    },
                    "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                        backgroundColor: "#334155",
                        borderRadius: "4px",
                    },
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    "&:hover": {
                        boxShadow: "none",
                    },
                },
                containedPrimary: {
                    backgroundColor: colors.primary,
                    color: "#fff",
                    "&:hover": {
                        backgroundColor: "#0284c7",
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    boxShadow: "none",
                    border: `1px solid ${colors.border}`,
                },
            },
        },
    },
}

const darkTheme = createTheme({
    ...baseTheme,
    palette: {
        mode: "dark",
        background: {
            default: colors.background,
            paper: colors.paper,
        },
        primary: {
            main: colors.primary,
            contrastText: "#ffffff",
        },
        secondary: {
            main: colors.secondary,
        },
        success: { main: colors.success },
        warning: { main: colors.warning },
        error: { main: colors.error },
        text: {
            primary: colors.textPrimary,
            secondary: colors.textSecondary,
        },
        divider: colors.border,
    },
})

// Keeping a basic light theme for compatibility, but Sovrabase is primarily dark
const lightTheme = createTheme({
    ...baseTheme,
    palette: {
        mode: "light",
        primary: { main: colors.primary },
        background: {
            default: "#f8fafc",
            paper: "#ffffff",
        },
        text: {
            primary: "#0f172a",
            secondary: "#475569",
        },
    },
})

export { lightTheme, darkTheme }
