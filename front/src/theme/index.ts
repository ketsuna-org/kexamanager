import { createTheme, type ThemeOptions } from "@mui/material/styles"

/**
 * Design tokens - source unique de verite pour le theme clair et sombre.
 * Les valeurs sont figees ici pour etre exposees aux composants via `theme.kexa`.
 */
export const radius = { none: 0, sm: 6, md: 8, lg: 12, xl: 16, full: 999 } as const

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const

export const layout = { appBar: 56, sidebar: 264, sidebarRail: 72, contentMax: 1560 } as const

export const density = {
    compact: { row: 32, control: 32, padding: 8 },
    standard: { row: 40, control: 36, padding: 12 },
    comfortable: { row: 52, control: 44, padding: 16 },
} as const

export const palette = {
    dark: {
        bgDefault: "#0B0F17",
        bgPaper: "#121826",
        bgElevated: "#171F31",
        bgHover: "rgba(148, 163, 184, 0.08)",
        primary: "#0EA5E9",
        primaryHover: "#38BDF8",
        primaryPressed: "#0284C7",
        secondary: "#64748B",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#38BDF8",
        textPrimary: "#E6EDF7",
        textSecondary: "#94A3B8",
        textDisabled: "#64748B",
        divider: "#1E293B",
        contrastText: "#04121C",
    },
    light: {
        bgDefault: "#F6F8FB",
        bgPaper: "#FFFFFF",
        bgElevated: "#FFFFFF",
        bgHover: "rgba(15, 23, 42, 0.04)",
        primary: "#0284C7",
        primaryHover: "#0369A1",
        primaryPressed: "#075985",
        secondary: "#64748B",
        success: "#047857",
        warning: "#B45309",
        error: "#DC2626",
        info: "#0369A1",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        textDisabled: "#94A3B8",
        divider: "#E2E8F0",
        contrastText: "#FFFFFF",
    },
} as const

export const fontFamily =
    '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

/** localStorage key holding the user preference (`light` | `dark`), kept from the previous implementation. */
export const MODE_STORAGE_KEY = "kexamanager:theme"

/** Mode used when nothing is stored yet. */
export const DEFAULT_MODE = "dark" as const

/**
 * Component overrides shared by both color schemes: every mode dependent value
 * goes through the generated CSS variables (`--kexa-*`) so a single override
 * serves the light and the dark schema. MUI 9 does not accept `components`
 * inside `colorSchemes`, only at the theme root.
 */
const components: ThemeOptions["components"] = {
    MuiCssBaseline: {
        styleOverrides: {
            body: {
                scrollbarColor: "var(--kexa-palette-text-disabled) transparent",
                "&::-webkit-scrollbar, & *::-webkit-scrollbar": { width: 10, height: 10 },
                "&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track": { background: "transparent" },
                "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                    backgroundColor: "var(--kexa-palette-divider)",
                    borderRadius: 8,
                    backgroundClip: "padding-box",
                    border: "2px solid transparent",
                },
            },
            "*:focus-visible": {
                outline: "2px solid var(--kexa-palette-primary-main)",
                outlineOffset: 2,
            },
        },
    },
    MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
            root: {
                backgroundImage: "none",
                border: "1px solid var(--kexa-palette-divider)",
                borderRadius: radius.lg,
            },
        },
    },
    MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
            root: {
                borderRadius: radius.sm,
                paddingInline: 14,
                minHeight: 34,
                textTransform: "none",
            },
        },
    },
    MuiTextField: { defaultProps: { size: "small", variant: "outlined" } },
    MuiSelect: { defaultProps: { size: "small" } },
    MuiTableCell: {
        styleOverrides: {
            head: {
                fontWeight: 600,
                fontSize: "0.75rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--kexa-palette-text-secondary)",
                backgroundColor: "var(--kexa-palette-background-paper)",
                position: "sticky",
                top: 0,
                zIndex: 2,
            },
            body: { borderBottom: "1px solid var(--kexa-palette-divider)" },
        },
    },
    MuiTableRow: {
        styleOverrides: { root: { "&:hover": { backgroundColor: "var(--kexa-palette-action-hover)" } } },
    },
    MuiDialog: {
        styleOverrides: {
            paper: { borderRadius: radius.lg, border: "1px solid var(--kexa-palette-divider)" },
        },
    },
    MuiTooltip: { defaultProps: { arrow: true, enterDelay: 300 } },
    MuiChip: { styleOverrides: { sizeSmall: { height: 22, fontSize: "0.75rem" } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: radius.sm, minHeight: 38 } } },
    MuiSkeleton: { defaultProps: { animation: "wave" } },
    MuiTypography: {
        variants: [
            {
                props: { variant: "pageTitle" },
                style: { fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.01em" },
            },
            {
                props: { variant: "metric" },
                style: { fontSize: "1.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" },
            },
            {
                props: { variant: "code" },
                style: {
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "0.8125rem",
                },
            },
        ],
    },
}

