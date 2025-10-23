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
      })
        .then(response => {
          console.log('Fetch response status:', response.status)
          console.log('Fetch response ok:', response.ok)
          console.log('Fetch response type:', response.type)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`)
          }

          // Check if we can read the response
          const contentType = response.headers.get('content-type')
          console.log('Content-Type:', contentType)

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
          console.error('Error name:', error.name)
          console.error('Error message:', error.message)

          let errorMessage = 'Failed to load file content'
          if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error: Unable to connect to the file server'
          } else if (error.message.includes('CORS')) {
            errorMessage = 'CORS error: File server does not allow cross-origin requests'
          } else if (error.message.includes('HTTP 403')) {
            errorMessage = 'Access denied: The file URL may have expired'
          } else if (error.message.includes('HTTP 404')) {
            errorMessage = 'File not found: The file may have been deleted'
          }

          setContent(`Error: ${errorMessage}\n\nTechnical details: ${error.message}`)
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
      fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`)
          }
          return response.text()
        })
        .then(text => {
          setContent(text)
          setLoading(false)
        })
        .catch(error => {
          console.error('Error refetching in cancel:', error)
          setContent(`Error loading file content: ${error.message}`)
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
        credentials: 'omit',
      })
        .then(response => {
          console.log('Refetch response status:', response.status)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`)
          }
          return response.text()
        })
        .then(text => {
          console.log('Refetched content length:', text.length)
          setContent(text)
          setLoading(false)
        })
        .catch(error => {
          console.error('Error refetching in edit toggle:', error)
          setContent(`Error loading file content: ${error.message}`)
          setLoading(false)
        })
    }
  }

  const getLanguageFromMime = (mime: string) => {
    switch (mime) {
      case 'application/json':
        return 'json'
      case 'text/javascript':
        return 'javascript'
      case 'text/typescript':
        return 'typescript'
      case 'text/html':
        return 'html'
      case 'text/css':
        return 'css'
      case 'text/xml':
        return 'xml'
      case 'text/markdown':
        return 'markdown'
      case 'text/plain':
        return 'plaintext'
      case 'text/yaml':
        return 'yaml'
      case 'text/x-python':
        return 'python'
      case 'text/x-java':
        return 'java'
      case 'text/x-c++':
        return 'cpp'
      case 'text/x-c':
        return 'c'
      case 'text/x-php':
        return 'php'
      case 'text/x-ruby':
        return 'ruby'
      case 'text/x-go':
        return 'go'
      case 'text/x-rust':
        return 'rust'
      case 'text/x-shell':
        return 'shell'
      case 'text/x-sql':
        return 'sql'
      case 'text/x-dart':
        return 'dart'
      case 'text/x-kotlin':
        return 'kotlin'
      case 'text/x-scala':
        return 'scala'
      case 'text/x-lua':
        return 'lua'
      case 'text/x-r':
        return 'r'
      case 'text/x-swift':
        return 'swift'
      case 'text/x-csharp':
        return 'csharp'
      case 'text/x-fsharp':
        return 'fsharp'
      case 'text/x-haskell':
        return 'haskell'
      case 'text/x-ocaml':
        return 'ocaml'
      case 'text/x-perl':
        return 'perl'
      case 'text/x-tcl':
        return 'tcl'
      case 'text/x-dockerfile':
        return 'dockerfile'
      case 'text/x-makefile':
        return 'makefile'
      case 'text/x-cmake':
        return 'cmake'
      case 'text/x-gradle':
        return 'gradle'
      case 'text/x-toml':
        return 'toml'
      case 'text/x-ini':
        return 'ini'
      case 'text/x-batch':
        return 'bat'
      case 'text/x-powershell':
        return 'powershell'
      default:
        return 'plaintext'
    }
  }

  const getLanguageFromKey = (fileKey: string) => {
    if (!fileKey || typeof fileKey !== 'string') {
      return 'plaintext'
    }
    // Get the filename from the path
    const filename = fileKey.split('/').pop() || fileKey
    const extension = filename.split('.').pop()?.toLowerCase()
    if (!extension) {
      // No extension, check known filenames
      const lower = filename.toLowerCase()
      if (lower === 'dockerfile') return 'dockerfile'
      if (lower === 'makefile') return 'makefile'
      if (lower === 'cmakelists.txt') return 'cmake'
      return 'plaintext'
    }
    switch (extension) {
      case 'js':
      case 'jsx':
      case 'mjs':
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
        return 'go'
      case 'rs':
        return 'rust'
      case 'sh':
        return 'shell'
      case 'sql':
        return 'sql'
      case 'txt':
        return 'plaintext'
      case 'dart':
        return 'dart'
      case 'kt':
        return 'kotlin'
      case 'scala':
        return 'scala'
      case 'lua':
        return 'lua'
      case 'r':
        return 'r'
      case 'swift':
        return 'swift'
      case 'cs':
        return 'csharp'
      case 'fs':
        return 'fsharp'
      case 'hs':
        return 'haskell'
      case 'ml':
        return 'ocaml'
      case 'pl':
        return 'perl'
      case 'tcl':
        return 'tcl'
      case 'dockerfile':
        return 'dockerfile'
      case 'makefile':
        return 'makefile'
      case 'cmake':
        return 'cmake'
      case 'gradle':
        return 'gradle'
      case 'toml':
        return 'toml'
      case 'ini':
        return 'ini'
      case 'bat':
        return 'bat'
      case 'ps1':
        return 'powershell'
      default:
        return 'plaintext'
    }
  }

  const language = mime ? getLanguageFromMime(mime) : getLanguageFromKey(key)

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
                Language: {language} | Content length: {content.length} chars
              </div>
              <Editor
                key={`editor-${key}-${editMode}`} // Force re-render when switching modes
                height="60vh"
                language={language}
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
