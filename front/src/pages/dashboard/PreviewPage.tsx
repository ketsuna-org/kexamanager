import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Stack from "@mui/material/Stack"
import Tooltip from "@mui/material/Tooltip"
import CircularProgress from "@mui/material/CircularProgress"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import EditIcon from "@mui/icons-material/Edit"
import SaveIcon from "@mui/icons-material/Save"
import CancelIcon from "@mui/icons-material/Cancel"
import DownloadIcon from "@mui/icons-material/Download"
import Editor, { loader } from "@monaco-editor/react"
import PageHeader from "../../components/PageHeader"
import { useProject, type ProjectSummary } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"
import { clearPreviewSession } from "../../utils/previewSession"

// Configure Monaco Editor
loader.init().then(monaco => {
  // Ensure Go language is available
  if (!monaco.languages.getLanguages().find((lang: { id: string }) => lang.id === 'go')) {
    monaco.languages.register({ id: 'go' })
  }
})

function getStoredKeyId(): string | null {
  try {
    const keyId = sessionStorage.getItem("kexamanager:s3:keyId") || localStorage.getItem("kexamanager:s3:keyId")
    return keyId
  } catch {
    return null
  }
}

function getStoredToken(): string | null {
  try {
    const token = sessionStorage.getItem("kexamanager:s3:secretAccessKey") || localStorage.getItem("kexamanager:s3:secretAccessKey")
    return token
  } catch {
    return null
  }
}

interface PreviewPageProps {
  /** Project still handed over by the App.tsx call site; the shared context wins. */
  selectedProject?: ProjectSummary | null
}