const typography = {
    fontFamily,
    h1: { fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontSize: "1.25rem", fontWeight: 600 },
    h4: { fontSize: "1.125rem", fontWeight: 600 },
    h5: { fontSize: "1rem", fontWeight: 600 },
    h6: { fontSize: "0.8125rem", fontWeight: 600, textTransform: "none", letterSpacing: "0.01em" },
    subtitle1: { fontSize: "0.875rem", fontWeight: 600 },
    subtitle2: { fontSize: "0.8125rem", fontWeight: 600 },
    body1: { fontSize: "0.875rem", lineHeight: 1.6 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
    caption: { fontSize: "0.75rem", lineHeight: 1.4 },
    button: { textTransform: "none", fontWeight: 600, fontSize: "0.8125rem" },
    overline: {
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
    },
} as const

const kexa = { layout, density, radius, space }

/**
 * Theme unique : les deux schemas clair/sombre sont centralises et exposes en
 * variables CSS (prefixe `--kexa-`), ce qui permet la bascule de mode sans
 * recalculer le theme cote React.
 */
export const theme = createTheme({
    cssVariables: { cssVarPrefix: "kexa", colorSchemeSelector: "class" },
    colorSchemes: {
        dark: {
            palette: {
                mode: "dark",
                background: { default: palette.dark.bgDefault, paper: palette.dark.bgPaper },
                primary: {
                    main: palette.dark.primary,
                    light: palette.dark.primaryHover,
                    dark: palette.dark.primaryPressed,
                    contrastText: palette.dark.contrastText,
                },
                secondary: { main: palette.dark.secondary },
                success: { main: palette.dark.success },
                warning: { main: palette.dark.warning },
                error: { main: palette.dark.error },
                info: { main: palette.dark.info },
                text: {
                    primary: palette.dark.textPrimary,
                    secondary: palette.dark.textSecondary,
                    disabled: palette.dark.textDisabled,
                },
                divider: palette.dark.divider,
                action: { hover: palette.dark.bgHover },
            },
        },
        light: {
            palette: {
                mode: "light",
                background: { default: palette.light.bgDefault, paper: palette.light.bgPaper },
                primary: {
                    main: palette.light.primary,
                    light: palette.light.primaryHover,
                    dark: palette.light.primaryPressed,
                    contrastText: palette.light.contrastText,
                },
                secondary: { main: palette.light.secondary },
                success: { main: palette.light.success },
                warning: { main: palette.light.warning },
                error: { main: palette.light.error },
                info: { main: palette.light.info },
                text: {
                    primary: palette.light.textPrimary,
                    secondary: palette.light.textSecondary,
                    disabled: palette.light.textDisabled,
                },
                divider: palette.light.divider,
                action: { hover: palette.light.bgHover },
            },
        },
    },
    components,
    shape: { borderRadius: radius.md },
    spacing: 4,
    typography,
    kexa,
})

declare module "@mui/material/styles" {
    interface Theme {
        kexa: typeof kexa
    }
    interface ThemeOptions {
        kexa?: typeof kexa | undefined
    }
}

declare module "@mui/material/Typography" {
    interface TypographyPropsVariantOverrides {
        pageTitle: true
        metric: true
        code: true
    }
}
