import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, CircularProgress } from "@mui/material"
import { useTranslation } from "react-i18next"

interface ConfirmDialogProps {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    confirmColor?: "primary" | "secondary" | "error" | "info" | "success" | "warning"
    loading?: boolean
    onConfirm: () => void
    onClose: () => void
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    cancelLabel,
    confirmColor = "primary",
    loading = false,
    onConfirm,
    onClose
}: ConfirmDialogProps) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {message}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit" disabled={loading}>
                    {cancelLabel || t("common.cancel", "Cancel")}
                </Button>
                <Button onClick={onConfirm} variant="contained" color={confirmColor} disabled={loading} autoFocus>
                    {loading ? <CircularProgress size={24} color="inherit" /> : (confirmLabel || t("common.confirm", "Confirm"))}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
