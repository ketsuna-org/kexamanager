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
        background: {
            default: "#ffffff",
            paper: "#ffffff",
        },
        text: {
            primary: "#000000",
            secondary: "#666666",
        },
        divider: "#e5e5e5",
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
                    "&:hover": {
                        boxShadow: "none",
                        backgroundColor: "#f5f5f5",
                    },
                },
                contained: {
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    "&:hover": {
                        backgroundColor: "#333333",
                        boxShadow: "none",
                    },
                },
                outlined: {
                    borderColor: "#e5e5e5",
                    color: "#000000",
                    "&:hover": {
                        borderColor: "#000000",
                        backgroundColor: "transparent",
                    },
                },
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
        primary: {
            main: "#ffffff",
            dark: "#ffffff",
            light: "#cccccc",
        },
        background: {
            default: "#000000",
            paper: "#000000",
        },
        text: {
            primary: "#ffffff",
            secondary: "#999999",
        },
        divider: "#333333",
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: "#000000",
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    backgroundColor: "#000000",
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
                    "&:hover": {
                        boxShadow: "none",
                        backgroundColor: "#1a1a1a",
                    },
                },
                contained: {
                    backgroundColor: "#ffffff",
                    color: "#000000",
                    "&:hover": {
                        backgroundColor: "#cccccc",
                        boxShadow: "none",
                    },
                },
                outlined: {
                    borderColor: "#333333",
                    color: "#ffffff",
                    "&:hover": {
                        borderColor: "#ffffff",
                        backgroundColor: "transparent",
                    },
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        borderRadius: 6,
                        backgroundColor: "#000000",
                        "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#333333",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                            borderColor: "#ffffff",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                            borderWidth: 1,
                            borderColor: "#ffffff",
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
                    backgroundColor: "#000000",
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
