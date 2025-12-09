import { useTranslation } from "react-i18next"
import { useRef, useState } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Table from "@mui/material/Table"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TableCell from "@mui/material/TableCell"
import TableBody from "@mui/material/TableBody"
import TableContainer from "@mui/material/TableContainer"
import Paper from "@mui/material/Paper"
import CircularProgress from "@mui/material/CircularProgress"
import IconButton from "@mui/material/IconButton"
import Chip from "@mui/material/Chip"
import DeleteIcon from "@mui/icons-material/Delete"
import RefreshIcon from "@mui/icons-material/Refresh"
import UploadIcon from "@mui/icons-material/Upload"
import VisibilityIcon from "@mui/icons-material/Visibility"
import DownloadIcon from "@mui/icons-material/Download"
import LinearProgress from "@mui/material/LinearProgress"
import FolderIcon from "@mui/icons-material/Folder"
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import Checkbox from "@mui/material/Checkbox"
import {
  type _Object as S3Object,
} from "@aws-sdk/client-s3"
import S3Breadcrumbs from "./S3Breadcrumbs"

interface ObjectsListProps {
  selectedBucket: string
  bucketRegion: string | null
  objects: S3Object[]
  loading: boolean
  isListingMore: boolean
  prefix: string
  onPrefixChange: (newPrefix: string) => void
  onBackToBuckets?: () => void
  onRefresh: () => void
  onUpload: (files: FileList | null) => void
  onUploadDirectory: (files: FileList | null) => void
  onDeleteSelected: () => void
  onPreview: (key: string) => void
  onDownload: (key: string) => void
  onDeleteObject: (key: string) => void
  onDeleteDirectory: (dirPrefix: string) => void
  onCreateDirectory: (dirName: string) => void
  onLoadMore: () => void
  selectedObjectKeys: Set<string>
  onToggleSelect: (key: string) => void
  onSelectAll: (select: boolean) => void
  uploadingFile: string | null
  uploadProgress: number
  continuationToken: string | undefined
}

