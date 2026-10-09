import { createTheme, type ThemeOptions } from "@mui/material/styles"

/**
 * Design tokens of the console. Every color is a CSS variable (`--k-*`) defined
 * once per color scheme below, so components reference `k.card` and the same
 * style serves the dark and the light scheme. MUI's own palette is derived from
 * the same values for the MUI components still in use (inputs, dialogs, menus).
 */
const tokens = {
    dark: {
        bg: "#0D0F12",
        side: "#111418",
        card: "#13161A",
        raised: "#171A1F",
        raisedHover: "#1E2228",
        input: "#0F1215",
        border: "#22262C",
        borderStrong: "#2A2F36",
        borderHover: "#3A4049",
        rowBorder: "#1B1E23",
        hover: "#181C21",
        active: "#1D2127",
        rowHover: "#161A1F",
        rowSelected: "#1F1710",
        text: "#E8EAED",
        text2: "#9AA2AD",
        label: "#8A929D",
        nav: "#AAB1BB",
        faint: "#5B636E",
        accent: "#FF7A1A",
        accentHover: "#FF8F3F",
        onAccent: "#1B0C00",
        accentSoft: "#2C1A0C",
        accentText: "#FF9B57",
        link: "#FF8B3D",
        linkHover: "#FFB27F",
        okBg: "#0F2A1D",
        ok: "#5FD39A",
        warnBg: "#2D2210",
        warn: "#F2B54C",
        warnBar: "#E9A23B",
        errBg: "#311416",
        err: "#FF8A86",
        errBar: "#F0605A",
        infoBg: "#1B2A3A",
        info: "#8CC4FF",
        tagBg: "#1A1E24",
        tagBorder: "#262B32",
        tagText: "#C3C9D1",
        dangerBorder: "#4A2326",
        dangerBg: "#1C1214",
        shadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
    },
    light: {
        bg: "#F5F6F8",
        side: "#FFFFFF",
        card: "#FFFFFF",
        raised: "#FFFFFF",
        raisedHover: "#F1F3F5",
        input: "#FFFFFF",
        border: "#E3E6EA",
        borderStrong: "#D3D8DE",
        borderHover: "#B8BEC6",
        rowBorder: "#EEF0F3",
        hover: "#F1F3F5",
        active: "#ECEEF1",
        rowHover: "#F8F9FA",
        rowSelected: "#FFF3E8",
        text: "#15181D",
        text2: "#5B636E",
        label: "#69717D",
        nav: "#3D444D",
        faint: "#9AA2AD",
        accent: "#FF7A1A",
        accentHover: "#FF8F3F",
        onAccent: "#1B0C00",
        accentSoft: "#FFEBDA",
        accentText: "#B2470A",
        link: "#B2470A",
        linkHover: "#8A3707",
        okBg: "#E2F5EB",
        ok: "#137A48",
        warnBg: "#FCF0DA",
        warn: "#8F5300",
        warnBar: "#E9A23B",
        errBg: "#FDE8E7",
        err: "#B42318",
        errBar: "#E5484D",
        infoBg: "#E4F0FC",
        info: "#1D5FA8",
        tagBg: "#F1F3F5",
        tagBorder: "#E3E6EA",
        tagText: "#3D444D",
        dangerBorder: "#F2C4C2",
        dangerBg: "#FFF6F5",
        shadow: "0 12px 40px rgba(15, 23, 42, 0.14)",
    },
} as const

type TokenName = keyof typeof tokens.dark

const cssName = (name: string) => `--k-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`

/** `k.card` → `var(--k-card)`: the value to put in `sx` props. */
export const k = Object.fromEntries(
    (Object.keys(tokens.dark) as TokenName[]).map((name) => [name, `var(${cssName(name)})`]),
) as Record<TokenName, string>

function cssVariables(scheme: keyof typeof tokens): Record<string, string> {
    return Object.fromEntries(Object.entries(tokens[scheme]).map(([name, value]) => [cssName(name), value]))
}

export const fontFamily = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
export const monoFamily = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

export const layout = { sidebar: 248, contentMax: 1360, topBar: 60 } as const

/** localStorage key holding the user preference (`light` | `dark`). */
export const MODE_STORAGE_KEY = "kexamanager:theme"

/** Mode used when nothing is stored yet. */
export const DEFAULT_MODE = "dark" as const

