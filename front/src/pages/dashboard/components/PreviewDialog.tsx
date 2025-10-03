import { useTranslation } from "react-i18next"
import { useState, useEffect } from "react"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import CircularProgress from "@mui/material/CircularProgress"
import EditIcon from "@mui/icons-material/Edit"
import SaveIcon from "@mui/icons-material/Save"
import CancelIcon from "@mui/icons-material/Cancel"
import Editor, { loader } from "@monaco-editor/react"

// Configure Monaco Editor
loader.init().then(monaco => {
  // Ensure Go language is available
  if (!monaco.languages.getLanguages().find(lang => lang.id === 'go')) {
    monaco.languages.register({ id: 'go' })
  }
})

interface PreviewDialogProps {
  open: boolean
  onClose: () => void
  key: string
  url?: string
  mime?: string
  onSave?: (key: string, content: string) => Promise<void>
}

export default function PreviewDialog({
  open,
  onClose,
  key,
  url,
  mime,
  onSave,
}: PreviewDialogProps) {
  const { t } = useTranslation()
  const [editMode, setEditMode] = useState(false)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch text content when opening text files
  useEffect(() => {
    if (open && url && mime?.startsWith("text/")) {
      console.log('Fetching content for:', key, 'from:', url)
      console.log('MIME type:', mime)
      setLoading(true)
      setContent("") // Clear content while loading
      fetch(url, {
        method: 'GET',
        mode: 'cors', // Try with CORS mode
      })
        .then(response => {
          console.log('Fetch response status:', response.status)
          console.log('Fetch response headers:', Object.fromEntries(response.headers.entries()))
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          return response.text()
        })
        .then(text => {
          console.log('Fetched content length:', text.length)
          console.log('First 200 chars:', text.substring(0, 200))
          setContent(text)
          setLoading(false)
        })
        .catch(error => {
          console.error('Error fetching content:', error)
          setContent(`Error loading file content: ${error.message}`)
          setLoading(false)
        })
    } else if (!open) {
      // Clear content when dialog closes
      setContent("")
      setEditMode(false)
    }
  }, [open, url, mime, key])

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(key, content)
      setEditMode(false)
    } catch (error) {
      console.error("Failed to save file:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditMode(false)
    // Re-fetch content to discard changes
    if (url && mime?.startsWith("text/")) {
      setLoading(true)
      fetch(url)
        .then(response => response.text())
        .then(text => {
          setContent(text)
          setLoading(false)
        })
        .catch(() => {
          setContent("Error loading file content")
          setLoading(false)
        })
    }
  }

  const handleEditToggle = () => {
    const newEditMode = !editMode
    setEditMode(newEditMode)

    // If entering edit mode and content is empty, try fetching again
    if (newEditMode && !content && url && mime?.startsWith("text/")) {
      console.log('Content is empty in edit mode, refetching...')
      setLoading(true)
      fetch(url, {
        method: 'GET',
        mode: 'cors',
      })
        .then(response => {
          console.log('Refetch response status:', response.status)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          return response.text()
        })
        .then(text => {
          console.log('Refetched content length:', text.length)
          setContent(text)
          setLoading(false)
        })
        .catch(error => {
          console.error('Error refetching content:', error)
          setContent(`Error loading file content: ${error.message}`)
          setLoading(false)
        })
    }
  }

  const getLanguageFromKey = (fileKey: string) => {
    if (!fileKey || typeof fileKey !== 'string') {
      return 'plaintext'
    }
    const extension = fileKey.split('.').pop()?.toLowerCase()
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'javascript'
      case 'ts':
      case 'tsx':
        return 'typescript'
      case 'json':
        return 'json'
      case 'html':
        return 'html'
      case 'css':
        return 'css'
      case 'md':
        return 'markdown'
      case 'xml':
        return 'xml'
      case 'yaml':
      case 'yml':
        return 'yaml'
      case 'py':
        return 'python'
      case 'java':
        return 'java'
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp'
      case 'c':
        return 'c'
      case 'php':
        return 'php'
      case 'rb':
        return 'ruby'
      case 'go':
        return 'go' // Monaco supports Go
      case 'rs':
        return 'rust'
      case 'sh':
        return 'shell'
      case 'sql':
        return 'sql'
      case 'txt':
        return 'plaintext'
      default:
        return 'plaintext'
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle>
        {key}
        {mime?.startsWith("text/") && onSave && (
          <IconButton
            onClick={handleEditToggle}
            color="primary"
            sx={{ ml: 1 }}
            disabled={saving}
          >
            <EditIcon />
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent sx={{ backgroundColor: '#121212', minHeight: '70vh' }}>
        {loading ? (
          <CircularProgress size={20} />
        ) : url ? (
          mime?.startsWith("image/") ? (
            <img src={url} alt={key} style={{ maxWidth: "100%" }} />
          ) : mime?.startsWith("video/") ? (
            <video controls style={{ maxWidth: "100%" }}>
              <source src={url} type={mime} />
              Your browser does not support the video tag.
            </video>
          ) : mime?.startsWith("text/") && editMode ? (
            <div>
              <div style={{ marginBottom: '8px', fontSize: '12px', color: '#ccc' }}>
                Language: {getLanguageFromKey(key)} | Content length: {content.length} chars
              </div>
              <Editor
                key={`editor-${key}-${editMode}`} // Force re-render when switching modes
                height="60vh"
                language={getLanguageFromKey(key)}
                value={content}
                onChange={(value) => setContent(value || "")}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  automaticLayout: true,
                  readOnly: false,
                }}
                loading={<CircularProgress size={20} />}
              />
            </div>
          ) : mime?.startsWith("text/") ? (
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              maxHeight: '60vh',
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '14px',
              backgroundColor: '#1e1e1e',
              color: '#f8f8f2',
              padding: '16px',
              borderRadius: '4px',
              border: '1px solid #333'
            }}>
              {content}
            </pre>
          ) : (
            <Typography variant="body2">{t("s3browser.preview_unavailable", { defaultValue: "Aucun aperçu disponible pour ce type. Téléchargez le fichier pour l'ouvrir." })}</Typography>
          )
        ) : (
          <CircularProgress size={20} />
        )}
      </DialogContent>
      <DialogActions>
        {editMode ? (
          <>
            <Button
              onClick={handleSave}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              disabled={saving}
              color="primary"
            >
              {saving ? t("common.saving", { defaultValue: "Saving..." }) : t("common.save", { defaultValue: "Save" })}
            </Button>
            <Button
              onClick={handleCancel}
              startIcon={<CancelIcon />}
              disabled={saving}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => { if (url) window.open(url, "_blank") }}>{t("common.download", { defaultValue: "Download" })}</Button>
            <Button onClick={onClose}>{t("common.close")}</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
