import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Stack from "@mui/material/Stack"
import IconButton from "@mui/material/IconButton"
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import RefreshIcon from "@mui/icons-material/Refresh"
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined"
import DataTable, { type DataTableColumn } from "../../../components/data/DataTable"
import PageHeader from "../../../components/PageHeader"
import { useProject } from "../../../contexts/ProjectContext"
import { projectBadge } from "../projectBadge"
import { formatDateTime } from "../../../utils/format"

interface BucketsListProps {
  buckets: { Name?: string; CreationDate?: Date }[]
  loading: boolean
  error?: boolean
  onRefresh: () => void
  onRetry?: () => void
  onOpenBucket: (name: string) => void
  onDeleteBucket: (name: string) => void
  onCreateOpen: () => void
}

type BucketRow = BucketsListProps["buckets"][number]

export default function BucketsList({
  buckets,
  loading,
  error = false,
  onRefresh,
  onRetry,
  onOpenBucket,
  onDeleteBucket,
  onCreateOpen,
}: BucketsListProps) {
  const { t, i18n } = useTranslation()
  const { selectedProject } = useProject()

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", p: 2 }}>
      <PageHeader
        title={t("dashboard.buckets")}
        badge={projectBadge(selectedProject)}
        action={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RefreshIcon />} onClick={onRefresh} variant="outlined">
              {t("common.refresh")}
            </Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={onCreateOpen}>
              {t("buckets.actions_add")}
            </Button>
          </Stack>
        }
      />

      <Box sx={{ flex: 1, overflow: "auto" }}>
        <DataTable<BucketRow>
          rows={buckets}
          getRowId={(bucket, index) => bucket.Name ?? `row-${index}`}
          loading={loading}
          error={error ? t("common.load_error") : null}
          errorTitle={t("dashboard.buckets")}
          retryLabel={t("common.retry")}
          onRetry={onRetry}
          tableLabel={t("dashboard.buckets")}
          columns={[
            {
              id: "name",
              header: t("buckets.col.id"),
              cell: (bucket) => bucket.Name ?? "-",
              sortValue: (bucket) => bucket.Name ?? "",
              truncate: true,
              textValue: (bucket) => bucket.Name ?? "-",
              minWidth: 180,
            },
            {
              id: "created",
              header: t("buckets.col.creationDate"),
              cell: (bucket) => (bucket.CreationDate ? formatDateTime(bucket.CreationDate, i18n.language) : ""),
              sortValue: (bucket) => bucket.CreationDate ?? null,
              minWidth: 150,
            },
            {
              id: "actions",
              header: t("buckets.actions"),
              align: "right" as const,
              minWidth: 140,
              cell: (bucket) => (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                  <Button size="small" aria-label={`${t("common.open")} ${bucket.Name ?? ""}`} onClick={() => onOpenBucket(bucket.Name!)}>
                    {t("common.open")}
                  </Button>
                  <IconButton
                    size="small"
                    color="error"
                    sx={{ width: 32, height: 32 }}
                    aria-label={`${t("common.delete")} ${bucket.Name ?? ""}`}
                    onClick={() => onDeleteBucket(bucket.Name!)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ),
            },
          ] satisfies DataTableColumn<BucketRow>[]}
          searchValue={(bucket) => bucket.Name ?? ""}
          defaultSort={{ id: "created", dir: "desc" }}
          pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
          emptyState={{
            icon: <StorageOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
            title: t("buckets.empty"),
            primaryAction: { label: t("buckets.actions_add"), onClick: onCreateOpen },
          }}
        />
      </Box>
    </Box>
  )
}