const components: ThemeOptions["components"] = {
    MuiCssBaseline: {
        styleOverrides: {
            ":root, :root.dark": cssVariables("dark"),
            ":root.light": cssVariables("light"),
            body: {
                backgroundColor: k.bg,
                color: k.text,
                fontSize: 14,
                lineHeight: 1.45,
                scrollbarColor: `${k.borderStrong} transparent`,
            },
            a: { color: k.link },
            "a:hover": { color: k.linkHover },
            "*:focus-visible": { outline: `2px solid ${k.accent}`, outlineOffset: 2 },
            "::selection": { background: k.accentSoft },
        },
    },
    MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
            root: { backgroundImage: "none", backgroundColor: k.card, color: k.text },
        },
    },
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
        defaultProps: { disableElevation: true, variant: "outlined", color: "inherit" },
        styleOverrides: {
            root: {
                minHeight: 40,
                padding: "0 14px",
                borderRadius: 8,
                gap: 8,
                fontWeight: 500,
                fontSize: 14,
                textTransform: "none",
                whiteSpace: "nowrap",
                "& .MuiButton-startIcon, & .MuiButton-endIcon": { margin: 0 },
                "& svg": { width: 16, height: 16 },
            },
            sizeSmall: { minHeight: 32, padding: "0 10px", fontSize: 13 },
            outlined: {
                borderColor: k.borderStrong,
                backgroundColor: k.raised,
                color: k.text,
                "&:hover": { backgroundColor: k.raisedHover, borderColor: k.borderStrong },
                "&.Mui-disabled": { color: k.faint, borderColor: k.border },
                "&.MuiButton-colorError": {
                    color: k.err,
                    borderColor: k.dangerBorder,
                    backgroundColor: k.dangerBg,
                    "&:hover": { backgroundColor: k.errBg, borderColor: k.dangerBorder },
                },
            },
            contained: {
                backgroundColor: k.accent,
                color: k.onAccent,
                border: `1px solid ${k.accent}`,
                "&:hover": { backgroundColor: k.accentHover, borderColor: k.accentHover },
                "&.Mui-disabled": { backgroundColor: k.active, color: k.faint, borderColor: k.border },
                "&.MuiButton-colorError:not(.Mui-disabled)": {
                    backgroundColor: k.errBar,
                    borderColor: k.errBar,
                    color: "#fff",
                    "&:hover": { backgroundColor: k.err, borderColor: k.err },
                },
            },
            text: {
                color: k.text2,
                "&:hover": { backgroundColor: k.hover, color: k.text },
            },
        },
    },
    MuiIconButton: {
        styleOverrides: {
            root: {
                borderRadius: 8,
                color: k.text2,
                "&:hover": { backgroundColor: k.hover, color: k.text },
                "& svg": { width: 17, height: 17 },
            },
        },
    },
    MuiOutlinedInput: {
        styleOverrides: {
            root: {
                minHeight: 40,
                borderRadius: 8,
                backgroundColor: k.input,
                color: k.text,
                fontSize: 14,
                "& .MuiOutlinedInput-notchedOutline": { borderColor: k.borderStrong },
                "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: k.borderHover },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: k.accent, borderWidth: 1 },
                "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: k.err },
            },
            input: { padding: "9px 12px", "&::placeholder": { color: k.label, opacity: 1 } },
            multiline: { padding: 0 },
        },
    },
    MuiTextField: { defaultProps: { size: "small", variant: "outlined" } },
    MuiSelect: { defaultProps: { size: "small" } },
    MuiInputLabel: { styleOverrides: { root: { color: k.label } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 0, color: k.label, fontSize: 12.5 } } },
    MuiMenu: {
        styleOverrides: {
            paper: { border: `1px solid ${k.borderStrong}`, boxShadow: k.shadow, borderRadius: 10 },
        },
    },
    MuiMenuItem: {
        styleOverrides: {
            root: { fontSize: 14, minHeight: 38, "&:hover": { backgroundColor: k.hover }, "&.Mui-selected": { backgroundColor: k.active } },
        },
    },
    MuiPopover: { styleOverrides: { paper: { border: `1px solid ${k.borderStrong}`, boxShadow: k.shadow, borderRadius: 10 } } },
    MuiDialog: {
        styleOverrides: {
            paper: { borderRadius: 14, border: `1px solid ${k.borderStrong}`, boxShadow: k.shadow, backgroundColor: k.card },
        },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 17, fontWeight: 600, padding: "20px 24px 8px" } } },
    MuiDialogContent: { styleOverrides: { root: { padding: "8px 24px 16px" } } },
    MuiDialogActions: { styleOverrides: { root: { padding: "12px 24px 20px", gap: 8 } } },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: "rgba(5, 6, 8, 0.6)" } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: k.side, borderColor: k.border } } },
    MuiTooltip: {
        defaultProps: { arrow: true, enterDelay: 300 },
        styleOverrides: { tooltip: { fontSize: 12.5, backgroundColor: "#2A2F36", color: "#E8EAED" }, arrow: { color: "#2A2F36" } },
    },
    MuiCheckbox: {
        defaultProps: { size: "small" },
        styleOverrides: { root: { color: k.borderHover, "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: k.accent } } },
    },
    MuiRadio: {
        defaultProps: { size: "small" },
        styleOverrides: { root: { color: k.borderHover, "&.Mui-checked": { color: k.accent } } },
    },
    MuiSwitch: {
        styleOverrides: {
            switchBase: { "&.Mui-checked": { color: "#fff" }, "&.Mui-checked + .MuiSwitch-track": { backgroundColor: k.accent, opacity: 1 } },
            track: { backgroundColor: k.borderHover, opacity: 1 },
        },
    },
    MuiLinearProgress: {
        styleOverrides: { root: { backgroundColor: k.border, borderRadius: 3 }, bar: { backgroundColor: k.accent, borderRadius: 3 } },
    },
    MuiCircularProgress: { defaultProps: { color: "inherit" } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: k.active } } },
    MuiAlert: {
        styleOverrides: {
            root: { borderRadius: 10, fontSize: 13.5, alignItems: "center" },
            standard: {
                "&.MuiAlert-colorInfo": { backgroundColor: k.infoBg, color: k.info, "& .MuiAlert-icon": { color: k.info } },
                "&.MuiAlert-colorSuccess": { backgroundColor: k.okBg, color: k.ok, "& .MuiAlert-icon": { color: k.ok } },
                "&.MuiAlert-colorWarning": { backgroundColor: k.warnBg, color: k.warn, "& .MuiAlert-icon": { color: k.warn } },
                "&.MuiAlert-colorError": { backgroundColor: k.errBg, color: k.err, "& .MuiAlert-icon": { color: k.err } },
            },
        },
    },
    MuiTableCell: {
        styleOverrides: {
            root: { borderBottom: `1px solid ${k.rowBorder}`, padding: "10px 16px", fontSize: 14, color: k.text },
            head: { fontSize: 12, fontWeight: 500, color: k.label, borderBottom: `1px solid ${k.border}`, whiteSpace: "nowrap" },
        },
    },
    MuiTableRow: {
        styleOverrides: {
            root: {
                "&:last-child td": { borderBottom: 0 },
                "&.MuiTableRow-hover:hover td": { backgroundColor: k.rowHover },
                "&.Mui-selected td, &.Mui-selected:hover td": { backgroundColor: k.rowSelected },
                "&.Mui-selected": { backgroundColor: "transparent" },
            },
        },
    },
    MuiTab: {
        styleOverrides: {
            root: {
                textTransform: "none",
                minHeight: 46,
                padding: "0 14px",
                fontSize: 14,
                color: k.text2,
                "&:hover": { color: k.text },
                "&.Mui-selected": { color: k.text },
            },
        },
    },
    MuiTabs: {
        styleOverrides: { root: { minHeight: 46 }, indicator: { backgroundColor: k.accent, height: 2 } },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: k.border } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 7 } } },
}

const mui = (scheme: keyof typeof tokens) => {
    const t = tokens[scheme]
    return {
        palette: {
            mode: scheme,
            background: { default: t.bg, paper: t.card },
            primary: { main: t.accent, light: t.accentHover, dark: "#E0650C", contrastText: t.onAccent },
            secondary: { main: t.text2 },
            success: { main: t.ok },
            warning: { main: t.warn },
            error: { main: t.err },
            info: { main: t.info },
            text: { primary: t.text, secondary: t.text2, disabled: t.faint },
            divider: t.border,
            action: { hover: t.hover, selected: t.active },
        },
    }
}

export const theme = createTheme({
    cssVariables: { cssVarPrefix: "kexa", colorSchemeSelector: "class" },
    colorSchemes: { dark: mui("dark"), light: mui("light") },
    components,
    shape: { borderRadius: 8 },
    typography: {
        fontFamily,
        fontSize: 14,
        h1: { fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" },
        h2: { fontSize: 16, fontWeight: 600 },
        h3: { fontSize: 15, fontWeight: 600 },
        body1: { fontSize: 14 },
        body2: { fontSize: 13 },
        caption: { fontSize: 12.5 },
        button: { textTransform: "none" },
    },
})
