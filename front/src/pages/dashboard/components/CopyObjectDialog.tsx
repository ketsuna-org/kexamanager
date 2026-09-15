import { useState, type SubmitEvent } from "react"
import { useTranslation } from "react-i18next"
import Alert from "@mui/material/Alert"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Stack from "@mui/material/Stack"

const SUBMIT_BUTTON_SX = { minWidth: 96 } as const

interface CopyObjectDialogProps {
  open: boolean
  onClose: () => void
  sourceKey: string
  destKey: string
  onDestKeyChange: (value: string) => void
  /** Callback de copie ; l'attente eventuelle pilote l'etat `busy` du dialogue. */
  onCopy: () => void | Promise<void>
  /** Erreur de copie remontee par l'appelant, affichee dans le dialogue. */
  error?: string | null
}

export default function CopyObjectDialog({
  open,
  onClose,
  sourceKey,
  destKey,
  onDestKeyChange,
  onCopy,
  error,
}: CopyObjectDialogProps) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)

  const destination = destKey.trim()
  const canSubmit = destination.length > 0 && !submitting

  async function submitCopy() {
    if (destination.length === 0) return
    setSubmitting(true)
    try {
      await onCopy()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          component: "form",
          onSubmit: (event: SubmitEvent<HTMLDivElement>) => {
            event.preventDefault()
            void submitCopy()
          },
        },
      }}
    >
      <DialogTitle>{t("s3browser.copy_object")}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label={t("s3browser.source_key")} value={sourceKey} disabled fullWidth />
          <TextField
            autoFocus
            label={t("s3browser.dest_key")}
            value={destKey}
            onChange={(e) => onDestKeyChange(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="contained" disabled={!canSubmit} sx={SUBMIT_BUTTON_SX}>
          {t("common.copy")}
        </Button>
      </DialogActions>
    </Dialog>
  )
}