export default function PreviewPage({ selectedProject: legacyProject }: PreviewPageProps) {
  const { t } = useTranslation()
  const { selectedProject: contextProject } = useProject()
  const selectedProject = contextProject ?? legacyProject ?? null
  const [editMode, setEditMode] = useState(false)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [key, setKey] = useState("")
  const [url, setUrl] = useState("")
  const [mime, setMime] = useState("")
  const [bucket, setBucket] = useState("")

  useEffect(() => {
    // First try to read preview params from sessionStorage (set by the caller),
    // fallback to the existing hash parsing logic if not present.
    const sKey = sessionStorage.getItem('kexamanager:preview:key')
    const sUrl = sessionStorage.getItem('kexamanager:preview:url')
    const sMime = sessionStorage.getItem('kexamanager:preview:mime')
    const sBucket = sessionStorage.getItem('kexamanager:preview:bucket')

    let k = sKey || ""
    let u = sUrl || ""
    let m = sMime || ""
    let b = sBucket || ""

    if (!k && !u && !m && !b) {
      const hash = window.location.hash
      const queryIndex = hash.indexOf('?')
      const queryString = queryIndex !== -1 ? hash.substring(queryIndex + 1) : ''
      const params = new URLSearchParams(queryString)
      k = params.get('key') || ""
      u = params.get('url') || ""
      m = params.get('mime') || ""
      b = params.get('bucket') || ""
    }

    setKey(k)
    setUrl(u)
    setMime(m)
    setBucket(b)

    // NOTE: Do NOT remove the sessionStorage keys here. In React 18 StrictMode
    // the component may mount, run effects, then unmount and mount again during
    // development; removing the keys here causes the second mount to see empty
    // values. If you want to clear the preview params, do it explicitly from the
    // caller or provide a dedicated 'clearPreview' action.

    if (u && m?.startsWith("text/")) {
      fetch(u, {
        method: 'GET',
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
          console.error('Error fetching content:', error)
          setContent(`Error: ${error.message}`)
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  const handleSave = async () => {
    if (!bucket || !key) {
      console.error('Bucket or key missing')
      return
    }
    setSaving(true)
    try {
      const blob = new Blob([content], { type: mime || 'text/plain' })
      const file = new File([blob], key.split('/').pop() || 'file', { type: mime || 'text/plain' })

      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      const storedKeyId = getStoredKeyId()
      const storedToken = getStoredToken()
      if (storedKeyId) formData.append('keyId', storedKeyId)
      if (storedToken) formData.append('token', storedToken)
      formData.append('bucket', bucket)
      formData.append('key', key)
      formData.append('fileSize', file.size.toString())
      formData.append('file', file)
      const jwtToken = localStorage.getItem('kexamanager:token')
      xhr.open('POST', `/api/${selectedProject?.id}/s3/put-object`)
      if (jwtToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${jwtToken}`)
      }
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setSaving(false)
          setEditMode(false)
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            console.error('Save failed:', errorData.error, errorData.details)
          } catch {
            console.error('Save failed:', xhr.status, xhr.statusText)
          }
          setSaving(false)
        }
      })
      xhr.addEventListener('error', () => {
        console.error('Save failed: Network error')
        setSaving(false)
      })
      xhr.send(formData)
    } catch (error) {
      console.error('Save error:', error)
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditMode(false)
    // Re-fetch content
    if (url && mime?.startsWith("text/")) {
      setLoading(true)
      fetch(url, {
        method: 'GET',
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

  const subtitle = [mime, bucket].filter(Boolean).join(" · ")

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: '#121212' }}>
      <Box sx={{ px: 2, pt: 2, display: 'flex', alignItems: 'flex-start', gap: 1, borderBottom: '1px solid #333' }}>
        <IconButton
          onClick={() => { clearPreviewSession(); window.location.hash = 's3' }}
          aria-label={t("common.close")}
          sx={{ mt: 0.5 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <PageHeader
            title={key || t("s3browser.preview_title")}
            subtitle={subtitle || undefined}
            badge={projectBadge(selectedProject)}
            action={
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {mime?.startsWith("text/") && (
                  <Tooltip title={t("common.edit") as string}>
                    <span>
                      <IconButton
                        onClick={() => setEditMode(!editMode)}
                        color="primary"
                        disabled={saving}
                        aria-label={t("common.edit") as string}
                      >
                        <EditIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                <Button
                  onClick={() => { if (url) window.open(url, "_blank") }}
                  startIcon={<DownloadIcon />}
                  disabled={!url}
                >
                  {t("common.download")}
                </Button>
              </Stack>
            }
          />
        </Box>
      </Box>

      <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
        {loading ? (
          <CircularProgress size={20} />
        ) : url ? (
          mime?.startsWith("image/") ? (
            <Box component="img" src={url} alt={key} sx={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : mime?.startsWith("video/") ? (
            <Box component="video" controls sx={{ maxWidth: "100%", maxHeight: "100%" }}>
              <source src={url} type={mime} />
              Your browser does not support the video tag.
            </Box>
          ) : mime?.startsWith("text/") && editMode ? (
            <Box>
              <Box sx={{ mb: 1, fontSize: '12px', color: '#ccc' }}>
                Language: {language} | Content length: {content.length} chars
              </Box>
              <Editor
                key={`editor-${key}-${editMode}`}
                height="calc(100dvh - 120px)"
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
            </Box>
          ) : mime?.startsWith("text/") ? (
            <Box
              component="pre"
              sx={{
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                height: 'calc(100dvh - 120px)',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '14px',
                backgroundColor: '#1e1e1e',
                color: '#f8f8f2',
                p: 2,
                borderRadius: '4px',
                border: '1px solid #333',
                m: 0,
              }}
            >
              {content}
            </Box>
          ) : (
            <Typography variant="body2">{t("s3browser.preview_unavailable")}</Typography>
          )
        ) : (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {t("s3browser.no_url")}
          </Typography>
        )}
      </Box>
      {editMode && (
        <Box sx={{ p: 2, borderTop: '1px solid #333', display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            onClick={() => { void handleSave() }}
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            disabled={saving}
            color="primary"
            variant="contained"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button
            onClick={handleCancel}
            startIcon={<CancelIcon />}
            disabled={saving}
            sx={{ ml: 1 }}
          >
            {t("common.cancel")}
          </Button>
        </Box>
      )}
    </Box>
  );
}
