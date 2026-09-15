import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@mui/material/styles"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import IconButton from "@mui/material/IconButton"
import InputAdornment from "@mui/material/InputAdornment"
import Paper from "@mui/material/Paper"
import Skeleton from "@mui/material/Skeleton"
import Stack from "@mui/material/Stack"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TablePagination from "@mui/material/TablePagination"
import TableRow from "@mui/material/TableRow"
import TableSortLabel from "@mui/material/TableSortLabel"
import TextField from "@mui/material/TextField"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import ClearIcon from "@mui/icons-material/Clear"
import SearchIcon from "@mui/icons-material/Search"
import ErrorState from "../ErrorState"

export type DataTableSortDirection = "asc" | "desc"

/** Mode de densite, resolu dans les jetons du theme (`theme.kexa.density`). */
export type DataTableDensity = "compact" | "standard" | "comfortable"

export interface DataTableColumn<T> {
    /** Identifiant stable de la colonne (utilise par `defaultSort` et `pagination`). */
    id: string
    /** En-tete deja traduit par l'appelant (`t(...)`). */
    header: ReactNode
    cell: (row: T) => ReactNode
    align?: "left" | "center" | "right"
    /** Active l'alignement a droite et `fontVariantNumeric: tabular-nums`. */
    numeric?: boolean
    width?: string | number
    /** Largeur minimale en px (defaut 80). */
    minWidth?: number
    /** Active le tri sur la colonne (`TableSortLabel` + `aria-sort`). */
    sortValue?: (row: T) => string | number | boolean | Date | null | undefined
    /** Tronque le contenu sur une ligne avec `textOverflow: ellipsis`. */
    truncate?: boolean
    /** Valeur brute affichee dans le `Tooltip` de troncature. */
    textValue?: (row: T) => string
}

export interface DataTableAction {
    label: string
    onClick: () => void
    tone?: "default" | "danger"
}

export interface DataTableSelection<T> {
    enabled: boolean
    /** Actions de masse ; `clear()` vide la selection apres l'action. */
    bulkActions?: (selectedIds: string[], clear: () => void) => DataTableAction[]
    /** Libelle de la ressource pour l'`aria-label` de la case de ligne. */
    getRowLabel?: (row: T) => string
    /**
     * Selection pilotee : des que ce tableau est fourni il devient la source de verite et
     * l'etat interne est ignore. Sans `onSelectionChange` les cases ne sont que reflectives.
     */
    selectedIds?: string[]
    /** Notifie le parent du nouvel ensemble d'identifiants selectionnes (mode controle). */
    onSelectionChange?: (ids: string[]) => void
    /**
     * Exclut une ligne de la selection : sa case est desactivee et elle ne compte ni dans le
     * « tout selectionner » ni dans le compteur de la barre d'actions groupee. Toutes les
     * lignes sont selectionnables par defaut.
     */
    isSelectable?: (row: T, id: string) => boolean
}

export interface DataTableEmptyState {
    icon?: ReactNode
    title: string
    description?: string
    primaryAction?: { label: string; onClick: () => void }
    /** Retourne `true` quand un filtre externe au composant est actif. */
    isFiltered?: () => boolean
}

export interface DataTablePaginationOptions {
    defaultRowsPerPage?: number
    rowsPerPageOptions?: number[]
}

export interface DataTableLabels {
    search: string
    searchClear: string
    rowsPerPage: string
    displayedRows: (info: { from: number; to: number; count: number }) => string
    noResults: string
    noResultsDescription: string
    clearFilters: string
    selectAll: string
    selectRow: (label: string) => string
    selectedCount: (count: number) => string
    clearSelection: string
}

export interface DataTableProps<T> {
    rows: T[]
    columns: DataTableColumn<T>[]
    getRowId?: (row: T, index: number) => string
    /** Rend `rowsPerPage` lignes de `Skeleton` ; les en-tetes restent visibles. */
    loading?: boolean
    /** Affiche `ErrorState variant="centered"` dans le corps, en-tetes visibles. */
    error?: string | null
    errorTitle?: string
    retryLabel?: string
    onRetry?: () => void
    emptyState?: DataTableEmptyState
    /** Indexe la recherche ; l'absence de cette prop masque le champ de recherche. */
    searchValue?: (row: T) => string
    searchPlaceholder?: string
    defaultSort?: { id: string; dir: DataTableSortDirection }
    /** `false` masque la pagination ; absent = pagination 25/50/100 active. */
    pagination?: DataTablePaginationOptions | false
    selection?: DataTableSelection<T>
    density?: DataTableDensity
    stickyHeader?: boolean
    onRowClick?: (row: T) => void
    /** Boutons de barre d'outils (rafraichir, filtres externes…). */
    toolbarActions?: ReactNode
    /** Efface un filtre externe (affiche avec `emptyState.isFiltered()`). */
    onClearFilters?: () => void
    tableLabel?: string
    labels?: Partial<DataTableLabels>
}

