import { useTranslation } from "react-i18next"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"

interface PreviewDialogProps {
  open: boolean
  onClose: () => void
  key: string
  url?: string
  mime?: string
}

export default function PreviewDialog({
  open,
  onClose,
  key,
  url,
  mime,
}: PreviewDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{key}</DialogTitle>
      <DialogContent>
        {url ? (
          mime?.startsWith("image/") ? (
            <img src={url} alt={key} style={{ maxWidth: "100%" }} />
          ) : mime?.startsWith("video/") ? (
            <video controls style={{ maxWidth: "100%" }}>
              <source src={url} type={mime} />
              Your browser does not support the video tag.
            </video>
          ) : mime?.startsWith("text/") ? (
            <iframe src={url} title="preview" style={{ width: "100%", height: 400, border: 0 }} />
          ) : (
            <Typography variant="body2">{t("s3browser.preview_unavailable", { defaultValue: "Aucun aperçu disponible pour ce type. Téléchargez le fichier pour l'ouvrir." })}</Typography>
          )
        ) : (
          <CircularProgress size={20} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { if (url) window.open(url, "_blank") }}>{t("common.download", { defaultValue: "Download" })}</Button>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  )
}
