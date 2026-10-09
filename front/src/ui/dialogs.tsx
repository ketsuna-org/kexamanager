import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import { k } from "../theme"
import { TextField } from "./kit"

/**
 * Dialog wrapping a form: Enter submits, the primary button shows a spinner
 * while `busy`, and the dialog cannot be dismissed mid-request.
 */
export function FormDialog({
    open,
    onClose,
    title,
    description,
    children,
    submitLabel,
    onSubmit,
    busy,
    canSubmit = true,
    danger,
    width = "sm",
    secondary,
}: {
    open: boolean
    onClose: () => void
    title: ReactNode
    description?: ReactNode
    children?: ReactNode
    submitLabel: ReactNode
    onSubmit: () => void | Promise<void>
    busy?: boolean
    canSubmit?: boolean
    danger?: boolean
    width?: "xs" | "sm" | "md"
    secondary?: ReactNode
}) {
    const { t } = useTranslation()
    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (!busy && canSubmit) void onSubmit()
    }
    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth={width} fullWidth>
            <Box component="form" onSubmit={submit} noValidate>
                <DialogTitle>{title}</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {description && <Box sx={{ color: k.text2 }}>{description}</Box>}
                    {children}
                </DialogContent>
                <DialogActions>
                    {secondary && <Box sx={{ mr: "auto" }}>{secondary}</Box>}
                    <Button onClick={onClose} disabled={busy}>
                        {t("ui.cancel")}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        color={danger ? "error" : "primary"}
                        disabled={busy || !canSubmit}
                        startIcon={busy ? <CircularProgress size={14} /> : undefined}
                    >
                        {submitLabel}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    )
}

/**
 * Confirmation of a destructive action. With `confirmText`, the user has to
 * type it (bucket name, key name…) before the button unlocks.
 */
export function ConfirmDialog({
    open,
    onClose,
    title,
    message,
    confirmLabel,
    onConfirm,
    busy,
    confirmText,
    danger = true,
}: {
    open: boolean
    onClose: () => void
    title: ReactNode
    message?: ReactNode
    confirmLabel: ReactNode
    onConfirm: () => void | Promise<void>
    busy?: boolean
    confirmText?: string
    danger?: boolean
}) {
    const { t } = useTranslation()
    const [typed, setTyped] = useState("")
    useEffect(() => {
        if (open) setTyped("")
    }, [open])
    return (
        <FormDialog
            open={open}
            onClose={onClose}
            title={title}
            description={message}
            submitLabel={confirmLabel}
            onSubmit={onConfirm}
            busy={busy}
            danger={danger}
            canSubmit={!confirmText || typed === confirmText}
            width="xs"
        >
            {confirmText && (
                <TextField
                    label={t("ui.typeToConfirm", { value: confirmText })}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                    mono
                    autoComplete="off"
                />
            )}
        </FormDialog>
    )
}
