import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Paper from "@mui/material/Paper"
import Table from "@mui/material/Table"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TableCell from "@mui/material/TableCell"
import TableBody from "@mui/material/TableBody"
import TableContainer from "@mui/material/TableContainer"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
import IconButton from "@mui/material/IconButton"
import CircularProgress from "@mui/material/CircularProgress"
import Chip from "@mui/material/Chip"
import DeleteIcon from "@mui/icons-material/Delete"
import RefreshIcon from "@mui/icons-material/Refresh"
import AddIcon from "@mui/icons-material/Add"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import UploadIcon from "@mui/icons-material/Upload"
import VisibilityIcon from "@mui/icons-material/Visibility"
import DownloadIcon from "@mui/icons-material/Download"
import {
  type _Object as S3Object,
} from "@aws-sdk/client-s3"

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

function useS3KeyId() {
  const keyId = useMemo(() => getStoredKeyId(), [])
  return keyId
}

async function s3ApiRequest<T>(endpoint: string, body: unknown): Promise<T> {
  const keyId = getStoredKeyId()
  const token = getStoredToken()
  const response = await fetch(`/api/s3/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keyId, token, ...(body as Record<string, unknown> || {}) }),
  })
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export default function S3Browser() {
  const { t } = useTranslation()
  const keyId = useS3KeyId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buckets, setBuckets] = useState<{ Name?: string; CreationDate?: Date }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newBucket, setNewBucket] = useState("")
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [objects, setObjects] = useState<S3Object[]>([])
  const [prefix, setPrefix] = useState<string>("")
  const [continuationToken, setContinuationToken] = useState<string | undefined>(undefined)
  const [isListingMore, setIsListingMore] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{ key: string; url?: string; mime?: string } | null>(null)
  const [selectedObjectKeys, setSelectedObjectKeys] = useState<Set<string>>(new Set())
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; sourceKey?: string; destKey?: string }>({ open: false })
  const [bucketRegion, setBucketRegion] = useState<string | null>(null)

  async function refreshBuckets() {
    setLoading(true)
    setError(null)
    try {
      const res = await s3ApiRequest<{ buckets: { name: string; creationDate: string }[] }>('list-buckets', {})
      setBuckets(res.buckets.map(b => ({ Name: b.name, CreationDate: new Date(b.creationDate) })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBuckets([])
    } finally {
      setLoading(false)
    }
  }

  async function createBucket() {
    if (!newBucket) return
    setLoading(true)
    setError(null)
    try {
      await s3ApiRequest<{ success: boolean }>('create-bucket', {
        bucket: newBucket
      })
      setCreateOpen(false)
      setNewBucket("")
      await refreshBuckets()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function deleteBucket(name: string) {
    setLoading(true)
    setError(null)
    try {
      await s3ApiRequest<{ success: boolean }>('delete-bucket', {
        bucket: name
      })
      if (selectedBucket === name) setSelectedBucket(null)
      await refreshBuckets()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function listObjects(bucket: string, opts?: { loadMore?: boolean }) {
    const loadingSetter = opts?.loadMore ? setIsListingMore : setLoading
    loadingSetter(true)
    setError(null)
    try {
      const res = await s3ApiRequest<{ objects: { key: string; size: number; lastModified: string; etag: string }[]; continuationToken?: string; isTruncated: boolean }>('list-objects', {
        bucket,
        prefix: prefix || undefined
      })
      const items = res.objects.map(obj => ({
        Key: obj.key,
        Size: obj.size,
        LastModified: new Date(obj.lastModified),
        ETag: obj.etag
      }))
      setObjects((prev) => (opts?.loadMore ? [...prev, ...items] : items))
      setContinuationToken(res.isTruncated ? res.continuationToken : undefined)
      if (!opts?.loadMore) setSelectedObjectKeys(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setObjects([])
    } finally {
      loadingSetter(false)
    }
  }

  async function handleOpenBucket(name: string) {
    setSelectedBucket(name)
    setContinuationToken(undefined)
    setBucketRegion(null)
    // TODO: Fetch bucket location if needed
    await listObjects(name)
  }

  async function handleDeleteObject(bucket: string, key: string) {
    setLoading(true)
    try {
      await s3ApiRequest<{ success: boolean }>('delete-object', {
        bucket,
        key
      })
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(bucket: string, files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('keyId', getStoredKeyId() || '')
        formData.append('token', getStoredToken() || '')
        formData.append('bucket', bucket)
        formData.append('key', file.name)
        formData.append('file', file)

        const response = await fetch('/api/s3/put-object', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
        }
      }
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteSelected(bucket: string) {
    if (selectedObjectKeys.size === 0) return
    setLoading(true)
    try {
      for (const key of selectedObjectKeys) {
        await s3ApiRequest<{ success: boolean }>('delete-object', {
          bucket,
          key
        })
      }
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // async function handleCopyObject(bucket: string) {
  //   if (!session || !copyDialog.sourceKey || !copyDialog.destKey) return
  //   setLoading(true)
  //   try {
  //     // TODO: Implement copy via API
  //     setCopyDialog({ open: false })
  //     await listObjects(bucket)
  //   } catch (e) {
  //     setError(e instanceof Error ? e.message : String(e))
  //   } finally {
  //     setLoading(false)
  //   }
  // }

  // async function handlePreview(bucket: string, key: string) {
  //   // TODO: Implement preview via API
  // }

  async function handlePreview(bucket: string, key: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await s3ApiRequest<{ presignedUrl: string }>('get-object', {
        bucket,
        key
      })
      // Determine MIME type from file extension
      const extension = key.split('.').pop()?.toLowerCase()
      let mime = 'application/octet-stream'
      if (extension) {
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
          mime = `image/${extension === 'jpg' ? 'jpeg' : extension}`
        } else if (['txt', 'json', 'xml', 'html', 'css', 'js', 'ts', 'md'].includes(extension)) {
          mime = 'text/plain'
        } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension)) {
          mime = `video/${extension}`
        }
      }
      setPreview({ key, url: res.presignedUrl, mime })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(bucket: string, key: string) {
    try {
      const res = await s3ApiRequest<{ presignedUrl: string }>('get-object', {
        bucket,
        key
      })
      // Create a temporary link and trigger download
      const link = document.createElement('a')
      link.href = res.presignedUrl
      link.download = key.split('/').pop() || key
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (keyId) refreshBuckets()
  }, [keyId])

  if (!keyId) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6">{t("s3browser.no_session_title", { defaultValue: "S3 Browser" })}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("s3browser.no_session_desc", { defaultValue: "Aucune session S3 trouvée. Utilisez 'Impersonate key' dans Applications Keys pour configurer une session." })}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Stack>
          <Typography variant="h6">{t("s3browser.title", { defaultValue: "S3 Browser" })}</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshIcon />} onClick={refreshBuckets} variant="outlined">
            {t("common.refresh")}
          </Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
            {t("buckets.actions_add", { defaultValue: "Create bucket" })}
          </Button>
        </Stack>
      </Box>

      {!selectedBucket ? (
        <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>{t("buckets.col.id")}</TableCell>
                <TableCell>{t("buckets.col.creationDate")}</TableCell>
                <TableCell>{t("buckets.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={3} sx={{ textAlign: "center" }}>
                    <CircularProgress size={20} /> {t("common.loading")}
                  </TableCell>
                </TableRow>
              )}
              {!loading && buckets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} sx={{ textAlign: "center" }}>
                    {t("buckets.empty")}
                  </TableCell>
                </TableRow>
              )}
              {buckets.map((b) => (
                <TableRow key={b.Name} hover>
                  <TableCell>{b.Name}</TableCell>
                  <TableCell>{b.CreationDate ? new Date(b.CreationDate).toLocaleString() : ""}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => handleOpenBucket(b.Name!)}>{t("common.open", { defaultValue: "Open" })}</Button>
                      <IconButton size="small" color="error" onClick={() => deleteBucket(b.Name!)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => setSelectedBucket(null)}>{t("common.back", { defaultValue: "Back" })}</Button>
            <Typography variant="subtitle1">{selectedBucket}</Typography>
            {bucketRegion !== null && (
              <Chip size="small" label={bucketRegion ? `region: ${bucketRegion}` : "region: default"} />
            )}
            <Box sx={{ flex: 1 }} />
            <TextField size="small" placeholder={t("common.search", { defaultValue: "Prefix" })} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            <Button variant="outlined" onClick={() => listObjects(selectedBucket)} startIcon={<RefreshIcon />}>{t("common.refresh")}</Button>
            <Button component="label" startIcon={<UploadIcon />} disabled={uploading}>
              {uploading ? t("common.uploading", { defaultValue: "Uploading..." }) : t("common.upload", { defaultValue: "Upload" })}
              <input type="file" multiple hidden onChange={(e) => handleUpload(selectedBucket, e.target.files)} />
            </Button>
            <Button color="error" disabled={selectedObjectKeys.size === 0} onClick={() => handleDeleteSelected(selectedBucket)}>
              {t("common.delete_selected", { defaultValue: "Delete selected" })}
            </Button>
          </Stack>

          <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell width={24}>
                    <input
                      type="checkbox"
                      checked={objects.length > 0 && selectedObjectKeys.size === objects.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedObjectKeys(new Set(objects.map((o) => o.Key!)))
                        else setSelectedObjectKeys(new Set())
                      }}
                    />
                  </TableCell>
                  <TableCell>Key</TableCell>
                  <TableCell align="right">Size</TableCell>
                  <TableCell>LastModified</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                      <CircularProgress size={20} /> {t("common.loading")}
                    </TableCell>
                  </TableRow>
                )}
                {!loading && objects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                      {t("common.empty", { defaultValue: "No objects" })}
                    </TableCell>
                  </TableRow>
                )}
                {objects.map((o) => (
                  <TableRow key={`${o.Key}-${o.ETag}`} hover>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedObjectKeys.has(o.Key!)}
                        onChange={(e) => {
                          setSelectedObjectKeys((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(o.Key!)
                            else next.delete(o.Key!)
                            return next
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>{o.Key}</TableCell>
                    <TableCell align="right">{o.Size}</TableCell>
                    <TableCell>{o.LastModified ? new Date(o.LastModified).toLocaleString() : ""}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={() => handlePreview(selectedBucket!, o.Key!)} title="Preview">
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDownload(selectedBucket!, o.Key!)} title="Download">
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                        {/* <Button size="small" onClick={() => setCopyDialog({ open: true, sourceKey: o.Key, destKey: `${o.Key}.copy` })}>
                          {t("common.copy", { defaultValue: "Copy" })}
                        </Button> */}
                        <IconButton size="small" color="error" onClick={() => handleDeleteObject(selectedBucket!, o.Key!)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {continuationToken && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                      <Button disabled={isListingMore} onClick={() => listObjects(selectedBucket!, { loadMore: true })}>
                        {isListingMore ? <CircularProgress size={16} /> : t("common.load_more", { defaultValue: "Load more" })}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {error && (
        <Box sx={{ mt: 1 }}>
          <Chip color="error" label={error} />
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>{t("buckets.actions_add", { defaultValue: "Create bucket" })}</DialogTitle>
        <DialogContent>
          <TextField autoFocus margin="dense" fullWidth label={t("buckets.form.globalAlias", { defaultValue: "Bucket name" })} value={newBucket} onChange={(e) => setNewBucket(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={createBucket} disabled={!newBucket}>
            {t("common.create", { defaultValue: "Create" })}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={copyDialog.open} onClose={() => setCopyDialog({ open: false })}>
        <DialogTitle>{t("s3browser.copy_object", { defaultValue: "Copy object" })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t("s3browser.source_key", { defaultValue: "Source key" })} value={copyDialog.sourceKey || ""} disabled fullWidth />
            <TextField label={t("s3browser.dest_key", { defaultValue: "Destination key" })} value={copyDialog.destKey || ""} onChange={(e) => setCopyDialog((c) => ({ ...c, destKey: e.target.value }))} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialog({ open: false })}>{t("common.cancel")}</Button>
          {/* <Button variant="contained" onClick={() => handleCopyObject(selectedBucket!)} disabled={!copyDialog.destKey}>
            {t("common.copy")}
          </Button> */}
        </DialogActions>
      </Dialog>

      <Dialog open={!!preview} onClose={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null) }} fullWidth maxWidth="md">
        <DialogTitle>{preview?.key}</DialogTitle>
        <DialogContent>
          {preview?.url ? (
            preview.mime?.startsWith("image/") ? (
              <img src={preview.url} alt={preview.key} style={{ maxWidth: "100%" }} />
            ) : preview.mime?.startsWith("video/") ? (
              <video controls style={{ maxWidth: "100%" }}>
                <source src={preview.url} type={preview.mime} />
                Your browser does not support the video tag.
              </video>
            ) : preview.mime?.startsWith("text/") ? (
              <iframe src={preview.url} title="preview" style={{ width: "100%", height: 400, border: 0 }} />
            ) : (
              <Typography variant="body2">{t("s3browser.preview_unavailable", { defaultValue: "Aucun aperçu disponible pour ce type. Téléchargez le fichier pour l'ouvrir." })}</Typography>
            )
          ) : (
            <CircularProgress size={20} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { if (preview?.url) window.open(preview.url, "_blank"); }}>{t("common.download", { defaultValue: "Download" })}</Button>
          <Button onClick={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null) }}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