export default function ObjectsList({
  selectedBucket,
  bucketRegion,
  objects,
  loading,
  isListingMore,
  prefix,
  onPrefixChange,
  onBackToBuckets,
  onRefresh,
  onUpload,
  onUploadDirectory,
  onDeleteSelected,
  onPreview,
  onDownload,
  onDeleteObject,
  onDeleteDirectory,
  onCreateDirectory,
  onLoadMore,
  selectedObjectKeys,
  onToggleSelect,
  onSelectAll,
  uploadingFile,
  uploadProgress,
  continuationToken,
}: ObjectsListProps) {
  const { t } = useTranslation()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [uploadMenuAnchor, setUploadMenuAnchor] = useState<null | HTMLElement>(null)
  const [createDirName, setCreateDirName] = useState("")

  const getDirectories = (objects: S3Object[], prefix: string) => {
    const dirs = new Set<string>()
    for (const obj of objects) {
      const key = obj.Key!
      if (!key.startsWith(prefix)) continue
      const relative = key.slice(prefix.length)
      if (relative.endsWith('/.dir')) {
        const dir = prefix + relative.slice(0, -5) + '/'
        dirs.add(dir)
      } else {
        const slashIndex = relative.indexOf('/')
        if (slashIndex > 0) {
          const dir = prefix + relative.slice(0, slashIndex + 1)
          dirs.add(dir)
        }
      }
    }
    return Array.from(dirs).sort()
  }

  const directories = objects ? getDirectories(objects, prefix) : []
  const files = objects ? objects.filter(o => {
    const relative = o.Key!.slice(prefix.length)
    return !relative.includes('/') && !o.Key!.endsWith('/.dir')
  }) : []

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 2, pt: 2 }}>
        <S3Breadcrumbs
          bucket={selectedBucket}
          prefix={prefix}
          onNavigate={onPrefixChange}
          onBackToBuckets={onBackToBuckets || (() => { })}
        />
      </Box>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", md: "center" }}
        sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          {bucketRegion !== null && (
            <Chip size="small" label={bucketRegion ? `region: ${bucketRegion}` : "region: default"} />
          )}
          <TextField
            size="small"
            placeholder="New folder"
            value={createDirName}
            onChange={(e) => setCreateDirName(e.target.value)}
            sx={{ width: 150 }}
          />
          <IconButton
            onClick={() => onCreateDirectory(createDirName)}
            disabled={!createDirName.trim()}
            title="Create Folder"
            color="primary"
          >
            <CreateNewFolderIcon />
          </IconButton>
        </Box>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="outlined" onClick={onRefresh} startIcon={<RefreshIcon />} size="small">
            {t("common.refresh")}
          </Button>
          <Button
            onClick={(e) => setUploadMenuAnchor(e.currentTarget)}
            startIcon={<UploadIcon />}
            endIcon={<ArrowDropDownIcon />}
            disabled={!!uploadingFile}
            variant="contained"
            size="small"
          >
            {uploadingFile ? `Uploading...` : "Upload"}
          </Button>
          <Button
            color="error"
            disabled={selectedObjectKeys.size === 0}
            onClick={onDeleteSelected}
            variant="outlined"
            startIcon={<DeleteIcon />}
            size="small"
          >
            {t("common.delete", "Delete")}
          </Button>
        </Stack>

        <Menu anchorEl={uploadMenuAnchor} open={Boolean(uploadMenuAnchor)} onClose={() => setUploadMenuAnchor(null)}>
          <MenuItem onClick={() => { setUploadMenuAnchor(null); fileInputRef.current?.click(); }}>Upload Files</MenuItem>
          <MenuItem onClick={() => { setUploadMenuAnchor(null); dirInputRef.current?.click(); }}>Upload Directory</MenuItem>
        </Menu>
        {/* Hidden inputs ... */}
        <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => onUpload(e.target.files)} />
        <input ref={(input) => { dirInputRef.current = input; if (input) input.setAttribute('webkitdirectory', 'true') }} type="file" multiple hidden onChange={(e) => onUploadDirectory(e.target.files)} />
      </Stack>

      {uploadingFile && (
        <Box sx={{ px: 2, py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{uploadingFile}</Typography>
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ flex: 1 }} />
            <Typography variant="body2">{`${uploadProgress}%`}</Typography>
          </Box>
        </Box>
      )}

      <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={files.length > 0 && selectedObjectKeys.size === files.length}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  size="small"
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
                <TableCell colSpan={5} sx={{ textAlign: "center" }}>
                  <CircularProgress size={20} /> {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!loading && objects.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: "center" }}>
                  {t("common.empty", { defaultValue: "No objects" })}
                </TableCell>
              </TableRow>
            )}
            {directories.map(dir => (
              <TableRow key={dir} hover>
                <TableCell></TableCell>
                <TableCell onClick={() => onPrefixChange(dir)} sx={{ cursor: 'pointer' }}><FolderIcon sx={{ mr: 1 }} />{dir.slice(prefix.length, -1)}</TableCell>
                <TableCell align="right">-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDeleteDirectory(dir); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {files.map((o) => (
              <TableRow key={`${o.Key}-${o.ETag}`} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedObjectKeys.has(o.Key!)}
                    onChange={() => onToggleSelect(o.Key!)}
                    size="small"
                  />
                </TableCell>
                <TableCell>{o.Key!.slice(prefix.length)}</TableCell>
                <TableCell align="right">{o.Size}</TableCell>
                <TableCell>{o.LastModified ? new Date(o.LastModified).toLocaleString() : ""}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <IconButton size="small" onClick={() => onPreview(o.Key!)} title="Preview">
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => onDownload(o.Key!)} title="Download">
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => onDeleteObject(o.Key!)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {continuationToken && (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: "center" }}>
                  <Button disabled={isListingMore} onClick={onLoadMore}>
                    {isListingMore ? <CircularProgress size={16} /> : t("common.load_more", { defaultValue: "Load more" })}
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
