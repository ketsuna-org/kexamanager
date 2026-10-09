// Building blocks of the console design: cards, pills, bars, fields, copy
// fields, side panels. Pages compose these instead of styling MUI by hand, so
// the whole console keeps one look.
import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import Box, { type BoxProps } from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import Drawer from "@mui/material/Drawer"
import IconButton from "@mui/material/IconButton"
import OutlinedInput, { type OutlinedInputProps } from "@mui/material/OutlinedInput"
import Switch from "@mui/material/Switch"
import Tooltip from "@mui/material/Tooltip"
import useMediaQuery from "@mui/material/useMediaQuery"
import type { SxProps, Theme } from "@mui/material/styles"
import { AlertTriangle, Check, Copy, Eye, EyeOff, Inbox, RefreshCw, X } from "lucide-react"
import { k, monoFamily } from "../theme"
import { useCopy } from "./useCopy"

type Sx = SxProps<Theme>

export function Card({ children, sx, ...rest }: BoxProps) {
    return (
        <Box sx={[{ bgcolor: k.card, border: `1px solid ${k.border}`, borderRadius: "12px", minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]} {...rest}>
            {children}
        </Box>
    )
}

export type Tone = "neutral" | "ok" | "warn" | "err" | "info" | "accent"

const toneColors: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: k.active, fg: k.tagText },
    ok: { bg: k.okBg, fg: k.ok },
    warn: { bg: k.warnBg, fg: k.warn },
    err: { bg: k.errBg, fg: k.err },
    info: { bg: k.infoBg, fg: k.info },
    accent: { bg: k.accentSoft, fg: k.accentText },
}

