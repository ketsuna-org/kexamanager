import { createTheme, type ThemeOptions } from "@mui/material/styles"

const baseTheme: ThemeOptions = {
    palette: {
        primary: {
            main: "#000000",
            dark: "#000000",
            light: "#333333",
        },
        secondary: {
            main: "#666666",
            dark: "#333333",
            light: "#999999",
        },
        success: {
            main: "#000000",
            dark: "#000000",
            light: "#333333",
        },
        warning: {
            main: "#666666",
            dark: "#333333",
            light: "#999999",
        },
        error: {
            main: "#000000",
            dark: "#000000",
            light: "#333333",
        },
        info: {
            main: "#666666",
            dark: "#333333",
            light: "#999999",
        },
    },
    typography: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif',
        h1: {
            fontSize: "2.5rem",
            fontWeight: 700,
            lineHeight: 1.2,
        },
        h2: {
            fontSize: "2rem",
            fontWeight: 600,
            lineHeight: 1.3,
        },
        h3: {
            fontSize: "1.5rem",
            fontWeight: 600,
            lineHeight: 1.4,
        },
        h4: {
            fontSize: "1.25rem",
            fontWeight: 600,
            lineHeight: 1.4,
        },
        h5: {
            fontSize: "1.1rem",
            fontWeight: 600,
            lineHeight: 1.5,
        },
        h6: {
            fontSize: "1rem",
            fontWeight: 600,
            lineHeight: 1.5,
        },
        body1: {
            fontSize: "1rem",
            lineHeight: 1.6,
        },
        body2: {
            fontSize: "0.875rem",
            lineHeight: 1.5,
        },
        caption: {
            fontSize: "0.75rem",
            fontWeight: 500,
            lineHeight: 1.4,
        },
    },
    shape: {
        borderRadius: 8,
    },
    spacing: 8,
}

const lightTheme = createTheme({
    ...baseTheme,
    palette: {
        ...baseTheme.palette,
        mode: "light",
        // Couleurs avec contraste AA sur fond blanc
        primary: { main: "#1976d2", dark: "#115293", light: "#4791db", contrastText: "#ffffff" },
        secondary: { main: "#9c27b0", dark: "#6d1b7b", light: "#af52bf", contrastText: "#ffffff" },
        success: { main: "#2e7d32", dark: "#1b5e20", light: "#60ad5e", contrastText: "#ffffff" },
        warning: { main: "#ed6c02", dark: "#b53d00", light: "#ff9800", contrastText: "#000000" },
        error: { main: "#d32f2f", dark: "#9a0007", light: "#ef5350", contrastText: "#ffffff" },
        info: { main: "#0288d1", dark: "#01579b", light: "#03a9f4", contrastText: "#ffffff" },
        background: {
            default: "#ffffff",
            paper: "#ffffff",
        },
        text: {
            primary: "#111827", // gray-900
            secondary: "#4b5563", // gray-600
        },
        divider: "#e5e7eb", // gray-200
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: "#ffffff",
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e5e5",
                    boxShadow: "none",
                },
                elevation1: {
                    boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.05)",
                },
                elevation2: {
                    boxShadow: "0 2px 6px 0 rgb(0 0 0 / 0.08)",
                },
                elevation3: {
                    boxShadow: "0 4px 12px 0 rgb(0 0 0 / 0.12)",
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 500,
                    borderRadius: 6,
                    boxShadow: "none",
                    border: "1px solid transparent",
                    // Limiter l'effet hover neutre aux variantes text/outlined
                    "&.MuiButton-text:hover, &.MuiButton-outlined:hover": {
                        boxShadow: "none",
                        backgroundColor: "#f5f5f5",
                    },
                },
                // Laisser les variantes (contained/outlined/text) utiliser la palette MUI
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        borderRadius: 6,
                        backgroundColor: "#ffffff",
                        "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#e5e5e5",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#000000",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                            borderWidth: 1,
                            borderColor: "#000000",
                        },
                    },
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    margin: "1px 8px",
                    "&.Mui-selected": {
                        backgroundColor: "#f5f5f5",
                        color: "#000000",
                        "&:hover": {
                            backgroundColor: "#e5e5e5",
                        },
                    },
                    "&:hover": {
                        backgroundColor: "#f9f9f9",
                    },
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    borderRight: "1px solid #e5e5e5",
                    boxShadow: "none",
                    backgroundColor: "#ffffff",
                },
            },
        },
        MuiContainer: {
            styleOverrides: {
                root: {
                    paddingLeft: 8,
                    paddingRight: 8,
                    maxWidth: "100%",
                    "@media (min-width: 600px)": {
                        paddingLeft: 16,
                        paddingRight: 16,
                    },
                    "@media (min-width: 900px)": {
                        paddingLeft: 24,
                        paddingRight: 24,
                    },
                },
            },
        },
        MuiTableContainer: {
            styleOverrides: {
                root: {
                    overflowX: "auto",
                    width: "100%",
                    "@media (max-width: 600px)": {
                        "& .MuiTable-root": {
                            minWidth: "600px",
                        },
                    },
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    margin: 16,
                    width: "calc(100% - 32px)",
                    maxWidth: "none",
                    "@media (min-width: 600px)": {
                        margin: 32,
                        width: "auto",
                        maxWidth: "600px",
                    },
                },
            },
        },
    },
})

