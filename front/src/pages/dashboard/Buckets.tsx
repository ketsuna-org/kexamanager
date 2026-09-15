import { useState, useEffect, useCallback, useMemo, type SubmitEvent } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Alert from "@mui/material/Alert"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import FormControlLabel from "@mui/material/FormControlLabel"
import TextField from "@mui/material/TextField"
import Switch from "@mui/material/Switch"
import Divider from "@mui/material/Divider"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import Autocomplete from "@mui/material/Autocomplete"
import Chip from "@mui/material/Chip"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import { useTheme } from "@mui/material/styles"
import useMediaQuery from "@mui/material/useMediaQuery"
import { CreateBucket, DeleteBucket, GetBucketInfo, AddBucketAlias, RemoveBucketAlias, UpdateBucket, ListKeys, AllowBucketKey, DenyBucketKey } from "../../utils/apiWrapper"
import type { components } from "../../types/openapi"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import PageHeader from "../../components/PageHeader"
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined"
import { useProject, type ProjectSummary } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"
import { formatBytes, formatDateTime } from "../../utils/format"
import { useCapabilities } from "../../hooks/useCapabilities"
import { useStorageOverview } from "../../hooks/useStorageOverview"
import { useBucketUsage } from "../../hooks/useBucketUsage"
import { boundedValue, listS3Buckets, matchUsageEntry, resolveStatsSources } from "../../api/storage"
import type { BucketUsageEntry } from "../../api/storage"
import StorageUsagePanel, { QuotaBar } from "./components/StorageUsagePanel"

type Bucket = components["schemas"]["ListBucketsResponseItem"]

/**
 * Ligne du tableau `/buckets`. Les compteurs viennent de l'agregat admin
 * (`/stats/buckets`) quand il existe, sinon du balayage S3 (`/s3/bucket-usage`),
 * qui fonctionne pour tous les types de projet : `statsAvailable` a `false`
 * signifie qu'aucune source n'a pu mesurer le bucket, l'UI rend alors un tiret
 * plutot qu'un zero trompeur. `statsPartial` a `true` signale une borne basse
 * (balayage S3 borne), affichee avec le marqueur `>=`.
 */
interface BucketRow extends Bucket {
    objects?: number
    bytes?: number
    quotas?: { maxSize: number | null; maxObjects: number | null } | null
    quotaUsagePercent?: number | null
    statsAvailable?: boolean
    statsPartial?: boolean
}

/** Alias globaux puis locaux d'un bucket, aplatis pour l'affichage et la recherche. */
function bucketAliases(bucket: BucketRow): string[] {
    return [...(bucket.globalAliases ?? []), ...(bucket.localAliases?.map((alias) => alias.alias) ?? [])]
}

/** Entree `bucket-usage` d'un bucket du listing : par nom, puis par alias global. */
function usageEntryFor(bucket: Bucket, byName: ReadonlyMap<string, BucketUsageEntry>): BucketUsageEntry | undefined {
    return matchUsageEntry([bucket.id, ...(bucket.globalAliases ?? [])], byName)
}

/** Message lisible à partir d'une erreur inconnue (Error, string) avec repli traduit. */
function extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === "string" && err) return err
    return fallback
}

const sizeUnits = [
  { label: 'Octet', value: 'B', multiplier: 1 },
  { label: 'Ko', value: 'KB', multiplier: 1024 },
  { label: 'Mo', value: 'MB', multiplier: 1024 ** 2 },
  { label: 'Go', value: 'GB', multiplier: 1024 ** 3 },
]

/** Largeur minimale du bouton de validation pour qu'il ne se decale pas pendant l'envoi. */
const SUBMIT_BUTTON_SX = { minWidth: 96 } as const

interface BucketsProps {
    /** Project still handed over by the App.tsx call site; the shared context wins. */
    selectedProject?: ProjectSummary | null
}