export function Pill({ tone = "neutral", dot, children, sx }: { tone?: Tone; dot?: boolean; children: ReactNode; sx?: Sx }) {
    const c = toneColors[tone]
    return (
        <Box
            component="span"
            sx={[
                {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    height: 22,
                    px: "8px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    bgcolor: c.bg,
                    color: c.fg,
                    whiteSpace: "nowrap",
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {dot && <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "currentColor" }} />}
            {children}
        </Box>
    )
}

/** Monospace label with a border, for endpoint names, actions and scopes. */
export function Tag({ children, sx }: { children: ReactNode; sx?: Sx }) {
    return (
        <Box
            component="span"
            sx={[
                {
                    display: "inline-flex",
                    alignItems: "center",
                    height: 22,
                    px: "7px",
                    borderRadius: "5px",
                    bgcolor: k.tagBg,
                    border: `1px solid ${k.tagBorder}`,
                    fontFamily: monoFamily,
                    fontSize: 11.5,
                    color: k.tagText,
                    whiteSpace: "nowrap",
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {children}
        </Box>
    )
}

export function Mono({ children, sx, title }: { children: ReactNode; sx?: Sx; title?: string }) {
    return (
        <Box component="span" title={title} sx={[{ fontFamily: monoFamily, fontSize: 12.5 }, ...(Array.isArray(sx) ? sx : [sx])]}>
            {children}
        </Box>
    )
}

export function Muted({ children, sx, small }: { children: ReactNode; sx?: Sx; small?: boolean }) {
    return (
        <Box component="span" sx={[{ color: k.text2, fontSize: small ? 12.5 : undefined }, ...(Array.isArray(sx) ? sx : [sx])]}>
            {children}
        </Box>
    )
}

/** Usage bar; turns amber above 80 % and red above 95 % unless a tone is forced. */
export function Bar({ value, height = 6, tone, label }: { value: number; height?: number; tone?: "accent" | "warn" | "err" | "ok"; label?: string }) {
    const clamped = Math.max(0, Math.min(100, value))
    const auto = clamped >= 95 ? "err" : clamped >= 80 ? "warn" : "accent"
    const color = { accent: k.accent, warn: k.warnBar, err: k.errBar, ok: k.ok }[tone ?? auto]
    return (
        <Box
            role="progressbar"
            aria-valuenow={Math.round(clamped)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
            sx={{ height, borderRadius: height / 2, bgcolor: k.border, overflow: "hidden", minWidth: 40 }}
        >
            <Box sx={{ width: `${clamped}%`, height: "100%", bgcolor: color, borderRadius: height / 2 }} />
        </Box>
    )
}

/** Card with a header (title, description, actions): the settings sections. */
export function Section({
    id,
    title,
    description,
    actions,
    children,
    danger,
    sx,
}: {
    id?: string
    title: ReactNode
    description?: ReactNode
    actions?: ReactNode
    children?: ReactNode
    danger?: boolean
    sx?: Sx
}) {
    return (
        <Card
            id={id}
            component="section"
            sx={[
                { display: "flex", flexDirection: "column", gap: 2, p: "22px", scrollMarginTop: 16 },
                danger ? { borderColor: k.dangerBorder } : {},
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
                <Box sx={{ minWidth: 0 }}>
                    <Box component="h2" sx={{ m: 0, fontSize: 16, fontWeight: 600, color: danger ? k.err : k.text }}>
                        {title}
                    </Box>
                    {description && <Box sx={{ mt: 0.5, color: k.text2, fontSize: 13 }}>{description}</Box>}
                </Box>
                {actions && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{actions}</Box>}
            </Box>
            {children}
        </Card>
    )
}

/** Card header used by list cards (title on the left, link or action on the right). */
export function CardHeader({ title, extra, sx }: { title: ReactNode; extra?: ReactNode; sx?: Sx }) {
    return (
        <Box sx={[{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, px: "20px", py: "16px", flexWrap: "wrap" }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <Box component="h2" sx={{ m: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
                {title}
            </Box>
            {extra}
        </Box>
    )
}

/** Label/value row of a detail panel. */
export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, py: 1, borderBottom: `1px solid ${k.rowBorder}`, minWidth: 0 }}>
            <Box component="span" sx={{ fontSize: 12, color: k.label, flex: "none" }}>
                {label}
            </Box>
            <Box component="span" sx={{ minWidth: 0, textAlign: "right", overflowWrap: "anywhere" }}>
                {children}
            </Box>
        </Box>
    )
}

export function Field({
    label,
    help,
    error,
    children,
    optional,
    htmlFor,
    sx,
}: {
    label: ReactNode
    help?: ReactNode
    error?: ReactNode
    children: ReactNode
    optional?: boolean
    htmlFor?: string
    sx?: Sx
}) {
    const { t } = useTranslation()
    return (
        <Box sx={[{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <Box component="label" htmlFor={htmlFor} sx={{ fontSize: 13, fontWeight: 500, color: k.text }}>
                {label}
                {optional && (
                    <Box component="span" sx={{ color: k.label, fontWeight: 400 }}>
                        {" "}
                        · {t("ui.optional")}
                    </Box>
                )}
            </Box>
            {children}
            {error ? (
                <Box sx={{ fontSize: 12.5, color: k.err }}>{error}</Box>
            ) : (
                help && <Box sx={{ fontSize: 12.5, color: k.label }}>{help}</Box>
            )}
        </Box>
    )
}

export function TextInput({ mono, sx, ...props }: OutlinedInputProps & { mono?: boolean }) {
    return (
        <OutlinedInput
            fullWidth
            size="small"
            {...props}
            sx={[mono ? { fontFamily: monoFamily, fontSize: 13 } : {}, ...(Array.isArray(sx) ? sx : [sx])]}
        />
    )
}

/** Labelled text field: the common case of `Field` + `TextInput`. */
export function TextField({
    label,
    help,
    error,
    optional,
    fieldSx,
    ...input
}: Omit<OutlinedInputProps, "error"> & { label: ReactNode; help?: ReactNode; error?: ReactNode; optional?: boolean; mono?: boolean; fieldSx?: Sx }) {
    const generated = useId()
    const id = input.id ?? generated
    return (
        <Field label={label} help={help} error={error} optional={optional} htmlFor={id} sx={fieldSx}>
            <TextInput {...input} id={id} error={Boolean(error)} />
        </Field>
    )
}

export function CopyButton({ value, label, what, size = "small" }: { value: string; label?: string; what?: string; size?: "small" | "medium" }) {
    const copy = useCopy()
    const { t } = useTranslation()
    const [done, setDone] = useState(false)
    const onClick = async () => {
        await copy(value, what)
        setDone(true)
        window.setTimeout(() => setDone(false), 1500)
    }
    if (label) {
        return (
            <Button size={size} onClick={onClick} startIcon={done ? <Check /> : <Copy />}>
                {label}
            </Button>
        )
    }
    return (
        <Tooltip title={t("ui.copy")}>
            <IconButton size="small" onClick={onClick} aria-label={t("ui.copy")}>
                {done ? <Check /> : <Copy />}
            </IconButton>
        </Tooltip>
    )
}

/** Read-only value with a copy button (and a reveal toggle for secrets). */
export function CopyField({ value, secret, what, sx }: { value: string; secret?: boolean; what?: string; sx?: Sx }) {
    const { t } = useTranslation()
    const copy = useCopy()
    const [shown, setShown] = useState(!secret)
    return (
        <Box
            sx={[
                {
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minHeight: 44,
                    pl: "12px",
                    pr: "4px",
                    border: `1px solid ${k.borderStrong}`,
                    borderRadius: "8px",
                    bgcolor: k.input,
                    minWidth: 0,
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            <Mono sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", py: 1 }}>{shown ? value : "•".repeat(24)}</Mono>
            {secret && (
                <Tooltip title={shown ? t("ui.hide") : t("ui.show")}>
                    <IconButton size="small" onClick={() => setShown((v) => !v)} aria-label={shown ? t("ui.hide") : t("ui.show")}>
                        {shown ? <EyeOff /> : <Eye />}
                    </IconButton>
                </Tooltip>
            )}
            <Button size="small" onClick={() => copy(value, what)} startIcon={<Copy />} sx={{ bgcolor: k.active, border: 0 }}>
                {t("ui.copy")}
            </Button>
        </Box>
    )
}

export function Toggle({
    checked,
    onChange,
    label,
    description,
    disabled,
}: {
    checked: boolean
    onChange: (value: boolean) => void
    label: ReactNode
    description?: ReactNode
    disabled?: boolean
}) {
    const id = useId()
    return (
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <Switch id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} sx={{ mt: -0.75, ml: -1 }} />
            <Box component="label" htmlFor={id} sx={{ cursor: disabled ? "default" : "pointer" }}>
                <Box sx={{ fontWeight: 500 }}>{label}</Box>
                {description && <Box sx={{ fontSize: 12.5, color: k.label }}>{description}</Box>}
            </Box>
        </Box>
    )
}

export interface SegmentOption<T extends string> {
    value: T
    label: ReactNode
}

/** Segmented control (`.seg`): a small set of exclusive choices. */
export function Segmented<T extends string>({
    options,
    value,
    onChange,
    label,
}: {
    options: SegmentOption<T>[]
    value: T
    onChange: (value: T) => void
    label?: string
}) {
    return (
        <Box role="group" aria-label={label} sx={{ display: "inline-flex", border: `1px solid ${k.borderStrong}`, borderRadius: "8px", overflow: "hidden", flexWrap: "wrap" }}>
            {options.map((option) => (
                <Box
                    key={option.value}
                    component="button"
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    sx={{
                        bgcolor: value === option.value ? k.active : "transparent",
                        color: value === option.value ? k.text : k.nav,
                        border: 0,
                        font: "inherit",
                        minHeight: 38,
                        px: "12px",
                        cursor: "pointer",
                        "&:hover": { color: k.text },
                    }}
                >
                    {option.label}
                </Box>
            ))}
        </Box>
    )
}

const avatarPalette = [
    { bg: k.accentSoft, fg: k.accentText },
    { bg: k.infoBg, fg: k.info },
    { bg: k.okBg, fg: k.ok },
    { bg: k.warnBg, fg: k.warn },
]

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
    const index = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % avatarPalette.length
    const colors = name === "root" ? avatarPalette[0] : avatarPalette[index]
    return (
        <Box
            aria-hidden
            sx={{
                width: size,
                height: size,
                borderRadius: "50%",
                bgcolor: colors.bg,
                color: colors.fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: size * 0.4,
                flex: "none",
                textTransform: "uppercase",
            }}
        >
            {name.charAt(0) || "?"}
        </Box>
    )
}

export function EmptyBlock({ icon, title, description, action, sx }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; sx?: Sx }) {
    return (
        <Box sx={[{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1, py: 6, px: 3 }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <Box sx={{ color: k.faint, "& svg": { width: 28, height: 28 } }}>{icon ?? <Inbox />}</Box>
            <Box sx={{ fontWeight: 600, fontSize: 15 }}>{title}</Box>
            {description && <Box sx={{ color: k.text2, maxWidth: 480 }}>{description}</Box>}
            {action && <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>{action}</Box>}
        </Box>
    )
}

export function ErrorBlock({ message, onRetry, title, sx }: { message: ReactNode; onRetry?: () => void; title?: ReactNode; sx?: Sx }) {
    const { t } = useTranslation()
    return (
        <Box
            role="alert"
            sx={[
                { display: "flex", alignItems: "flex-start", gap: 1.5, p: 2, borderRadius: "10px", bgcolor: k.errBg, color: k.err, flexWrap: "wrap" },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            <AlertTriangle size={18} style={{ flex: "none", marginTop: 2 }} />
            <Box sx={{ flex: "1 1 240px", minWidth: 0, overflowWrap: "anywhere" }}>
                <Box sx={{ fontWeight: 600 }}>{title ?? t("ui.loadError")}</Box>
                <Box sx={{ fontSize: 13 }}>{message}</Box>
            </Box>
            {onRetry && (
                <Button size="small" onClick={onRetry} startIcon={<RefreshCw />}>
                    {t("ui.retry")}
                </Button>
            )}
        </Box>
    )
}

export function Spinner({ label, sx }: { label?: ReactNode; sx?: Sx }) {
    return (
        <Box sx={[{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, py: 6, color: k.text2 }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <CircularProgress size={18} />
            {label}
        </Box>
    )
}

/**
 * Detail panel docked on the right of a list on large screens, and a drawer
 * on smaller ones. `open` drives the drawer; on large screens the caller
 * renders the panel only when something is selected.
 */
export function SidePanel({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    width = 380,
}: {
    open: boolean
    onClose: () => void
    title: ReactNode
    subtitle?: ReactNode
    children: ReactNode
    footer?: ReactNode
    width?: number
}) {
    const { t } = useTranslation()
    const docked = useMediaQuery("(min-width:1200px)")
    const body = (
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: docked ? "auto" : "100%" }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, p: "18px 20px 12px" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box component="h2" sx={{ m: 0, fontSize: 16, fontWeight: 600, overflowWrap: "anywhere" }}>
                        {title}
                    </Box>
                    {subtitle && <Box sx={{ color: k.text2, fontSize: 13, mt: 0.5 }}>{subtitle}</Box>}
                </Box>
                <IconButton onClick={onClose} aria-label={t("ui.close")} size="small">
                    <X />
                </IconButton>
            </Box>
            <Box sx={{ px: "20px", pb: 2, flex: 1, overflowY: docked ? "visible" : "auto", display: "flex", flexDirection: "column", gap: 2 }}>{children}</Box>
            {footer && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", p: "14px 20px", borderTop: `1px solid ${k.border}` }}>{footer}</Box>}
        </Box>
    )
    if (docked) {
        if (!open) return null
        return (
            <Card component="aside" sx={{ width, flex: "none", alignSelf: "flex-start", position: "sticky", top: 16 }}>
                {body}
            </Card>
        )
    }
    return (
        <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: `min(${width + 40}px, 100vw)`, bgcolor: k.card } } }}>
            {body}
        </Drawer>
    )
}

/** Main column next to an optional `SidePanel`. */
export function WithPanel({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
    return (
        <Box sx={{ display: "flex", gap: 2.5, alignItems: "flex-start" }}>
            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 }}>{children}</Box>
            {panel}
        </Box>
    )
}

/** Horizontal scroll wrapper for tables on narrow screens. */
export function TableWrap({ children, minWidth = 620 }: { children: ReactNode; minWidth?: number }) {
    return <Box sx={{ overflowX: "auto", "& table": { minWidth } }}>{children}</Box>
}

/** Pill with the colored dot used for node/cluster states. */
export function StatusDot({ tone, children }: { tone: Tone; children: ReactNode }) {
    return (
        <Pill tone={tone} dot>
            {children}
        </Pill>
    )
}
