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
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLocationCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type _Object as S3Object,
} from "@aws-sdk/client-s3"

type S3Session = {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  region?: string
  forcePathStyle?: boolean
}

function getStoredSession(): S3Session | null {
  try {
     const raw = sessionStorage.getItem("kexamanager:s3:session") || localStorage.getItem("kexamanager:s3:session")
     if (!raw) return null
     return JSON.parse(raw) as S3Session
  } catch {
     return null
  }
}

function useS3Client() {
  const session = useMemo(() => getStoredSession(), [])
  const client = useMemo(() => {
    if (!session) return null
    try {
      return new S3Client({
        region: session.region || "us-east-1",
        endpoint: session.endpoint,
        credentials: {
          accessKeyId: session.accessKeyId,
          secretAccessKey: session.secretAccessKey,
        },
        forcePathStyle: session.forcePathStyle ?? true,
      })
    } catch {
      return null
    }
  }, [session])
  return { client, session }
}

export default function S3Browser() {
  const { t } = useTranslation()
  const { client, session } = useS3Client()
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
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      await client.send(new HeadBucketCommand({ Bucket: "__noop__" })).catch(() => Promise.resolve())
      const res = await client.send(new ListBucketsCommand({}))
      setBuckets(res.Buckets || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBuckets([])
    } finally {
      setLoading(false)
    }
  }

  async function createBucket() {
    if (!client || !newBucket) return
    setLoading(true)
    setError(null)
    try {
      await client.send(new CreateBucketCommand({ Bucket: newBucket }))
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
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      await client.send(new DeleteBucketCommand({ Bucket: name }))
      if (selectedBucket === name) setSelectedBucket(null)
      await refreshBuckets()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function listObjects(bucket: string, opts?: { loadMore?: boolean }) {
    if (!client) return
    const loadingSetter = opts?.loadMore ? setIsListingMore : setLoading
    loadingSetter(true)
    setError(null)
    try {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: opts?.loadMore ? continuationToken : undefined })
      )
      const items = res.Contents || []
      setObjects((prev) => (opts?.loadMore ? [...prev, ...items] : items))
      setContinuationToken(res.IsTruncated ? res.NextContinuationToken : undefined)
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
    // Fetch bucket location best-effort
    try {
      if (client) {
        const loc = await client.send(new GetBucketLocationCommand({ Bucket: name }))
        const r = (loc as { LocationConstraint?: string }).LocationConstraint || ""
        setBucketRegion(r || "")
      }
    } catch {
      setBucketRegion(null)
    }
    await listObjects(name)
  }

  async function handleDeleteObject(bucket: string, key: string) {
    if (!client) return
    setLoading(true)
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(bucket: string, files: FileList | null) {
    if (!client || !files || !files.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        // Evite le chemin ReadableStream/getReader en envoyant un buffer binaire
        const buf = await file.arrayBuffer()
        const body = new Uint8Array(buf)
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: file.name, Body: body, ContentType: file.type || undefined }))
      }
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteSelected(bucket: string) {
    if (!client || selectedObjectKeys.size === 0) return
    setLoading(true)
    try {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: Array.from(selectedObjectKeys).map((k) => ({ Key: k })) },
      }))
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyObject(bucket: string) {
    if (!client || !copyDialog.sourceKey || !copyDialog.destKey) return
    setLoading(true)
    try {
      // S3 CopyObject requires CopySource in the form bucket/source
      await client.send(new CopyObjectCommand({
        Bucket: bucket,
        Key: copyDialog.destKey,
        CopySource: `${bucket}/${encodeURIComponent(copyDialog.sourceKey)}`,
      }))
      setCopyDialog({ open: false })
      await listObjects(bucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handlePreview(bucket: string, key: string) {
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      let contentType: string | undefined
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        contentType = head.ContentType || undefined
      } catch {
        // ignore
      }
      const getRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = getRes.Body
  if (!body) throw new Error("Empty body")

      // If it's a Blob (browser fetch)
      if (typeof Blob !== "undefined" && body instanceof Blob) {
        const blob = body
        const url = URL.createObjectURL(blob)
        setPreview({ key, url, mime: blob.type || contentType || "application/octet-stream" })
        return
      }
      // If it has a .stream() method (some polyfills)
      if (typeof (body as { stream?: () => unknown }).stream === "function") {
        const stream = (body as { stream: () => unknown }).stream()
  // Cast explicite pour Response
  const resp = new Response(stream as ReadableStream<Uint8Array> | Blob)
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        setPreview({ key, url, mime: blob.type || contentType || "application/octet-stream" })
        return
      }
      // If it's a ReadableStream (native)
      if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
        const resp = new Response(body as ReadableStream<Uint8Array>)
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        setPreview({ key, url, mime: blob.type || contentType || "application/octet-stream" })
        return
      }
      // If it has getReader (duck typing, but only if ReadableStream is not available)
      if (body && typeof (body as { getReader?: () => unknown }).getReader === "function") {
        try {
          const rs = new ReadableStream({
            start(controller) {
              const reader = (body as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }).getReader()
              function push() {
                reader.read().then((result) => {
                  if (result.done) {
                    controller.close()
                    return
                  }
                  if (result.value) {
                    controller.enqueue(result.value)
                  }
                  push()
                })
              }
              push()
            }
          })
          const resp = new Response(rs)
          const blob = await resp.blob()
          const url = URL.createObjectURL(blob)
          setPreview({ key, url, mime: blob.type || contentType || "application/octet-stream" })
          return
        } catch {
          // Erreur lors de la tentative de lecture du flux, fallback plus bas
        }
      }
      // If it's an ArrayBuffer or ArrayBufferView (Uint8Array, etc)
      // Helper type guard for ArrayBufferView
      function isArrayBufferView(val: unknown): val is ArrayBufferView {
        return val != null && typeof val === "object" &&
          "buffer" in val && "byteOffset" in val && "byteLength" in val
      }
      if (
        (typeof SharedArrayBuffer !== "undefined" && body instanceof SharedArrayBuffer) ||
        body instanceof ArrayBuffer ||
        isArrayBufferView(body)
      ) {
        // Refuse SharedArrayBuffer (non supporté par Blob)
        if (typeof SharedArrayBuffer !== "undefined" && body instanceof SharedArrayBuffer) {
          setPreview({ key, url: "", mime: "" })
          return
        }
        // Toujours convertir en ArrayBuffer pour Blob
        let arrBuf: ArrayBuffer
        if (body instanceof ArrayBuffer) {
          arrBuf = body
        } else if (isArrayBufferView(body)) {
          const sliced = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
          if (sliced instanceof ArrayBuffer) {
            arrBuf = sliced
          } else {
            // Fallback si SharedArrayBuffer (non supporté)
            setPreview({ key, url: "", mime: "" })
            return
          }
        } else {
          // Ne devrait jamais arriver
          setPreview({ key, url: "", mime: "" })
          return
        }
        const blob = new Blob([arrBuf], { type: contentType || "application/octet-stream" })
        const url = URL.createObjectURL(blob)
        setPreview({ key, url, mime: blob.type })
        return
      }
      setError("Unsupported response body (not a Blob, ReadableStream, or ArrayBuffer)")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (client) refreshBuckets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  if (!session || !client) {
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
          <Typography variant="caption" color="text.secondary">
            {session.endpoint} • {session.accessKeyId}
          </Typography>
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
                        <IconButton size="small" onClick={() => handlePreview(selectedBucket!, o.Key!)} title="Download">
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                        <Button size="small" onClick={() => setCopyDialog({ open: true, sourceKey: o.Key, destKey: `${o.Key}.copy` })}>
                          {t("common.copy", { defaultValue: "Copy" })}
                        </Button>
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
          <Button variant="contained" onClick={() => handleCopyObject(selectedBucket!)} disabled={!copyDialog.destKey}>
            {t("common.copy")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!preview} onClose={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null) }} fullWidth maxWidth="md">
        <DialogTitle>{preview?.key}</DialogTitle>
        <DialogContent>
          {preview?.url ? (
            preview.mime?.startsWith("image/") ? (
              <img src={preview.url} alt={preview.key} style={{ maxWidth: "100%" }} />
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
