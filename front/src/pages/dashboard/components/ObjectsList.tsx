import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Chip from "@mui/material/Chip"
import CircularProgress from "@mui/material/CircularProgress"
import IconButton from "@mui/material/IconButton"
import LinearProgress from "@mui/material/LinearProgress"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Stack from "@mui/material/Stack"
import TextField from "@mui/material/TextField"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder"
import DeleteIcon from "@mui/icons-material/Delete"
import DownloadIcon from "@mui/icons-material/Download"
import FolderIcon from "@mui/icons-material/Folder"
import RefreshIcon from "@mui/icons-material/Refresh"
import UploadIcon from "@mui/icons-material/Upload"
import VisibilityIcon from "@mui/icons-material/Visibility"
import {
  type _Object as S3Object,
} from "@aws-sdk/client-s3"
import S3Breadcrumbs from "./S3Breadcrumbs"
import DataTable, { type DataTableColumn } from "../../../components/data/DataTable"
import { formatBytes, formatDateTime } from "../../../utils/format"

interface ObjectsListProps {
  selectedBucket: string
  bucketRegion: string | null
  objects: S3Object[]
  loading: boolean
  error?: string | null
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

/** Ligne du navigateur : dossier virtuel (prefixe) ou objet S3. */
interface ObjectRow {
  id: string
  name: string
  objectKey: string | null
  directoryPrefix: string | null
  size: number | null
  lastModified: Date | null
}

/** Prefixe d'identifiant des lignes de type dossier (jamais transmises a la suppression). */
const DIRECTORY_ROW_PREFIX = "dir:"

function getDirectories(objects: S3Object[], prefix: string) {
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

function getFiles(objects: S3Object[], prefix: string) {
  return objects.filter(o => {
    const relative = o.Key!.slice(prefix.length)
    return !relative.includes('/') && !o.Key!.endsWith('/.dir')
  })
}

export default function ObjectsList({
  selectedBucket,
  bucketRegion,
  objects,
  loading,
  error,
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
  uploadingFile,
  uploadProgress,
  continuationToken,
}: ObjectsListProps) {
  const { t, i18n } = useTranslation()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [uploadMenuAnchor, setUploadMenuAnchor] = useState<null | HTMLElement>(null)
  const [createDirName, setCreateDirName] = useState("")

  /** La selection appartient au parent (`selectedObjectKeys`) : la table la reflete. */
  const selectedRowIds = useMemo(() => Array.from(selectedObjectKeys), [selectedObjectKeys])

  const directories = getDirectories(objects, prefix)
  const files = getFiles(objects, prefix)

  const rows: ObjectRow[] = [
    ...directories.map((dir) => ({
      id: `${DIRECTORY_ROW_PREFIX}${dir}`,
      name: dir.slice(prefix.length, -1),
      objectKey: null,
      directoryPrefix: dir,
      size: null,
      lastModified: null,
    })),
    ...files.map((o) => ({
      id: o.Key!,
      name: o.Key!.slice(prefix.length),
      objectKey: o.Key!,
      directoryPrefix: null,
      size: o.Size ?? null,
      lastModified: o.LastModified ?? null,
    })),
  ]

  /**
   * Source de verite unique : `selectedObjectKeys` (portee par le parent). La table notifie la
   * nouvelle selection, on reporte seuls les ecarts — tout se joue dans le meme lot React, donc
   * l'action groupee peut lire directement l'etat du parent sans delai d'ordonnancement.
   */
  const syncSelection = (ids: string[]) => {
    const next = new Set(ids)
    for (const key of selectedObjectKeys) {
      if (!next.has(key)) onToggleSelect(key)
    }
    for (const key of next) {
      if (!selectedObjectKeys.has(key)) onToggleSelect(key)
    }
  }

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
        sx={{
          alignItems: { xs: "stretch", md: "center" },
          p: 2,
          borderBottom: 1,
          borderColor: "divider"
        }}>
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
            aria-label="Create Folder"
            color="primary"
          >
            <CreateNewFolderIcon />
          </IconButton>
        </Box>

        <Stack direction="row" spacing={1} sx={{
          justifyContent: "flex-end"
        }}>
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
        </Stack>

        <Menu anchorEl={uploadMenuAnchor} open={Boolean(uploadMenuAnchor)} onClose={() => setUploadMenuAnchor(null)}>
          <MenuItem onClick={() => { setUploadMenuAnchor(null); fileInputRef.current?.click(); }}>Upload Files</MenuItem>
          <MenuItem onClick={() => { setUploadMenuAnchor(null); dirInputRef.current?.click(); }}>Upload Directory</MenuItem>
        </Menu>

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

      <Box sx={{ flex: 1, overflow: "auto", px: 2, pb: 2 }}>
        <DataTable<ObjectRow>
          rows={rows}
          getRowId={(row) => row.id}
          loading={loading}
          error={error}
          errorTitle={t("s3browser.objects_load_error")}
          retryLabel={t("common.retry")}
          onRetry={onRefresh}
          tableLabel={t("buckets.stats.objects")}
          columns={[
            {
              id: "name",
              header: t("buckets.col.name"),
              minWidth: 240,
              truncate: true,
              textValue: (row) => row.name,
              sortValue: (row) => row.name,
              cell: (row) => row.directoryPrefix ? (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", cursor: "pointer" }}
                  onClick={() => onPrefixChange(row.directoryPrefix!)}
                >
                  <FolderIcon fontSize="small" sx={{ color: "warning.main" }} />
                  <span>{row.name}</span>
                </Stack>
              ) : (
                row.name
              ),
            },
            {
              id: "size",
              header: t("buckets.stats.bytes"),
              numeric: true,
              minWidth: 100,
              sortValue: (row) => row.size,
              cell: (row) => (row.size === null ? "-" : formatBytes(row.size, i18n.language)),
            },
            {
              id: "lastModified",
              header: t("keys.created_label"),
              minWidth: 170,
              sortValue: (row) => row.lastModified,
              cell: (row) => (row.lastModified ? formatDateTime(row.lastModified, i18n.language) : "-"),
            },
            {
              id: "actions",
              header: t("common.actions"),
              align: "right",
              minWidth: 150,
              cell: (row) => (
                <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                  {row.objectKey && (
                    <>
                      <Tooltip title={t("s3browser.preview_title")}>
                        <IconButton
                          size="small"
                          sx={{ width: 32, height: 32 }}
                          aria-label={`${t("s3browser.preview_title")} ${row.name}`}
                          onClick={() => onPreview(row.objectKey!)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t("common.download")}>
                        <IconButton
                          size="small"
                          sx={{ width: 32, height: 32 }}
                          aria-label={`${t("common.download")} ${row.name}`}
                          onClick={() => onDownload(row.objectKey!)}
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip title={t("common.delete")}>
                    <IconButton
                      size="small"
                      color="error"
                      sx={{ width: 32, height: 32 }}
                      aria-label={`${t("common.delete")} ${row.name}`}
                      onClick={() => row.directoryPrefix
                        ? onDeleteDirectory(row.directoryPrefix)
                        : onDeleteObject(row.objectKey!)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ),
            },
          ] satisfies DataTableColumn<ObjectRow>[]}
          searchValue={(row) => row.name}
          pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
          selection={{
            enabled: true,
            selectedIds: selectedRowIds,
            getRowLabel: (row) => row.name,
            isSelectable: (row) => row.objectKey !== null,
            onSelectionChange: syncSelection,
            bulkActions: (_selectedIds, clear) => [
              {
                label: t("s3browser.delete_selected_title"),
                tone: "danger",
                onClick: () => {
                  onDeleteSelected()
                  clear()
                },
              },
            ],
          }}
          emptyState={{
            icon: <FolderIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
            title: t("common.empty"),
            primaryAction: { label: t("common.refresh"), onClick: onRefresh },
          }}
        />
      </Box>

      {continuationToken && (
        <Box sx={{ display: "flex", justifyContent: "center", pb: 2 }}>
          <Button disabled={isListingMore} onClick={onLoadMore}>
            {isListingMore ? <CircularProgress size={16} /> : t("common.load_more")}
          </Button>
        </Box>
      )}
    </Box>
  )
}
