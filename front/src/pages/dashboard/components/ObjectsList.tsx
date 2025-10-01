import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
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
import TextField from "@mui/material/TextField"
import Chip from "@mui/material/Chip"
import DeleteIcon from "@mui/icons-material/Delete"
import RefreshIcon from "@mui/icons-material/Refresh"
import UploadIcon from "@mui/icons-material/Upload"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import VisibilityIcon from "@mui/icons-material/Visibility"
import DownloadIcon from "@mui/icons-material/Download"
import LinearProgress from "@mui/material/LinearProgress"
import {
  type _Object as S3Object,
} from "@aws-sdk/client-s3"

interface ObjectsListProps {
  selectedBucket: string
  bucketRegion: string | null
  objects: S3Object[]
  loading: boolean
  isListingMore: boolean
  prefix: string
  onPrefixChange: (prefix: string) => void
  onRefresh: () => void
  onBack: () => void
  onUpload: (files: FileList | null) => void
  onDeleteSelected: () => void
  onPreview: (key: string) => void
  onDownload: (key: string) => void
  onDeleteObject: (key: string) => void
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
  onRefresh,
  onBack,
  onUpload,
  onDeleteSelected,
  onPreview,
  onDownload,
  onDeleteObject,
  onLoadMore,
  selectedObjectKeys,
  onToggleSelect,
  onSelectAll,
  uploadingFile,
  uploadProgress,
  continuationToken,
}: ObjectsListProps) {
  const { t } = useTranslation()

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>{t("common.back", { defaultValue: "Back" })}</Button>
        <Typography variant="subtitle1">{selectedBucket}</Typography>
        {bucketRegion !== null && (
          <Chip size="small" label={bucketRegion ? `region: ${bucketRegion}` : "region: default"} />
        )}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder={t("common.search", { defaultValue: "Prefix" })} value={prefix} onChange={(e) => onPrefixChange(e.target.value)} />
        <Button variant="outlined" onClick={onRefresh} startIcon={<RefreshIcon />}>{t("common.refresh")}</Button>
        <Button component="label" startIcon={<UploadIcon />} disabled={!!uploadingFile}>
          {uploadingFile ? `Uploading ${uploadingFile}...` : t("common.upload", { defaultValue: "Upload" })}
          <input type="file" multiple hidden onChange={(e) => onUpload(e.target.files)} />
        </Button>
        {uploadingFile && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ flex: 1 }} />
            <Typography variant="body2">{`${uploadProgress}%`}</Typography>
          </Box>
        )}
        <Button color="error" disabled={selectedObjectKeys.size === 0} onClick={onDeleteSelected}>
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
                  onChange={(e) => onSelectAll(e.target.checked)}
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
            {objects.map((o) => (
              <TableRow key={`${o.Key}-${o.ETag}`} hover>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedObjectKeys.has(o.Key!)}
                    onChange={() => onToggleSelect(o.Key!)}
                  />
                </TableCell>
                <TableCell>{o.Key}</TableCell>
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
