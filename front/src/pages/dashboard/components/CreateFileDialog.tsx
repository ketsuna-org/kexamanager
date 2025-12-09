import { useState, useEffect } from "react"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Box from "@mui/material/Box"
import { useTranslation } from "react-i18next"

interface CreateFileDialogProps {
    open: boolean
    onClose: () => void
    onCreate: (fileName: string, content: string) => Promise<void>
    currentPrefix: string
}

export default function CreateFileDialog({ open, onClose, onCreate, currentPrefix }: CreateFileDialogProps) {
    const { t } = useTranslation()
    const [fileName, setFileName] = useState("")
    const [content, setContent] = useState("")
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setFileName("")
            setContent("")
            setError(null)
        }
    }, [open])

    async function handleCreate() {
        if (!fileName.trim()) return
        setCreating(true)
        setError(null)
        try {
            await onCreate(fileName.trim(), content)
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setCreating(false)
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{t("s3browser.create_file_title", "Create New File")}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                    <TextField
                        label={t("s3browser.filename", "Filename")}
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        fullWidth
                        required
                        autoFocus
                        helperText={t("s3browser.filename_helper", `File will be created in: ${currentPrefix || "root"}`)}
                    />
                    <TextField
                        label={t("s3browser.content", "Content")}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        multiline
                        rows={10}
                        fullWidth
                        placeholder="Enter file content here..."
                    />
                    {error && (
                        <Box color="error.main" fontSize="small">
                            {error}
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={creating}>
                    {t("common.cancel", "Cancel")}
                </Button>
                <Button onClick={handleCreate} disabled={!fileName.trim() || creating} variant="contained">
                    {creating ? t("common.creating", "Creating...") : t("common.create", "Create")}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
