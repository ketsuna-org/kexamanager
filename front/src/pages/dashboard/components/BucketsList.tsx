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
import DeleteIcon from "@mui/icons-material/Delete"
import AddIcon from "@mui/icons-material/Add"
import RefreshIcon from "@mui/icons-material/Refresh"

interface BucketsListProps {
  buckets: { Name?: string; CreationDate?: Date }[]
  loading: boolean
  onRefresh: () => void
  onOpenBucket: (name: string) => void
  onDeleteBucket: (name: string) => void
  onCreateOpen: () => void
}

export default function BucketsList({
  buckets,
  loading,
  onRefresh,
  onOpenBucket,
  onDeleteBucket,
  onCreateOpen,
}: BucketsListProps) {
  const { t } = useTranslation()

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Stack>
          <Typography variant="h6">{t("s3browser.title", { defaultValue: "S3 Browser" })}</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshIcon />} onClick={onRefresh} variant="outlined">
            {t("common.refresh")}
          </Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={onCreateOpen}>
            {t("buckets.actions_add", { defaultValue: "Create bucket" })}
          </Button>
        </Stack>
      </Box>

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
                    <Button size="small" onClick={() => onOpenBucket(b.Name!)}>{t("common.open", { defaultValue: "Open" })}</Button>
                    <IconButton size="small" color="error" onClick={() => onDeleteBucket(b.Name!)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