const darkTheme = createTheme({
    ...baseTheme,
    palette: {
        ...baseTheme.palette,
        mode: "dark",
        // Palette adaptée au mode sombre avec contrastes suffisants
        primary: { main: "#90caf9", dark: "#42a5f5", light: "#e3f2fd", contrastText: "#0a0a0a" },
        secondary: { main: "#ce93d8", dark: "#ab47bc", light: "#f3e5f5", contrastText: "#0a0a0a" },
        success: { main: "#81c784", dark: "#66bb6a", light: "#e8f5e9", contrastText: "#0a0a0a" },
        warning: { main: "#ffb74d", dark: "#fb8c00", light: "#fff3e0", contrastText: "#0a0a0a" },
        error: { main: "#ef5350", dark: "#e53935", light: "#ffebee", contrastText: "#0a0a0a" },
        info: { main: "#64b5f6", dark: "#1e88e5", light: "#e3f2fd", contrastText: "#0a0a0a" },
        background: {
            default: "#121212",
            paper: "#121212",
        },
        text: {
            primary: "#ffffff",
            secondary: "#b0b0b0",
        },
        divider: "#333333",
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: "#121212",
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    backgroundColor: "#121212",
                    border: "1px solid #333333",
                    boxShadow: "none",
                },
                elevation1: {
                    boxShadow: "0 1px 3px 0 rgb(255 255 255 / 0.05)",
                },
                elevation2: {
                    boxShadow: "0 2px 6px 0 rgb(255 255 255 / 0.08)",
                },
                elevation3: {
                    boxShadow: "0 4px 12px 0 rgb(255 255 255 / 0.12)",
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 500,
                    borderRadius: 6,
                    boxShadow: "none",
                    border: "1px solid transparent",
                    // Limiter l'effet hover neutre aux variantes text/outlined
                    "&.MuiButton-text:hover, &.MuiButton-outlined:hover": {
                        boxShadow: "none",
                        backgroundColor: "#1a1a1a",
                    },
                },
                // Laisser MUI appliquer les bonnes couleurs selon la palette
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        borderRadius: 6,
                        backgroundColor: "#121212",
                        "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#333333",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#90caf9",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                            borderWidth: 1,
                            borderColor: "#90caf9",
                        },
                    },
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    margin: "1px 8px",
                    "&.Mui-selected": {
                        backgroundColor: "#1a1a1a",
                        color: "#ffffff",
                        "&:hover": {
                            backgroundColor: "#333333",
                        },
                    },
                    "&:hover": {
                        backgroundColor: "#0a0a0a",
                    },
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    borderRight: "1px solid #333333",
                    boxShadow: "none",
                    backgroundColor: "#121212",
                },
            },
        },
        MuiContainer: {
            styleOverrides: {
                root: {
                    paddingLeft: 8,
                    paddingRight: 8,
                    maxWidth: "100%",
                    "@media (min-width: 600px)": {
                        paddingLeft: 16,
                        paddingRight: 16,
                    },
                    "@media (min-width: 900px)": {
                        paddingLeft: 24,
                        paddingRight: 24,
                    },
                },
            },
        },
        MuiTableContainer: {
            styleOverrides: {
                root: {
                    overflowX: "auto",
                    width: "100%",
                    "@media (max-width: 600px)": {
                        "& .MuiTable-root": {
                            minWidth: "600px",
                        },
                    },
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    margin: 16,
                    width: "calc(100% - 32px)",
                    maxWidth: "none",
                    "@media (min-width: 600px)": {
                        margin: 32,
                        width: "auto",
                        maxWidth: "600px",
                    },
                },
            },
        },
    },
})

export { lightTheme, darkTheme }
