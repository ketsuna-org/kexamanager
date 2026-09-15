import { useState, type SubmitEvent } from "react"
import { useTranslation } from "react-i18next"
import Alert from "@mui/material/Alert"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"

/** Regle S3 : 3 a 63 caracteres, minuscules/chiffres/points/tirets, bornes alphanumeriques. */
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

const SUBMIT_BUTTON_SX = { minWidth: 96 } as const

interface CreateBucketDialogProps {
  open: boolean
  onClose: () => void
  newBucket: string
  onNewBucketChange: (value: string) => void
  /** Callback de creation ; l'attente eventuelle pilote l'etat `busy` du dialogue. */
  onCreate: () => void | Promise<void>
  /** Erreur de creation remontee par l'appelant, affichee dans le dialogue. */
  error?: string | null
}

export default function CreateBucketDialog({
  open,
  onClose,
  newBucket,
  onNewBucketChange,
  onCreate,
  error,
}: CreateBucketDialogProps) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)

  const name = newBucket.trim()
  const nameInvalid = name.length > 0 && !BUCKET_NAME_PATTERN.test(name)
  const canSubmit = name.length > 0 && !nameInvalid && !submitting

  async function submitBucket() {
    if (name.length === 0 || nameInvalid) return
    setSubmitting(true)
    try {
      await onCreate()
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
            void submitBucket()
          },
        },
      }}
    >
      <DialogTitle>{t("buckets.actions_add")}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          label={t("buckets.form.globalAlias")}
          value={newBucket}
          onChange={(e) => onNewBucketChange(e.target.value)}
          error={nameInvalid}
          helperText={nameInvalid ? t("buckets.form.name_invalid") : undefined}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="contained" disabled={!canSubmit} sx={SUBMIT_BUTTON_SX}>
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  )
}