function compareValues(a: unknown, b: unknown, language: string): number {
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1
    if (b === null || b === undefined) return 1
    const left = a instanceof Date ? a.getTime() : a
    const right = b instanceof Date ? b.getTime() : b
    if (typeof left === "number" && typeof right === "number") return left - right
    if (typeof left === "boolean" && typeof right === "boolean") return left === right ? 0 : left ? 1 : -1
    return String(left).localeCompare(String(right), language, { numeric: true, sensitivity: "base" })
}

/**
 * Tableau generique : tri client, recherche, pagination, selection, densite et
 * etats (`loading`/`error`/vide) partages par tous les ecrans.
 *
 * La selection est interne par defaut ; `selection.selectedIds` + `selection.onSelectionChange`
 * la rendent pilotee par le parent, et `selection.isSelectable` exclut des lignes.
 */
export default function DataTable<T>({
    rows,
    columns,
    getRowId,
    loading = false,
    error = null,
    errorTitle,
    retryLabel,
    onRetry,
    emptyState,
    searchValue,
    searchPlaceholder,
    defaultSort,
    pagination,
    selection,
    density = "standard",
    stickyHeader = true,
    onRowClick,
    toolbarActions,
    onClearFilters,
    tableLabel,
    labels,
}: DataTableProps<T>) {
    const { t, i18n } = useTranslation()
    const theme = useTheme()
    const [query, setQuery] = useState("")
    const [page, setPage] = useState(0)
    const [sort, setSort] = useState<{ id: string; dir: DataTableSortDirection } | null>(defaultSort ?? null)
    const [internalSelected, setInternalSelected] = useState<string[]>([])
    /** Selection controlee par le parent des que `selection.selectedIds` est fourni. */
    const selected = selection?.selectedIds ?? internalSelected

    const paginationEnabled = pagination !== false
    const rowsPerPageOptions = pagination ? pagination.rowsPerPageOptions ?? [25, 50, 100] : [25, 50, 100]
    const [rowsPerPage, setRowsPerPage] = useState(pagination ? pagination.defaultRowsPerPage ?? 25 : 25)

    /** Libelles resolus par i18next ; la prop `labels` reste une surcharge optionnelle. */
    const base: DataTableLabels = {
        search: t("common.search_placeholder"),
        searchClear: t("common.clear_search"),
        rowsPerPage: t("common.rows_per_page"),
        displayedRows: ({ from, to, count }) => t("common.rows_displayed", { from, to, total: count }),
        noResults: t("common.no_results"),
        noResultsDescription: t("common.no_results_desc"),
        clearFilters: t("common.clear_filters"),
        selectAll: t("common.select_all"),
        selectRow: (label) => t("common.select_row", { label }),
        selectedCount: (count) => t("common.selected_count", { count }),
        clearSelection: t("common.clear_selection"),
    }
    const l: DataTableLabels = { ...base, ...labels }
    const tokens = theme.kexa.density[density]
    const rowIds = (row: T, index: number) => getRowId?.(row, index) ?? String(index)

    const processed = useMemo(() => {
        let out = rows
        const needle = query.trim().toLowerCase()
        if (needle && searchValue) out = out.filter((row) => searchValue(row).toLowerCase().includes(needle))
        if (sort) {
            const column = columns.find((c) => c.id === sort.id)
            if (column?.sortValue) {
                const dir = sort.dir === "asc" ? 1 : -1
                out = [...out].sort((a, b) => dir * compareValues(column.sortValue?.(a), column.sortValue?.(b), i18n.language))
            }
        }
        return out
    }, [rows, columns, query, searchValue, sort, i18n.language])

    const pageCount = paginationEnabled ? Math.max(1, Math.ceil(processed.length / rowsPerPage)) : 1
    const safePage = Math.min(page, pageCount - 1)
    const visible = paginationEnabled ? processed.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage) : processed

    const filtered = query.trim().length > 0 || (emptyState?.isFiltered?.() ?? false)
    const columnCount = columns.length + (selection?.enabled ? 1 : 0)
    const bodyCellSx = { px: 1.5, py: `${tokens.padding}px`, height: tokens.row } as const

    /** Lignes visibles avec leur identifiant et leur eligibilite a la selection. */
    const visibleEntries = visible.map((row, index) => {
        const id = rowIds(row, safePage * rowsPerPage + index)
        return { row, id, selectable: selection?.isSelectable?.(row, id) ?? true }
    })
    const selectableVisibleIds = visibleEntries.filter((entry) => entry.selectable).map((entry) => entry.id)
    const selectedVisible = selectableVisibleIds.filter((id) => selected.includes(id))
    const allVisibleSelected = selectableVisibleIds.length > 0 && selectedVisible.length === selectableVisibleIds.length
    const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected

    const toggleSort = (id: string) => {
        setPage(0)
        setSort((previous) => {
            if (!previous || previous.id !== id) return { id, dir: "asc" }
            return { id, dir: previous.dir === "asc" ? "desc" : "asc" }
        })
    }

    /** Ecrit la selection : notifie le parent en mode controle, etat interne sinon. */
    const commitSelection = (nextIds: string[]) => {
        if (selection?.selectedIds !== undefined) selection.onSelectionChange?.(nextIds)
        else setInternalSelected(nextIds)
    }

    const toggleRow = (id: string, selectable: boolean) => {
        if (!selectable) return
        commitSelection(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    }

    const toggleAllVisible = () => {
        commitSelection(
            allVisibleSelected
                ? selected.filter((id) => !selectableVisibleIds.includes(id))
                : Array.from(new Set([...selected, ...selectableVisibleIds])),
        )
    }

    const clearSelection = () => commitSelection([])

    const clearFilters = () => {
        setQuery("")
        setPage(0)
        onClearFilters?.()
    }

    const bulkActions = selection?.enabled && selected.length > 0 ? selection.bulkActions?.(selected, clearSelection) ?? [] : []

    return (
        <Box>
            {(searchValue || toolbarActions) && (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                    {searchValue && (
                        <TextField
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value)
                                setPage(0)
                            }}
                            placeholder={searchPlaceholder ?? l.search}
                            size="small"
                            sx={{ flex: 1, maxWidth: 360 }}
                            slotProps={{
                                htmlInput: { "aria-label": searchPlaceholder ?? l.search },
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                    ),
                                    endAdornment: query ? (
                                        <InputAdornment position="end">
                                            <IconButton
                                                size="small"
                                                sx={{ width: 32, height: 32 }}
                                                aria-label={l.searchClear}
                                                onClick={() => {
                                                    setQuery("")
                                                    setPage(0)
                                                }}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </InputAdornment>
                                    ) : undefined,
                                },
                            }}
                        />
                    )}
                    {toolbarActions && (
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", ml: "auto" }}>
                            {toolbarActions}
                        </Stack>
                    )}
                </Stack>
            )}

            <TableContainer component={Paper}>
                <Table size="small" stickyHeader={stickyHeader} aria-label={tableLabel}>
                    <TableHead>
                        <TableRow>
                            {selection?.enabled && (
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        size="small"
                                        checked={allVisibleSelected}
                                        indeterminate={someVisibleSelected}
                                        onChange={toggleAllVisible}
                                        disabled={selectableVisibleIds.length === 0}
                                        slotProps={{ input: { "aria-label": l.selectAll } }}
                                    />
                                </TableCell>
                            )}
                            {columns.map((column) => {
                                const active = sort?.id === column.id
                                const align = column.align ?? (column.numeric ? "right" : "left")
                                return (
                                    <TableCell
                                        key={column.id}
                                        align={align}
                                        sortDirection={active ? sort.dir : false}
                                        sx={{ width: column.width, minWidth: column.minWidth ?? 80 }}
                                    >
                                        {column.sortValue ? (
                                            <TableSortLabel active={active} direction={active ? sort.dir : "asc"} onClick={() => toggleSort(column.id)}>
                                                {column.header}
                                            </TableSortLabel>
                                        ) : (
                                            column.header
                                        )}
                                    </TableCell>
                                )
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading &&
                            Array.from({ length: rowsPerPage }, (_, rowIndex) => (
                                <TableRow key={`skeleton-${rowIndex}`}>
                                    {selection?.enabled && (
                                        <TableCell padding="checkbox" sx={bodyCellSx}>
                                            <Skeleton variant="rounded" width={20} height={20} />
                                        </TableCell>
                                    )}
                                    {columns.map((column) => (
                                        <TableCell key={column.id} sx={bodyCellSx}>
                                            <Skeleton variant="text" width={`${45 + ((rowIndex + column.id.length) % 5) * 10}%`} />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}

                        {!loading && error && (
                            <TableRow>
                                <TableCell colSpan={columnCount} sx={{ py: 2, borderBottom: 0 }}>
                                    <ErrorState
                                        variant="centered"
                                        title={errorTitle ?? t("common.load_error")}
                                        message={error}
                                        onRetry={onRetry}
                                        retryLabel={retryLabel ?? t("common.retry")}
                                    />
                                </TableCell>
                            </TableRow>
                        )}

                        {!loading && !error && processed.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columnCount} sx={{ py: 6, borderBottom: 0 }}>
                                    <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
                                        {filtered ? (
                                            <>
                                                <Typography variant="h6">{l.noResults}</Typography>
                                                <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 420 }}>
                                                    {l.noResultsDescription}
                                                </Typography>
                                                {query.trim().length > 0 ? (
                                                    <Button variant="outlined" onClick={clearFilters}>
                                                        {l.clearFilters}
                                                    </Button>
                                                ) : (
                                                    onClearFilters && (
                                                        <Button variant="outlined" onClick={clearFilters}>
                                                            {l.clearFilters}
                                                        </Button>
                                                    )
                                                )}
                                            </>
                                        ) : (
                                            emptyState && (
                                                <>
                                                    {emptyState.icon}
                                                    <Typography variant="h6">{emptyState.title}</Typography>
                                                    {emptyState.description && (
                                                        <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 420 }}>
                                                            {emptyState.description}
                                                        </Typography>
                                                    )}
                                                    {emptyState.primaryAction && (
                                                        <Button variant="contained" onClick={emptyState.primaryAction.onClick}>
                                                            {emptyState.primaryAction.label}
                                                        </Button>
                                                    )}
                                                </>
                                            )
                                        )}
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        )}

                        {!loading &&
                            !error &&
                            visibleEntries.map(({ row, id, selectable }) => {
                                const isSelected = selected.includes(id)
                                return (
                                    <TableRow key={id} hover selected={isSelected} onClick={onRowClick ? () => onRowClick(row) : undefined} sx={onRowClick ? { cursor: "pointer" } : undefined}>
                                        {selection?.enabled && (
                                            <TableCell padding="checkbox" sx={bodyCellSx}>
                                                <Checkbox
                                                    size="small"
                                                    checked={isSelected}
                                                    disabled={!selectable}
                                                    onChange={() => toggleRow(id, selectable)}
                                                    slotProps={{ input: { "aria-label": l.selectRow(selection.getRowLabel?.(row) ?? id) } }}
                                                />
                                            </TableCell>
                                        )}
                                        {columns.map((column) => {
                                            const align = column.align ?? (column.numeric ? "right" : "left")
                                            const content = column.cell(row)
                                            const decorated =
                                                column.truncate && column.textValue ? (
                                                    <Tooltip title={column.textValue(row)}>
                                                        <Box component="span" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                            {content}
                                                        </Box>
                                                    </Tooltip>
                                                ) : (
                                                    content
                                                )
                                            return (
                                                <TableCell
                                                    key={column.id}
                                                    align={align}
                                                    sx={{
                                                        ...bodyCellSx,
                                                        fontVariantNumeric: column.numeric ? "tabular-nums" : undefined,
                                                        ...(column.truncate ? { maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } : {}),
                                                    }}
                                                >
                                                    {decorated}
                                                </TableCell>
                                            )
                                        })}
                                    </TableRow>
                                )
                            })}
                    </TableBody>
                </Table>
                {paginationEnabled && (
                    <TablePagination
                        component="div"
                        count={processed.length}
                        page={safePage}
                        onPageChange={(_event, next) => setPage(next)}
                        rowsPerPage={rowsPerPage}
                        rowsPerPageOptions={rowsPerPageOptions}
                        onRowsPerPageChange={(event) => {
                            setRowsPerPage(Number(event.target.value))
                            setPage(0)
                        }}
                        labelRowsPerPage={l.rowsPerPage}
                        labelDisplayedRows={(info) => l.displayedRows({ from: info.from, to: info.to, count: info.count })}
                    />
                )}
            </TableContainer>

            {selection?.enabled && selected.length > 0 && (
                <Paper
                    elevation={8}
                    sx={{
                        position: "fixed",
                        bottom: 24,
                        left: "50%",
                        transform: "translateX(-50%)",
                        px: 2,
                        py: 1,
                        borderRadius: 2,
                        zIndex: theme.zIndex.snackbar,
                    }}
                >
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <Typography variant="body2">{l.selectedCount(selected.length)}</Typography>
                        {bulkActions.map((action) => (
                            <Button
                                key={action.label}
                                size="small"
                                variant={action.tone === "danger" ? "contained" : "text"}
                                color={action.tone === "danger" ? "error" : "primary"}
                                onClick={action.onClick}
                            >
                                {action.label}
                            </Button>
                        ))}
                        <IconButton size="small" sx={{ width: 32, height: 32 }} aria-label={l.clearSelection} onClick={clearSelection}>
                            <ClearIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Paper>
            )}
        </Box>
    )
}
