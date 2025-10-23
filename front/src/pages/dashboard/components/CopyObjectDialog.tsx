import { useTranslation } from "react-i18next"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Stack from "@mui/material/Stack"

interface CopyObjectDialogProps {
  open: boolean
  onClose: () => void
  sourceKey: string
  destKey: string
  onDestKeyChange: (value: string) => void
  onCopy: () => void
}

export default function CopyObjectDialog({
  open,
  onClose,
  sourceKey,
  destKey,
  onDestKeyChange,
  onCopy,
}: CopyObjectDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("s3browser.copy_object", { defaultValue: "Copy object" })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label={t("s3browser.source_key", { defaultValue: "Source key" })} value={sourceKey} disabled fullWidth />
          <TextField label={t("s3browser.dest_key", { defaultValue: "Destination key" })} value={destKey} onChange={(e) => onDestKeyChange(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={onCopy} disabled={!destKey}>
          {t("common.copy")}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
