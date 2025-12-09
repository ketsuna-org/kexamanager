import { useEffect, useMemo, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Chip from "@mui/material/Chip"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Button from "@mui/material/Button"
import { GetBucketInfo } from "../../utils/apiWrapper"
import { BucketsList, ObjectsList, CreateBucketDialog, CopyObjectDialog } from "./components"
import ConfirmDialog from "../../components/ConfirmDialog"
import PreviewDialog from "./components/PreviewDialog"

interface ConfirmState {
  title: string
  message: string
  confirmColor?: "primary" | "secondary" | "error" | "info" | "success" | "warning"
  onConfirm: () => void
}

interface S3Object {
  Key: string
  Size: number
  LastModified: Date
  ETag: string
}

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

async function s3ApiRequest<T>(endpoint: string, body: unknown, configId?: number): Promise<T> {
  const keyId = getStoredKeyId()
  const token = getStoredToken()
  const baseUrl = configId ? `/api/${configId}/s3` : '/api/s3'
  const jwtToken = localStorage.getItem("kexamanager:token")
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`
  }
  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyId, token, ...(body as Record<string, unknown> || {}) }),
  })
  if (!response.ok) {
    // Try to parse JSON error response
    try {
      const errorData = await response.json()
      throw new Error(`${errorData.error}: ${errorData.details || ''}`)
    } catch {
      // Fallback to status text if not JSON
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }
  }
  return response.json()
}

interface S3BrowserProps {
  selectedProject: { id: number; name: string; admin_url?: string; type?: string } | null
}

export default function S3Browser({ selectedProject }: S3BrowserProps) {
  const { t } = useTranslation()
  const keyId = useS3KeyId()
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(selectedProject?.id || null)

  // Update selectedConfigId when selectedProject changes
  useEffect(() => {
    setSelectedConfigId(selectedProject?.id || null)
  }, [selectedProject])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buckets, setBuckets] = useState<{ Name?: string; CreationDate?: Date }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newBucket, setNewBucket] = useState("")
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [bucketTotalSize, setBucketTotalSize] = useState<number>(0)
  const [bucketQuota, setBucketQuota] = useState<{ maxSize?: number | null } | null>(null)
  const [objects, setObjects] = useState<S3Object[]>([])
  const [prefix, setPrefix] = useState<string>("")
  const [continuationToken, setContinuationToken] = useState<string | undefined>(undefined)
  const [isListingMore, setIsListingMore] = useState(false)
  // const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedObjectKeys, setSelectedObjectKeys] = useState<Set<string>>(new Set())
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; sourceKey?: string; destKey?: string }>({ open: false })
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; key?: string; url?: string; mime?: string }>({ open: false })
  const [bucketRegion, setBucketRegion] = useState<string | null>(null)
  const [quotaAlert, setQuotaAlert] = useState<{ open: boolean; message: string; onConfirm: () => void } | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const refreshBuckets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await s3ApiRequest<{ buckets: { name: string; creationDate: string }[] }>('list-buckets', {}, selectedConfigId || undefined)
      setBuckets(res.buckets.map(b => ({ Name: b.name, CreationDate: new Date(b.creationDate) })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBuckets([])
    } finally {
      setLoading(false)
    }
  }, [selectedConfigId])

  async function createBucket() {
    if (!newBucket) return
    setLoading(true)
    setError(null)
    try {
      await s3ApiRequest<{ success: boolean }>('create-bucket', {
        bucket: newBucket
      }, selectedConfigId || undefined)
      setCreateOpen(false)
      setNewBucket("")
      await refreshBuckets()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function confirmDeleteBucket(name: string) {
    setConfirmState({
      title: t("s3browser.delete_bucket_title", "Delete Bucket"),
      message: t("s3browser.delete_bucket_confirm", `Are you sure you want to delete bucket "${name}"? This action cannot be undone.`),
      confirmColor: "error",
      onConfirm: () => performDeleteBucket(name)
    })
  }

  async function performDeleteBucket(name: string) {
    setLoading(true)
    setError(null)
    try {
      await s3ApiRequest<{ success: boolean }>('delete-bucket', {
        bucket: name
      }, selectedConfigId || undefined)
      if (selectedBucket === name) setSelectedBucket(null)
      setConfirmState(null)
      await refreshBuckets()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConfirmState(null) // Close dialog even on error so user can see toast/error chip
    } finally {
      setLoading(false)
    }
  }

  async function listObjects(bucket: string, opts?: { loadMore?: boolean; prefix?: string }) {
    const loadingSetter = opts?.loadMore ? setIsListingMore : setLoading
    loadingSetter(true)
    setError(null)
    try {
      const res = await s3ApiRequest<{ objects: { key: string; size: number; lastModified: string; etag: string }[]; continuationToken?: string; isTruncated: boolean; totalSize: number }>('list-objects', {
        bucket,
        prefix: opts?.prefix !== undefined ? opts.prefix : (prefix || undefined)
      }, selectedConfigId || undefined)
      console.log('List objects response:', res)
      const items = res.objects ? res.objects.map(obj => ({
        Key: obj.key,
        Size: obj.size,
        LastModified: new Date(obj.lastModified),
        ETag: obj.etag
      })) : []
      setObjects((prev) => (opts?.loadMore ? [...prev, ...items] : items))
      setContinuationToken(res.isTruncated ? res.continuationToken : undefined)
      if (!opts?.loadMore) {
        setSelectedObjectKeys(new Set())
        console.log('Setting bucket total size to:', res.totalSize)
        setBucketTotalSize(res.totalSize)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setObjects([])
    } finally {
      loadingSetter(false)
    }
  }

  async function handleOpenBucket(name: string) {
    setSelectedBucket(name)
    setPrefix("")  // Reset prefix when opening a bucket
    setContinuationToken(undefined)
    setBucketRegion(null)
    // Try to get bucket info for quota checking
    // Only call admin GetBucketInfo if we have a selectedProject with an admin_url
    // and it's not a plain 's3' project (which doesn't expose the admin API).
    if (selectedProject && selectedProject.admin_url && selectedProject.type !== 's3') {
      try {
        console.log('Trying to get bucket info for:', name)
        let bucketInfo;
        try {
          bucketInfo = await GetBucketInfo({ globalAlias: name })
        } catch {
          // Try with search
          bucketInfo = await GetBucketInfo({ search: name })
        }
        console.log('Got bucket info:', bucketInfo)
        setBucketQuota(bucketInfo.quotas || null)
      } catch (e) {
        console.log('Failed to get bucket info:', e)
        // Ignore if not admin or bucket not found
        setBucketQuota(null)
      }
    } else {
      // No admin API available for this project — clear quota and continue
      console.log('Skipping admin GetBucketInfo: no admin_url or project is type s3')
      setBucketQuota(null)
    }
    await listObjects(name)
  }

  function confirmDeleteObject(bucket: string, key: string) {
    setConfirmState({
      title: t("s3browser.delete_object_title", "Delete Object"),
      message: t("s3browser.delete_object_confirm", `Are you sure you want to delete "${key}"?`),
      confirmColor: "error",
      onConfirm: () => performDeleteObject(bucket, key)
    })
  }

  async function performDeleteObject(bucket: string, key: string) {
    setLoading(true)
    try {
      await s3ApiRequest<{ success: boolean }>('delete-object', {
        bucket,
        key
      }, selectedConfigId || undefined)
      await listObjects(bucket)
      setConfirmState(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConfirmState(null)
    } finally {
      setLoading(false)
    }
  }

  function confirmDeleteDirectory(dirPrefix: string) {
    setConfirmState({
      title: t("s3browser.delete_folder_title", "Delete Folder"),
      message: t("s3browser.delete_folder_confirm", `Are you sure you want to delete folder "${dirPrefix}" and all its contents?`),
      confirmColor: "error",
      onConfirm: () => performDeleteDirectory(dirPrefix)
    })
  }

  async function performDeleteDirectory(dirPrefix: string) {
    if (!selectedBucket) return
    setLoading(true)
    setError(null)
    try {
      // List all objects under this directory
      const res = await s3ApiRequest<{ objects: { key: string; size: number; lastModified: string; etag: string }[]; continuationToken?: string; isTruncated: boolean; totalSize: number }>('list-objects', {
        bucket: selectedBucket,
        prefix: dirPrefix,
        maxKeys: 1000 // Get up to 1000 objects to delete
      }, selectedConfigId || undefined)

      // Delete all objects in the directory
      for (const obj of res.objects) {
        await s3ApiRequest<{ success: boolean }>('delete-object', {
          bucket: selectedBucket,
          key: obj.key
        }, selectedConfigId || undefined)
      }

      await listObjects(selectedBucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setConfirmState(null)
    }
  }

  async function handleCreateDirectory(dirName: string) {
    if (!dirName.trim() || !selectedBucket) return
    setLoading(true)
    setError(null)
    try {
      const key = (prefix || '') + dirName.trim() + '/.dir'
      const file = new File(['directory marker'], '.dir', { type: 'application/octet-stream' })
      await uploadFile(selectedBucket, file, key)
      await listObjects(selectedBucket)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function uploadFile(bucket: string, file: File, key?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      const storedKeyId = getStoredKeyId()
      const storedToken = getStoredToken()
      if (storedKeyId) formData.append('keyId', storedKeyId)
      if (storedToken) formData.append('token', storedToken)
      formData.append('bucket', bucket)
      formData.append('key', key || file.name)
      formData.append('fileSize', file.size.toString())
      formData.append('file', file)

      const jwtToken = localStorage.getItem("kexamanager:token")
      xhr.open('POST', `/api/${selectedConfigId}/s3/put-object`)
      if (jwtToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${jwtToken}`)
      }
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      })
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve()
        } else {
          // Try to parse JSON error response
          try {
            const errorData = JSON.parse(xhr.responseText)
            reject(new Error(`${errorData.error}: ${errorData.details || ''}`))
          } catch {
            // Fallback to status text if not JSON
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
          }
        }
      })
      xhr.addEventListener('error', () => reject(new Error('Upload failed')))
      xhr.send(formData)
    })
  }

  async function handleUpload(bucket: string, files: FileList | null) {
    if (!files || !files.length) return
    setError(null)

    // Check bucket size quota before uploading
    console.log('Bucket quota:', bucketQuota)
    console.log('Bucket total size:', bucketTotalSize)
    if (bucketQuota && typeof bucketQuota.maxSize === 'number') {
      const totalFileSize = Array.from(files).reduce((sum, file) => sum + file.size, 0)
      console.log('Total file size:', totalFileSize)
      console.log('Would exceed?', bucketTotalSize + totalFileSize > bucketQuota.maxSize)
      if (bucketTotalSize + totalFileSize > bucketQuota.maxSize) {
        return new Promise<void>((resolve) => {
          setQuotaAlert({
            open: true,
            message: `Upload would exceed bucket size quota. Current size: ${bucketTotalSize} bytes, adding: ${totalFileSize} bytes, limit: ${bucketQuota.maxSize} bytes. Do you want to continue anyway?`,
            onConfirm: () => {
              setQuotaAlert(null)
              resolve()
            }
          })
        }).then(() => proceedWithUpload(bucket, files))
      }
    } else if (bucketTotalSize >= 0) {
      // Fallback check: warn if upload would make bucket very large (> 10GB)
      const totalFileSize = Array.from(files).reduce((sum, file) => sum + file.size, 0)
      const maxReasonableSize = 10 * 1024 * 1024 * 1024 // 10GB
      if (bucketTotalSize + totalFileSize > maxReasonableSize) {
        return new Promise<void>((resolve) => {
          setQuotaAlert({
            open: true,
            message: `Upload would make bucket very large (>10GB). Current size: ${bucketTotalSize} bytes, adding: ${totalFileSize} bytes. Do you want to continue anyway?`,
            onConfirm: () => {
              setQuotaAlert(null)
              resolve()
            }
          })
        }).then(() => proceedWithUpload(bucket, files))
      }
    }

    return proceedWithUpload(bucket, files)
  }

  async function proceedWithUpload(bucket: string, files: FileList) {
    for (const file of Array.from(files)) {
      setUploadingFile(file.name)
      setUploadProgress(0)
      try {
        await uploadFile(bucket, file)
        setUploadProgress(100)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        break
      } finally {
        setUploadingFile(null)
        setUploadProgress(0)
      }
    }
    await listObjects(bucket)
  }

  function confirmDeleteSelected(bucket: string) {
    if (selectedObjectKeys.size === 0) return
    setConfirmState({
      title: t("s3browser.delete_selected_title", "Delete Selected"),
      message: t("s3browser.delete_selected_confirm", `Are you sure you want to delete ${selectedObjectKeys.size} items?`),
      confirmColor: "error",
      onConfirm: () => performDeleteSelected(bucket)
    })
  }

  async function performDeleteSelected(bucket: string) {
    if (selectedObjectKeys.size === 0) return
    setLoading(true)
    try {
      for (const key of selectedObjectKeys) {
        await s3ApiRequest<{ success: boolean }>('delete-object', {
          bucket,
          key
        }, selectedConfigId || undefined)
      }
      await listObjects(bucket)
      setConfirmState(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConfirmState(null)
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
      }, selectedConfigId || undefined)
      // Determine MIME type from file extension
      const extension = key.split('.').pop()?.toLowerCase()
      let mime = 'application/octet-stream'
      if (extension) {
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
          mime = `image/${extension === 'jpg' ? 'jpeg' : extension}`
        } else if (extension === 'json') {
          mime = 'application/json'
        } else if (['js', 'mjs'].includes(extension)) {
          mime = 'text/javascript'
        } else if (['ts', 'tsx'].includes(extension)) {
          mime = 'text/typescript'
        } else if (extension === 'html') {
          mime = 'text/html'
        } else if (extension === 'css') {
          mime = 'text/css'
        } else if (extension === 'xml') {
          mime = 'text/xml'
        } else if (extension === 'md') {
          mime = 'text/markdown'
        } else if (extension === 'py') {
          mime = 'text/x-python'
        } else if (extension === 'java') {
          mime = 'text/x-java'
        } else if (['cpp', 'cc', 'cxx'].includes(extension)) {
          mime = 'text/x-c++'
        } else if (extension === 'c') {
          mime = 'text/x-c'
        } else if (extension === 'php') {
          mime = 'text/x-php'
        } else if (extension === 'rb') {
          mime = 'text/x-ruby'
        } else if (extension === 'go') {
          mime = 'text/x-go'
        } else if (extension === 'rs') {
          mime = 'text/x-rust'
        } else if (extension === 'sh') {
          mime = 'text/x-shell'
        } else if (extension === 'sql') {
          mime = 'text/x-sql'
        } else if (extension === 'txt') {
          mime = 'text/plain'
        } else if (['yaml', 'yml'].includes(extension)) {
          mime = 'text/yaml'
        } else if (extension === 'dart') {
          mime = 'text/x-dart'
        } else if (extension === 'kt') {
          mime = 'text/x-kotlin'
        } else if (extension === 'scala') {
          mime = 'text/x-scala'
        } else if (extension === 'lua') {
          mime = 'text/x-lua'
        } else if (extension === 'r') {
          mime = 'text/x-r'
        } else if (extension === 'swift') {
          mime = 'text/x-swift'
        } else if (extension === 'cs') {
          mime = 'text/x-csharp'
        } else if (extension === 'fs') {
          mime = 'text/x-fsharp'
        } else if (extension === 'hs') {
          mime = 'text/x-haskell'
        } else if (extension === 'ml') {
          mime = 'text/x-ocaml'
        } else if (extension === 'pl') {
          mime = 'text/x-perl'
        } else if (extension === 'tcl') {
          mime = 'text/x-tcl'
        } else if (extension === 'dockerfile') {
          mime = 'text/x-dockerfile'
        } else if (extension === 'makefile') {
          mime = 'text/x-makefile'
        } else if (extension === 'cmake') {
          mime = 'text/x-cmake'
        } else if (extension === 'gradle') {
          mime = 'text/x-gradle'
        } else if (extension === 'toml') {
          mime = 'text/x-toml'
        } else if (extension === 'ini') {
          mime = 'text/x-ini'
        } else if (extension === 'bat') {
          mime = 'text/x-batch'
        } else if (extension === 'ps1') {
          mime = 'text/x-powershell'
        } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension)) {
          mime = `video/${extension}`
        }
      }

      setPreviewDialog({
        open: true,
        key,
        url: res.presignedUrl,
        mime
      })
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
      }, selectedConfigId || undefined)
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



  async function handleUploadDirectory(files: FileList | null) {
    if (!files || !files.length || !selectedBucket) return
    setError(null)

    for (const file of Array.from(files)) {
      setUploadingFile(file.name)
      setUploadProgress(0)
      try {
        const fileWithPath = file as File & { webkitRelativePath: string }
        const relativePath = fileWithPath.webkitRelativePath || file.name
        const key = (prefix || '') + relativePath
        await uploadFile(selectedBucket, file, key)
        setUploadProgress(100)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        break
      } finally {
        setUploadingFile(null)
        setUploadProgress(0)
      }
    }
    await listObjects(selectedBucket)
  }

  useEffect(() => {
    if (selectedConfigId) refreshBuckets()
  }, [selectedConfigId, refreshBuckets])

  if (!keyId && selectedProject && selectedProject.admin_url) {
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
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">
          {selectedProject ? `Project: ${selectedProject.name}` : t('s3browser.cluster_storage', 'Cluster Storage')}
        </Typography>
      </Box>
      {!selectedBucket ? (
        <BucketsList
          buckets={buckets}
          loading={loading}
          onRefresh={refreshBuckets}
          onOpenBucket={handleOpenBucket}
          onDeleteBucket={confirmDeleteBucket}
          onCreateOpen={() => setCreateOpen(true)}
        />
      ) : (
        <ObjectsList
          selectedBucket={selectedBucket}
          bucketRegion={bucketRegion}
          objects={objects}
          loading={loading}
          isListingMore={isListingMore}
          prefix={prefix}
          onPrefixChange={(newPrefix) => { setPrefix(newPrefix); setObjects([]); listObjects(selectedBucket, { prefix: newPrefix }); }}
          onBackToBuckets={() => { setSelectedBucket(null); setPrefix(""); }}
          onRefresh={() => listObjects(selectedBucket)}
          onUpload={(files) => handleUpload(selectedBucket, files)}
          onDeleteSelected={() => confirmDeleteSelected(selectedBucket)}
          onPreview={(key) => handlePreview(selectedBucket, key)}
          onDownload={(key) => handleDownload(selectedBucket, key)}
          onDeleteObject={(key) => confirmDeleteObject(selectedBucket, key)}
          onLoadMore={() => listObjects(selectedBucket, { loadMore: true })}
          selectedObjectKeys={selectedObjectKeys}
          onToggleSelect={(key) => {
            setSelectedObjectKeys((prev) => {
              const next = new Set(prev)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }}
          onSelectAll={(select) => {
            if (select && objects) setSelectedObjectKeys(new Set(objects.filter(o => !o.Key!.slice(prefix.length).includes('/') && !o.Key!.endsWith('/.dir')).map((o) => o.Key!)))
            else setSelectedObjectKeys(new Set())
          }}
          uploadingFile={uploadingFile}
          uploadProgress={uploadProgress}
          continuationToken={continuationToken}
          onUploadDirectory={handleUploadDirectory}
          onDeleteDirectory={confirmDeleteDirectory}
          onCreateDirectory={handleCreateDirectory}
        />
      )}      {error && (
        <Box sx={{ mt: 1 }}>
          <Chip color="error" label={error} />
        </Box>
      )}

      <CreateBucketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        newBucket={newBucket}
        onNewBucketChange={setNewBucket}
        onCreate={createBucket}
      />

      <CopyObjectDialog
        open={copyDialog.open}
        onClose={() => setCopyDialog({ open: false })}
        sourceKey={copyDialog.sourceKey || ""}
        destKey={copyDialog.destKey || ""}
        onDestKeyChange={(value) => setCopyDialog((c) => ({ ...c, destKey: value }))}
        onCopy={() => { }}
      />

      <Dialog
        open={!!quotaAlert}
        onClose={() => setQuotaAlert(null)}
      >
        <DialogTitle>Quota Warning</DialogTitle>
        <DialogContent>
          <Typography>{quotaAlert?.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuotaAlert(null)}>Cancel</Button>
          <Button onClick={quotaAlert?.onConfirm} variant="contained" color="warning">
            Continue Upload
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmColor={confirmState?.confirmColor}
        loading={loading}
        onConfirm={confirmState?.onConfirm || (() => { })}
        onClose={() => setConfirmState(null)}
      />

      <PreviewDialog
        open={previewDialog.open}
        onClose={() => setPreviewDialog({ open: false })}
        key={previewDialog.key || ""}
        url={previewDialog.url}
        mime={previewDialog.mime}
      />
    </Box>
  )
}
