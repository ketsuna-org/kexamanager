import { useTranslation } from "react-i18next"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"

interface CreateBucketDialogProps {
  open: boolean
  onClose: () => void
  newBucket: string
  onNewBucketChange: (value: string) => void
  onCreate: () => void
}

export default function CreateBucketDialog({
  open,
  onClose,
  newBucket,
  onNewBucketChange,
  onCreate,
}: CreateBucketDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("buckets.actions_add", { defaultValue: "Create bucket" })}</DialogTitle>
      <DialogContent>
        <TextField autoFocus margin="dense" fullWidth label={t("buckets.form.globalAlias", { defaultValue: "Bucket name" })} value={newBucket} onChange={(e) => onNewBucketChange(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={onCreate} disabled={!newBucket}>
          {t("common.create", { defaultValue: "Create" })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