export default function Buckets({ selectedProject: legacyProject }: BucketsProps) {
    const { t, i18n } = useTranslation()
    const { selectedProject: contextProject } = useProject()
    const selectedProject = contextProject ?? legacyProject ?? null
    const [selectedConfigId, setSelectedConfigId] = useState<number | null>(selectedProject?.id || null)

    const projectId = selectedProject?.id ?? null
    // Source des compteurs (D12) : l'agregat admin Garage quand le proxy le
    // declare. Le balayage S3 pur, lui, ne demande aucun identifiant cote
    // navigateur : le proxy resout la paire de cles depuis la configuration du
    // projet. La colonne Quota, elle, reste une metrique Garage.
    const capabilities = useCapabilities(projectId)
    const sources = resolveStatsSources(capabilities.data)
    const garageUsageEnabled = sources.counters === "garage"
    const s3UsageEnabled = sources.counters === "s3"
    const quotasEnabled = sources.quotas
    // Alias de bucket et fiche bucket sont des notions d'administration (API v2) :
    // hors Garage admin elles n'existent pas, donc on ne les rend pas du tout.
    const adminAvailable = capabilities.data?.admin.available === true
    const overview = useStorageOverview(garageUsageEnabled ? projectId : null)

    // Update selectedConfigId when selectedProject changes
    useEffect(() => {
        setSelectedConfigId(selectedProject?.id || null)
    }, [selectedProject])
    const [buckets, setBuckets] = useState<Bucket[]>([])
    // Le balayage S3 part du listing des buckets : il ne demarre donc jamais a
    // vide, et la cle triee evite de relancer un scan a chaque rendu.
    const s3UsageBucketNames = useMemo(() => buckets.map((bucket) => bucket.id), [buckets])
    const usage = useBucketUsage(s3UsageEnabled ? projectId : null, s3UsageBucketNames)
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [toDeleteId, setToDeleteId] = useState<string | null>(null)
    // detailsOpen not needed: we use selectedBucket to control details dialog
    const [selectedBucket, setSelectedBucket] = useState<components["schemas"]["GetBucketInfoResponse"] | null>(null)
    const [editing, setEditing] = useState(false)
    const [savingDetails, setSavingDetails] = useState(false)
    const [detailsError, setDetailsError] = useState<string | null>(null)
    const [detailsForm, setDetailsForm] = useState<{
        quotasMaxSize: string
        quotasMaxObjects: string
        websiteEnabled: boolean
        websiteIndex: string
        websiteError: string
        quotasMaxSizeUnit: string
    }>({ quotasMaxSize: "", quotasMaxObjects: "", websiteEnabled: false, websiteIndex: "", websiteError: "", quotasMaxSizeUnit: "MB" })
    const [allKeys, setAllKeys] = useState<components["schemas"]["ListKeysResponseItem"][]>([])
    const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([])
    const [aliasInput, setAliasInput] = useState("")
    const [removeAliasConfirmOpen, setRemoveAliasConfirmOpen] = useState(false)
    const [aliasToRemove, setAliasToRemove] = useState<{ kind: "global" | "local"; value: string; accessKeyId?: string } | null>(null)
    const [form, setForm] = useState<{
        globalAlias: string
        localAlias: string
        localAccessKeyId: string
        quotasMaxSize: string
        quotasMaxObjects: string
        websiteEnabled: boolean
        websiteIndex: string
        websiteError: string
        quotasMaxSizeUnit: string
    }>({
        globalAlias: "",
        localAlias: "",
        localAccessKeyId: "",
        quotasMaxSize: "",
        quotasMaxObjects: "",
        websiteEnabled: false,
        websiteIndex: "",
        websiteError: "",
        quotasMaxSizeUnit: "MB",
    })

    // theme / media query to make details dialog full screen on small devices
    const theme = useTheme()
    const isSmall = useMediaQuery(theme.breakpoints.down("sm"))

    function getBestUnit(bytes: number): { value: string, display: number } {
        if (bytes === 0) return { value: 'MB', display: 0 }
        const units = ['B', 'KB', 'MB', 'GB']
        const multipliers = [1, 1024, 1024 ** 2, 1024 ** 3]
        for (let i = units.length - 1; i >= 0; i--) {
            if (bytes >= multipliers[i]) {
                return { value: units[i], display: Math.round((bytes / multipliers[i]) * 100) / 100 } // round to 2 decimals
            }
        }
        return { value: 'B', display: bytes }
    }

    function openModal() {
        setForm({ globalAlias: "", localAlias: "", localAccessKeyId: "", quotasMaxSize: "", quotasMaxObjects: "", websiteEnabled: false, websiteIndex: "", websiteError: "", quotasMaxSizeUnit: "MB" })
        setCreateError(null)
        setOpen(true)
    }
    function closeModal() {
        setOpen(false)
        setCreateError(null)
    }

    /** Soumission au clavier (Entree) du dialogue de creation. */
    function handleCreateSubmit() {
        if (submitting) return
        void submit()
    }

    async function submit() {
        // Build CreateBucket payload using typed shapes
        const createReq: components["schemas"]["CreateBucketRequest"] = {}
        if (form.globalAlias) createReq.globalAlias = form.globalAlias
        if (form.localAlias) createReq.localAlias = { alias: form.localAlias, accessKeyId: form.localAccessKeyId || "" }

        setSubmitting(true)
        setActionError(null)
        setCreateError(null)
        try {
            const created = await CreateBucket(createReq)
            const bucketId = created?.id

            const updateBody: components["schemas"]["UpdateBucketRequestBody"] = {}
            const quotas: components["schemas"]["ApiBucketQuotas"] = {}
            const unitMultiplier = sizeUnits.find(u => u.value === form.quotasMaxSizeUnit)?.multiplier || 1
            const maxSizeBytes = Number(form.quotasMaxSize) * unitMultiplier
            if (maxSizeBytes > 0) quotas.maxSize = maxSizeBytes
            if (form.quotasMaxObjects) quotas.maxObjects = Number(form.quotasMaxObjects)
            if (quotas.maxSize !== undefined || quotas.maxObjects !== undefined) updateBody.quotas = quotas
            if (form.websiteEnabled) updateBody.websiteAccess = { enabled: true, indexDocument: form.websiteIndex || undefined, errorDocument: form.websiteError || undefined }

            if (bucketId && (updateBody.quotas || updateBody.websiteAccess)) {
                await UpdateBucket({ id: bucketId }, updateBody)
            }

            await refreshRows()
            setOpen(false)
        } catch (e) {
            setCreateError(extractErrorMessage(e, t("buckets.create_error")))
        } finally {
            setSubmitting(false)
        }
    }

    const fetchBuckets = useCallback(async () => {
        if (!selectedConfigId || garageUsageEnabled) return
        setLoading(true)
        setLoadError(null)
        try {
            // Sans agregat admin, le listing vient de l'API S3 elle-meme : l'API
            // d'administration `/v2/ListBuckets` n'a pas de reponse sur un projet
            // sans admin Garage, et une liste vide serait un mensonge.
            const listed = await listS3Buckets(selectedConfigId)
            setBuckets(
                listed.map((bucket) => ({
                    id: bucket.name,
                    created: bucket.creationDate ?? "",
                    globalAliases: [],
                    localAliases: [],
                })),
            )
        } catch (e) {
            setBuckets([])
            setLoadError(extractErrorMessage(e, t("common.load_error")))
        } finally {
            setLoading(false)
        }
    }, [selectedConfigId, garageUsageEnabled, t])

    /** Buckets de l'agregat admin, projetes dans les colonnes de la table. */
    const statRows: BucketRow[] = useMemo(
        () =>
            (overview.data?.buckets ?? []).map((stat) => ({
                id: stat.id,
                created: stat.created,
                globalAliases: stat.globalAliases,
                localAliases: stat.localAliases.map((alias) => ({ accessKeyId: alias.accessKeyId, alias: alias.alias })),
                objects: stat.objects,
                bytes: stat.bytes,
                quotas: stat.quotas,
                quotaUsagePercent: stat.quotaUsagePercent,
                statsAvailable: stat.statsAvailable,
                statsPartial: false,
            })),
        [overview.data],
    )

    /** Compteurs S3 (`bucket-usage`) indexes par nom de bucket. */
    const usageByName = useMemo(() => {
        const index = new Map<string, BucketUsageEntry>()
        for (const entry of usage.data?.buckets ?? []) index.set(entry.name, entry)
        return index
    }, [usage.data])

    /**
     * Lignes affichees : agregat admin quand il existe, sinon le listing S3
     * enrichi des compteurs `bucket-usage`. Un bucket en erreur reste un tiret
     * (`statsAvailable:false`), un balayage borne une borne basse (`>=`).
     */
    const rows: BucketRow[] = useMemo(() => {
        if (garageUsageEnabled) return statRows
        return buckets.map((bucket) => {
            const entry = usageEntryFor(bucket, usageByName)
            if (!entry || entry.error !== null) {
                return { ...bucket, statsAvailable: false, statsPartial: false }
            }
            return {
                ...bucket,
                objects: entry.objects,
                bytes: entry.bytes,
                statsAvailable: true,
                statsPartial: !entry.complete,
            }
        })
    }, [garageUsageEnabled, statRows, buckets, usageByName])

    // La reponse de capacites doit etre arrivee (succes ou echec) avant de
    // conclure qu'aucune source n'existe : sinon l'alerte clignote au 1er rendu.
    const rowsLoading = garageUsageEnabled ? capabilities.loading || overview.loading : loading
    const rowsError = garageUsageEnabled ? overview.error : loadError
    /** Au moins une valeur affichee est une borne basse : on l'explique une fois. */
    const anyPartialRow = rows.some((row) => row.statsAvailable === true && row.statsPartial === true)

    /** Recharge la source reellement affichee (agregat admin ou listing + S3). */
    async function refreshRows() {
        if (garageUsageEnabled) {
            overview.refresh()
            return
        }
        await fetchBuckets()
        if (s3UsageEnabled) usage.refresh()
    }

    /**
     * Colonnes de compteurs (D12). `Objets`/`Taille` sont construites des qu'une
     * source repond (agregat admin ou balayage S3), la colonne `Quota` seulement
     * quand l'admin Garage expose des quotas : c'est la seule source de chiffres
     * de quota. Un bucket non mesurable rend un
     * tiret, jamais un zero, et une valeur bornee garde le marqueur `>=`.
     */
    const counterColumns: DataTableColumn<BucketRow>[] = [
        {
            id: "objects",
            header: t("buckets.col.objects"),
            numeric: true,
            align: "right",
            minWidth: 110,
            sortValue: (row) => (row.statsAvailable ? row.objects ?? 0 : null),
            cell: (row) => (row.statsAvailable
                ? boundedValue((row.objects ?? 0).toLocaleString(i18n.language), !row.statsPartial)
                : "—"),
        },
        {
            id: "bytes",
            header: t("buckets.col.size"),
            numeric: true,
            align: "right",
            minWidth: 120,
            sortValue: (row) => (row.statsAvailable ? row.bytes ?? 0 : null),
            cell: (row) => (row.statsAvailable
                ? boundedValue(formatBytes(row.bytes ?? 0, i18n.language), !row.statsPartial)
                : "—"),
        },
    ]

    const quotaColumn: DataTableColumn<BucketRow> = {
        id: "quota",
        header: t("buckets.col.quota"),
        minWidth: 170,
        sortValue: (row) => row.quotaUsagePercent ?? null,
        cell: (row) => <QuotaBar percent={row.quotaUsagePercent ?? null} maxSize={row.quotas?.maxSize ?? null} />,
    }

    const statColumns: DataTableColumn<BucketRow>[] = quotasEnabled
        ? [...counterColumns, quotaColumn]
        : counterColumns

    const aliasColumn: DataTableColumn<BucketRow> = {
        id: "aliases",
        header: t("buckets.col.aliases"),
        cell: (bucket) => bucketAliases(bucket).join(", ") || "-",
        sortValue: (bucket) => bucketAliases(bucket).join(", "),
        truncate: true,
        textValue: (bucket) => bucketAliases(bucket).join(", ") || "-",
        minWidth: 150,
    }

    async function fetchKeysList() {
        try {
            const res = await ListKeys()
            if (Array.isArray(res)) setAllKeys(res)
            else setAllKeys([])
        } catch (e) {
            setAllKeys([])
            setActionError(extractErrorMessage(e, t("buckets.keys_load_error")))
        }
    }

    useEffect(() => {
        fetchBuckets()
    }, [fetchBuckets])

    function confirmDelete(id: string) {
        setToDeleteId(id)
        setDeleteDialogOpen(true)
    }

    async function doDelete() {
        if (!toDeleteId) return
        setActionError(null)
        try {
            await DeleteBucket({ id: toDeleteId })
            await refreshRows()
        } catch (e) {
            setActionError(extractErrorMessage(e, t("buckets.delete_error")))
        } finally {
            setDeleteDialogOpen(false)
            setToDeleteId(null)
        }
    }

    async function openDetails(id: string) {
        setActionError(null)
        setDetailsError(null)
        try {
            const res = await GetBucketInfo({ id })
            setSelectedBucket(res)
            // populate details form from response
            setEditing(false)
            const maxSize = res?.quotas?.maxSize || 0
            const { value: unit, display: size } = getBestUnit(maxSize)
            setDetailsForm({
                quotasMaxSize: size.toString(),
                quotasMaxSizeUnit: unit,
                quotasMaxObjects: res?.quotas?.maxObjects !== undefined ? String(res.quotas.maxObjects) : "",
                websiteEnabled: !!res?.websiteAccess,
                websiteIndex: res?.websiteConfig?.indexDocument || "",
                websiteError: res?.websiteConfig?.errorDocument || "",
            })
            // selected keys
            setSelectedKeyIds(res?.keys?.map((k) => k.accessKeyId) ?? [])
            // fetch available keys for selector
            fetchKeysList()
        } catch (e) {
            setSelectedBucket(null)
            setActionError(extractErrorMessage(e, t("buckets.details_load_error")))
        }
    }

    async function saveDetails() {
        if (!selectedBucket) return
        setSavingDetails(true)
        setActionError(null)
        setDetailsError(null)
        try {
            const updateBody: components["schemas"]["UpdateBucketRequestBody"] = {}
            const quotas: components["schemas"]["ApiBucketQuotas"] = {}
            const unitMultiplier = sizeUnits.find(u => u.value === detailsForm.quotasMaxSizeUnit)?.multiplier || 1
            const maxSizeBytes = Number(detailsForm.quotasMaxSize) * unitMultiplier
            if (maxSizeBytes > 0) quotas.maxSize = maxSizeBytes
            if (detailsForm.quotasMaxObjects) quotas.maxObjects = Number(detailsForm.quotasMaxObjects)
            if (quotas.maxSize !== undefined || quotas.maxObjects !== undefined) updateBody.quotas = quotas

            if (detailsForm.websiteEnabled) updateBody.websiteAccess = { enabled: true, indexDocument: detailsForm.websiteIndex || undefined, errorDocument: detailsForm.websiteError || undefined }
            else updateBody.websiteAccess = { enabled: false }

            await UpdateBucket({ id: selectedBucket.id }, updateBody)
            // handle key assignments: compute diffs and call Allow/Deny
            const currentKeyIds = selectedBucket.keys?.map((k) => k.accessKeyId) ?? []
            const toAdd = selectedKeyIds.filter((id) => !currentKeyIds.includes(id))
            const toRemove = currentKeyIds.filter((id) => !selectedKeyIds.includes(id))
            // grant full perms when adding, and revoke when removing
            await Promise.all([
                ...toAdd.map((id) => AllowBucketKey({ accessKeyId: id, bucketId: selectedBucket.id, permissions: { owner: true, read: true, write: true } })),
                ...toRemove.map((id) => DenyBucketKey({ accessKeyId: id, bucketId: selectedBucket.id, permissions: { owner: true, read: true, write: true } })),
            ])
            // refresh
            const refreshed = await GetBucketInfo({ id: selectedBucket.id })
            setSelectedBucket(refreshed)
            await refreshRows()
            setEditing(false)
        } catch (e) {
            setDetailsError(extractErrorMessage(e, t("buckets.details.save_error")))
        } finally {
            setSavingDetails(false)
        }
    }

    async function doAddAlias() {
        if (!selectedBucket || !aliasInput) return
        setActionError(null)
        setDetailsError(null)
        try {
            await AddBucketAlias({ bucketId: selectedBucket.id, globalAlias: aliasInput })
            // refresh details and list
            const refreshed = await GetBucketInfo({ id: selectedBucket.id })
            setSelectedBucket(refreshed)
            await refreshRows()
            setAliasInput("")
        } catch (e) {
            setDetailsError(extractErrorMessage(e, t("buckets.alias_add_error")))
        }
    }

    function requestRemoveAlias(kind: "global" | "local", value: string, accessKeyId?: string) {
        setAliasToRemove({ kind, value, accessKeyId })
        setRemoveAliasConfirmOpen(true)
    }

    async function doRemoveAlias() {
        if (!selectedBucket || !aliasToRemove) return
        setActionError(null)
        setDetailsError(null)
        try {
            if (aliasToRemove.kind === "global") {
                await RemoveBucketAlias({ bucketId: selectedBucket.id, globalAlias: aliasToRemove.value })
            } else {
                await RemoveBucketAlias({ bucketId: selectedBucket.id, accessKeyId: aliasToRemove.accessKeyId!, localAlias: aliasToRemove.value })
            }
            const refreshed = await GetBucketInfo({ id: selectedBucket.id })
            setSelectedBucket(refreshed)
            await refreshRows()
        } catch (e) {
            setDetailsError(extractErrorMessage(e, t("buckets.alias_remove_error")))
        } finally {
            setRemoveAliasConfirmOpen(false)
            setAliasToRemove(null)
        }
    }

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <PageHeader
                title={t("dashboard.buckets")}
                subtitle={t("dashboard.buckets_desc")}
                badge={projectBadge(selectedProject)}
                action={
                    <Button
                        variant="contained"
                        onClick={openModal}
                        sx={{ whiteSpace: "nowrap" }}
                    >
                        {t("dashboard.buckets_add")}
                    </Button>
                }
            >
                {actionError && (
                    <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
                        {actionError}
                    </Alert>
                )}
                {s3UsageEnabled && usage.error && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t("buckets.stats.usage_error", { message: usage.error })}
                    </Alert>
                )}
            </PageHeader>

            {(overview.data !== null || usage.data !== null) && (
                <Box sx={{ mb: 2 }}>
                    <StorageUsagePanel
                        overview={garageUsageEnabled ? overview.data : null}
                        usage={s3UsageEnabled ? usage.data : null}
                        showQuotas={quotasEnabled}
                    />
                </Box>
            )}

            {anyPartialRow && (
                <Typography variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary" }}>
                    {t("buckets.stats.atLeast")}
                </Typography>
            )}

            <Box sx={{ flex: 1, overflow: "auto" }}>
                <DataTable<Bucket>
                    rows={rows}
                    getRowId={(bucket) => bucket.id}
                    loading={rowsLoading}
                    error={rowsError}
                    retryLabel={t("common.retry")}
                    onRetry={() => { void refreshRows() }}
                    tableLabel={t("dashboard.buckets")}
                    columns={[
                        {
                            id: "id",
                            header: t("buckets.col.id"),
                            cell: (bucket) => bucket.id,
                            sortValue: (bucket) => bucket.id,
                            truncate: true,
                            textValue: (bucket) => bucket.id,
                            minWidth: 180,
                        },
                        ...(adminAvailable ? [aliasColumn] : []),
                        {
                            id: "created",
                            header: t("buckets.col.creationDate"),
                            cell: (bucket) => formatDateTime(bucket.created, i18n.language),
                            sortValue: (bucket) => new Date(bucket.created),
                            minWidth: 150,
                        },
                        ...statColumns,
                        {
                            id: "actions",
                            header: t("buckets.actions"),
                            align: "right" as const,
                            minWidth: 160,
                            cell: (bucket) => (
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                                    {adminAvailable && (
                                        <Button size="small" aria-label={`${t("common.details")} ${bucket.id}`} onClick={() => openDetails(bucket.id)}>
                                            {t("common.details")}
                                        </Button>
                                    )}
                                    <Button size="small" color="error" aria-label={`${t("buckets.actions_delete")} ${bucket.id}`} onClick={() => confirmDelete(bucket.id)}>
                                        {t("buckets.actions_delete")}
                                    </Button>
                                </Stack>
                            ),
                        },
                    ] satisfies DataTableColumn<BucketRow>[]}
                    searchValue={(bucket) => [bucket.id, ...bucketAliases(bucket)].join(" ")}
                    defaultSort={{ id: "created", dir: "desc" }}
                    pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                    emptyState={{
                        icon: <StorageOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                        title: t("buckets.empty"),
                        primaryAction: { label: t("dashboard.buckets_add"), onClick: openModal },
                    }}
                />
            </Box>

            <Dialog
                open={open}
                onClose={closeModal}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: {
                        component: "form",
                        onSubmit: (event: SubmitEvent<HTMLDivElement>) => {
                            event.preventDefault()
                            handleCreateSubmit()
                        },
                    },
                }}
            >
                <DialogTitle>{t("buckets.modal.title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {createError && (
                            <Alert severity="error" onClose={() => setCreateError(null)}>
                                {createError}
                            </Alert>
                        )}
                        <TextField
                            autoFocus
                            margin="dense"
                            label={t("buckets.form.globalAlias")}
                            type="text"
                            fullWidth
                            value={form.globalAlias}
                            onChange={(e) => setForm((f) => ({ ...f, globalAlias: e.target.value }))}
                        />
                        <Stack direction="row" spacing={1} sx={{
                            alignItems: "center"
                        }}>
                            <TextField
                                margin="dense"
                                label={t("buckets.form.localAlias")}
                                type="text"
                                fullWidth
                                value={form.localAlias}
                                onChange={(e) => setForm((f) => ({ ...f, localAlias: e.target.value }))}
                            />
                            <TextField
                                margin="dense"
                                label={t("buckets.form.localAccessKeyId")}
                                type="text"
                                sx={{ minWidth: 200 }}
                                value={form.localAccessKeyId}
                                onChange={(e) => setForm((f) => ({ ...f, localAccessKeyId: e.target.value }))}
                            />
                        </Stack>

                        <Stack direction="row" spacing={1} sx={{
                            alignItems: "center"
                        }}>
                            <TextField
                                margin="dense"
                                label={t("buckets.form.quotas.maxSize")}
                                type="number"
                                value={form.quotasMaxSize}
                                onChange={(e) => setForm((f) => ({ ...f, quotasMaxSize: e.target.value }))}
                            />
                            <Select
                                size="small"
                                value={form.quotasMaxSizeUnit}
                                onChange={(e) => setForm((f) => ({ ...f, quotasMaxSizeUnit: e.target.value }))}
                                slotProps={{ input: { "aria-label": t("buckets.form.quotas.maxSize") } }}
                            >
                                {sizeUnits.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                            </Select>
                            <TextField
                                margin="dense"
                                label={t("buckets.form.quotas.maxObjects")}
                                type="number"
                                value={form.quotasMaxObjects}
                                onChange={(e) => setForm((f) => ({ ...f, quotasMaxObjects: e.target.value }))}
                            />
                        </Stack>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={form.websiteEnabled}
                                    onChange={(e) => setForm((f) => ({ ...f, websiteEnabled: e.target.checked }))}
                                />
                            }
                            label={t("buckets.form.website.enabled")}
                        />
                        {form.websiteEnabled && (
                            <Stack>
                                <TextField
                                    margin="dense"
                                    label={t("buckets.form.website.indexDocument")}
                                    value={form.websiteIndex}
                                    onChange={(e) => setForm((f) => ({ ...f, websiteIndex: e.target.value }))}
                                />
                                <TextField
                                    margin="dense"
                                    label={t("buckets.form.website.errorDocument")}
                                    value={form.websiteError}
                                    onChange={(e) => setForm((f) => ({ ...f, websiteError: e.target.value }))}
                                />
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeModal}>{t("common.cancel")}</Button>
                    <Button type="submit" variant="contained" disabled={submitting} sx={SUBMIT_BUTTON_SX}>
                        {t("common.add")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={!!selectedBucket}
                onClose={() => {
                    setSelectedBucket(null)
                    setEditing(false)
                }}
                fullWidth
                maxWidth="lg"
                fullScreen={isSmall}
            >
                <DialogTitle>{t("buckets.details_title")}</DialogTitle>
                <DialogContent>
                    {detailsError && (
                        <Alert severity="error" onClose={() => setDetailsError(null)} sx={{ mt: 1 }}>
                            {detailsError}
                        </Alert>
                    )}
                    {selectedBucket ? (
                        <Box sx={{ mt: 1 }}>
                            <Stack
                                direction="row"
                                sx={{
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                }}>
                                <Box>
                                    <Typography variant="subtitle2">
                                        {t("buckets.col.id")}: <code>{selectedBucket.id}</code>
                                    </Typography>
                                    <Typography variant="body2">
                                        {t("buckets.col.creationDate")}: {formatDateTime(selectedBucket.created, i18n.language)}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" sx={{
                                        color: "text.secondary"
                                    }}>
                                        {t("buckets.col.arn")}: {selectedBucket.id}
                                    </Typography>
                                </Box>
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.stats_title")}</Typography>
                            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                    {t("buckets.stats.objects")}: {selectedBucket.objects}
                                </Typography>
                                <Typography variant="body2">
                                    {t("buckets.stats.bytes")}: {formatBytes(selectedBucket.bytes, i18n.language)}
                                </Typography>
                                <Typography variant="body2">
                                    {t("buckets.stats.unfinishedUploads")}: {selectedBucket.unfinishedUploads}
                                </Typography>
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.col.aliases")}</Typography>
                            <Stack spacing={1} sx={{ mt: 1 }}>
                                {selectedBucket.globalAliases &&
                                    selectedBucket.globalAliases.map((a) => (
                                        <Box key={a} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <Typography>{a}</Typography>
                                            <Button size="small" color="error" aria-label={`${t("buckets.actions_delete")} ${a}`} onClick={() => requestRemoveAlias("global", a)}>
                                                {t("buckets.actions_delete")}
                                            </Button>
                                        </Box>
                                    ))}
                                {selectedBucket.keys &&
                                    selectedBucket.keys
                                        .flatMap((k) => (k.bucketLocalAliases ?? []).map((a) => ({ alias: a, accessKeyId: k.accessKeyId })))
                                        .map((l) => (
                                            <Box key={`${l.alias}-${l.accessKeyId}`} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <Typography>
                                                    {l.alias} ({l.accessKeyId})
                                                </Typography>
                                                <Button size="small" color="error" aria-label={`${t("buckets.actions_delete")} ${l.alias} (${l.accessKeyId})`} onClick={() => requestRemoveAlias("local", l.alias, l.accessKeyId)}>
                                                    {t("buckets.actions_delete")}
                                                </Button>
                                            </Box>
                                        ))}
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.details.keys")}</Typography>
                            <Box sx={{ mt: 1 }}>
                                <Autocomplete
                                    multiple
                                    options={allKeys}
                                    getOptionLabel={(opt) => `${opt.id} ${opt.name ? `(${opt.name})` : ""}`}
                                    value={allKeys.filter((k) => selectedKeyIds.includes(k.id))}
                                    onChange={(_, value) => setSelectedKeyIds(value.map((v) => v.id))}
                                    renderValue={(value: components["schemas"]["ListKeysResponseItem"][], getItemProps) =>
                                        value.map((option, index) => {
                                            const tagProps = getItemProps({ index }) as { key: string | number } & Record<string, unknown>
                                            const { key, ...rest } = tagProps
                                            return <Chip key={String(key)} variant="outlined" label={`${option.id}`} {...rest} />
                                        })
                                    }
                                    renderInput={(params) => <TextField {...params} size="small" label={t("buckets.details.assign_keys")} />}
                                />
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.details.quotas")}</Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{
                                    alignItems: "center",
                                    mt: 1
                                }}>
                                <TextField
                                    size="small"
                                    label={t("buckets.form.quotas.maxSize")}
                                    type="number"
                                    value={detailsForm.quotasMaxSize}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, quotasMaxSize: e.target.value }))}
                                    disabled={!editing}
                                />
                                <Select
                                    size="small"
                                    value={detailsForm.quotasMaxSizeUnit}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, quotasMaxSizeUnit: e.target.value }))}
                                    disabled={!editing}
                                    slotProps={{ input: { "aria-label": t("buckets.form.quotas.maxSize") } }}
                                >
                                    {sizeUnits.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                                </Select>
                                <TextField
                                    size="small"
                                    label={t("buckets.form.quotas.maxObjects")}
                                    type="number"
                                    value={detailsForm.quotasMaxObjects}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, quotasMaxObjects: e.target.value }))}
                                    disabled={!editing}
                                />
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.details.website")}</Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{
                                    alignItems: "center",
                                    mt: 1
                                }}>
                                <Typography variant="body2">{t("buckets.form.website.enabled")}</Typography>
                                <Switch
                                    checked={detailsForm.websiteEnabled}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, websiteEnabled: e.target.checked }))}
                                    disabled={!editing}
                                    slotProps={{ input: { "aria-label": t("buckets.form.website.enabled") } }}
                                />
                            </Stack>
                            {detailsForm.websiteEnabled && (
                                <Stack sx={{ mt: 1 }} spacing={1}>
                                    <TextField
                                        size="small"
                                        label={t("buckets.form.website.indexDocument")}
                                        value={detailsForm.websiteIndex}
                                        onChange={(e) => setDetailsForm((f) => ({ ...f, websiteIndex: e.target.value }))}
                                        disabled={!editing}
                                    />
                                    <TextField
                                        size="small"
                                        label={t("buckets.form.website.errorDocument")}
                                        value={detailsForm.websiteError}
                                        onChange={(e) => setDetailsForm((f) => ({ ...f, websiteError: e.target.value }))}
                                        disabled={!editing}
                                    />
                                </Stack>
                            )}

                            <Divider sx={{ my: 2 }} />

                            <Box sx={{ mt: 1 }}>
                                <Typography variant="subtitle2">{t("buckets.add_alias_title")}</Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                    <TextField size="small" label={t("buckets.form.alias")} value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} />
                                    <Button variant="contained" size="small" onClick={doAddAlias}>
                                        {t("common.add")}
                                    </Button>
                                </Stack>
                            </Box>
                        </Box>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    {!editing ? (
                        <>
                            <Button
                                onClick={() => {
                                    setEditing(true)
                                }}
                            >
                                {t("common.edit") || t("buckets.edit")}
                            </Button>
                            <Button
                                onClick={() => {
                                    setSelectedBucket(null)
                                    setEditing(false)
                                }}
                            >
                                {t("common.close")}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                onClick={() => {
                                    /* cancel edits: reset form */ if (selectedBucket) {
                                        const maxSize = selectedBucket.quotas?.maxSize || 0
                                        const { value: unit, display: size } = getBestUnit(maxSize)
                                        setDetailsForm({
                                            quotasMaxSize: size.toString(),
                                            quotasMaxSizeUnit: unit,
                                            quotasMaxObjects: selectedBucket.quotas?.maxObjects !== undefined ? String(selectedBucket.quotas.maxObjects) : "",
                                            websiteEnabled: !!selectedBucket.websiteAccess,
                                            websiteIndex: selectedBucket.websiteConfig?.indexDocument || "",
                                            websiteError: selectedBucket.websiteConfig?.errorDocument || "",
                                        })
                                    }
                                    setEditing(false)
                                }}
                            >
                                {t("common.cancel")}
                            </Button>
                            <Button variant="contained" onClick={saveDetails} disabled={savingDetails} aria-busy={savingDetails}>
                                {t("common.save")}
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* Remove alias confirmation dialog */}
            <Dialog open={removeAliasConfirmOpen} onClose={() => setRemoveAliasConfirmOpen(false)}>
                <DialogTitle>{t("buckets.remove_alias_confirm_title")}</DialogTitle>
                <DialogContent>
                    <Typography>{aliasToRemove ? t("buckets.remove_alias_confirm_desc", { alias: aliasToRemove.value }) : ""}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRemoveAliasConfirmOpen(false)}>{t("common.cancel")}</Button>
                    <Button variant="contained" color="error" onClick={doRemoveAlias}>
                        {t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>{t("buckets.delete_confirm_title")}</DialogTitle>
                <DialogContent>
                    <Typography>{t("buckets.delete_confirm_desc")}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>{t("common.cancel")}</Button>
                    <Button variant="contained" color="error" onClick={doDelete}>
                        {t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}