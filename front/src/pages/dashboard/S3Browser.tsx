import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Chip from "@mui/material/Chip"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Button from "@mui/material/Button"
import {
  BucketsList,
  ObjectsList,
  CreateBucketDialog,
  CopyObjectDialog,
  PreviewDialog,
} from './components'
import { GetBucketInfo } from '../../utils/apiWrapper'
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

export default function S3Browser() {
  const { t } = useTranslation()
  const keyId = useS3KeyId()
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
  const [preview, setPreview] = useState<{ key: string; url?: string; mime?: string } | null>(null)
  const [selectedObjectKeys, setSelectedObjectKeys] = useState<Set<string>>(new Set())
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; sourceKey?: string; destKey?: string }>({ open: false })
  const [bucketRegion, setBucketRegion] = useState<string | null>(null)
  const [quotaAlert, setQuotaAlert] = useState<{ open: boolean; message: string; onConfirm: () => void } | null>(null)

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
      const res = await s3ApiRequest<{ objects: { key: string; size: number; lastModified: string; etag: string }[]; continuationToken?: string; isTruncated: boolean; totalSize: number }>('list-objects', {
        bucket,
        prefix: prefix || undefined
      })
      console.log('List objects response:', res)
      const items = res.objects.map(obj => ({
        Key: obj.key,
        Size: obj.size,
        LastModified: new Date(obj.lastModified),
        ETag: obj.etag
      }))
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
    setContinuationToken(undefined)
    setBucketRegion(null)
    // Try to get bucket info for quota checking
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

  function uploadFile(bucket: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('keyId', getStoredKeyId() || '')
      formData.append('token', getStoredToken() || '')
      formData.append('bucket', bucket)
      formData.append('key', file.name)
      formData.append('fileSize', file.size.toString())
      formData.append('file', file)

      xhr.open('POST', '/api/s3/put-object')
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
      {!selectedBucket ? (
        <BucketsList
          buckets={buckets}
          loading={loading}
          onRefresh={refreshBuckets}
          onOpenBucket={handleOpenBucket}
          onDeleteBucket={deleteBucket}
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
          onPrefixChange={setPrefix}
          onRefresh={() => listObjects(selectedBucket)}
          onBack={() => setSelectedBucket(null)}
          onUpload={(files) => handleUpload(selectedBucket, files)}
          onDeleteSelected={() => handleDeleteSelected(selectedBucket)}
          onPreview={(key) => handlePreview(selectedBucket, key)}
          onDownload={(key) => handleDownload(selectedBucket, key)}
          onDeleteObject={(key) => handleDeleteObject(selectedBucket, key)}
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
            if (select) setSelectedObjectKeys(new Set(objects.map((o) => o.Key!)))
            else setSelectedObjectKeys(new Set())
          }}
          uploadingFile={uploadingFile}
          uploadProgress={uploadProgress}
          continuationToken={continuationToken}
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
        onCopy={() => {}}
      />

      <PreviewDialog
        open={!!preview}
        onClose={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null) }}
        key={preview?.key || ""}
        url={preview?.url}
        mime={preview?.mime}
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
    </Box>
  )
}
