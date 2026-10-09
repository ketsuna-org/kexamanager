import { useTranslation } from "react-i18next"
import { Link as RouterLink, Navigate, useParams } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import { FolderOpen, KeyRound } from "lucide-react"
import { getBucketUsage } from "../../api/storage"
import { useActiveProject, useProject } from "../../contexts/ProjectContext"
import { useAsync } from "../../hooks/useAsync"
import { GetBucketInfo } from "../../utils/apiWrapper"
import { Page } from "../../shell/Page"
import { Card, CopyButton, EmptyBlock, ErrorBlock, Mono, Muted, Pill, Spinner } from "../../ui/kit"
import { formatBytes, formatCount } from "../../utils/format"
import BucketObjects from "./BucketObjects"
import BucketSettings from "./BucketSettings"
import { bucketUrl, resolveBucketAccess } from "./bucketAccess"
import { loadBuckets } from "./bucketApi"
import { bucketPath } from "./paths"

export default function BucketPage({ tab }: { tab: "objects" | "settings" }) {
    const { t } = useTranslation()
    const { bucketId = "" } = useParams()
    const project = useActiveProject()
    const { hasAdmin } = useProject()

    const info = useAsync(() => (hasAdmin ? GetBucketInfo({ id: bucketId }) : undefined), [project.id, bucketId, hasAdmin])
    const usage = useAsync(() => (hasAdmin ? undefined : getBucketUsage(project.id, [bucketId])), [project.id, bucketId, hasAdmin])
    const access = useAsync(
        () => (hasAdmin ? (info.data && tab === "objects" ? resolveBucketAccess(project, info.data) : undefined) : Promise.resolve({ ok: true as const, bucketName: bucketId, canWrite: true })),
        [project, info.data, tab, hasAdmin, bucketId],
    )
    const allBuckets = useAsync(() => (tab === "objects" ? loadBuckets(project.id, hasAdmin) : undefined), [project.id, hasAdmin, tab])

    if (!hasAdmin && tab === "settings") return <Navigate to={bucketPath(bucketId)} replace />

    const data = info.data
    const name = hasAdmin ? data?.globalAliases[0] ?? data?.keys.flatMap((key) => key.bucketLocalAliases)[0] ?? bucketId : bucketId
    const s3Usage = usage.data?.buckets[0]
    const objects = hasAdmin ? data?.objects : s3Usage?.objects
    const bytes = hasAdmin ? data?.bytes : s3Usage?.bytes
    const complete = hasAdmin ? true : s3Usage?.complete !== false
    const prefix = complete ? "" : "≥ "

    const description =
        objects === undefined
            ? undefined
            : [
                  t("bucket.objects", { count: objects, formatted: prefix + formatCount(objects) }),
                  prefix + formatBytes(bytes),
                  hasAdmin && data ? (tab === "settings" ? t("bucket.id", { id: data.id }) : t("bucket.keysAccess", { count: data.keys.length })) : null,
              ]
                  .filter(Boolean)
                  .join(" · ")

    const accessData = access.data
    const bucketName = accessData?.ok ? accessData.bucketName : name

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.buckets"), to: "/buckets" }, { label: name }]}
            topActions={
                <>
                    {data?.websiteAccess && <Pill tone="ok">{t("bucket.websiteActive")}</Pill>}
                    {tab === "settings" ? (
                        <Button component={RouterLink} to={bucketPath(bucketId)} startIcon={<FolderOpen />}>
                            {t("bucket.browse")}
                        </Button>
                    ) : (
                        <CopyButton value={bucketUrl(project, bucketName)} label={t("bucket.copyUrl")} what={t("bucket.url")} size="medium" />
                    )}
                </>
            }
            tabs={
                hasAdmin
                    ? [
                          { id: "objects", label: t("bucket.tabObjects"), to: bucketPath(bucketId) },
                          { id: "settings", label: t("bucket.tabSettings"), to: `${bucketPath(bucketId)}/settings` },
                      ]
                    : undefined
            }
            activeTab={tab}
            title={name}
            description={description}
        >
            {info.error && <ErrorBlock message={info.error} onRetry={info.refresh} />}
            {hasAdmin && !data && !info.error && <Spinner />}

            {tab === "settings" && data && (
                <BucketSettings
                    info={data}
                    name={name}
                    onChange={async () => {
                        const next = await GetBucketInfo({ id: bucketId })
                        info.setData(next)
                    }}
                />
            )}

            {tab === "objects" && (!hasAdmin || data) && (
                <>
                    {access.error && <ErrorBlock message={access.error} onRetry={access.refresh} />}
                    {access.loading && !accessData && <Spinner label={t("bucket.preparingAccess")} />}
                    {accessData && !accessData.ok && (
                        <Card>
                            <EmptyBlock
                                icon={<KeyRound />}
                                title={accessData.reason === "noKey" ? t("bucket.noKeyTitle") : t("bucket.noAliasTitle")}
                                description={accessData.reason === "noKey" ? t("bucket.noKeyText") : t("bucket.noAliasText")}
                                action={
                                    <Button variant="contained" component={RouterLink} to={`${bucketPath(bucketId)}/settings#${accessData.reason === "noKey" ? "access" : "aliases"}`}>
                                        {t("bucket.openSettings")}
                                    </Button>
                                }
                            />
                        </Card>
                    )}
                    {accessData?.ok && (
                        <>
                            {accessData.keyName && (
                                <Box sx={{ mt: -1 }}>
                                    <Muted small>
                                        {t("bucket.viaKey")} <Mono>{accessData.keyName}</Mono>
                                        {!accessData.canWrite && ` · ${t("bucket.readOnlyKey")}`}
                                    </Muted>
                                </Box>
                            )}
                            <BucketObjects
                                projectId={project.id}
                                bucket={accessData.bucketName}
                                canWrite={accessData.canWrite}
                                buckets={(allBuckets.data ?? []).map((b) => b.globalAliases[0] ?? b.name).filter(Boolean)}
                            />
                        </>
                    )}
                </>
            )}
        </Page>
    )
}
