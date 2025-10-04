import type { components, paths } from "../types/openapi"
import { adminGet, adminPost, adminPut, adminDelete } from "./adminClient"
/**
 * {
    "code": "InvalidRequest",
    "message": "Bad request: Invalid JSON: premature end of input at line 1 column 46",
    "region": "garage",
    "path": "/v2/UpdateAdminToken"
}
 */
export type ApiError = {
    message: string
    code: string
    region: string
    path: string
}

// --- Health / Check ---
function CheckDomain(domain: string, projectId?: number): Promise<null> {
    return adminGet<null>(`/check/${domain}`, { projectId })
}

function Health(projectId?: number): Promise<null> {
    return adminGet<null>("/health", { projectId })
}

function Metrics(projectId?: number): Promise<null> {
    return adminGet<null>("/metrics", { projectId })
}

// --- Buckets ---
function AddBucketAlias(data: components["schemas"]["AddBucketAliasRequest"], projectId?: number): Promise<components["schemas"]["AddBucketAliasResponse"]> {
    return adminPost<components["schemas"]["AddBucketAliasResponse"]>("/v2/AddBucketAlias", data, { projectId })
}

function RemoveBucketAlias(data: components["schemas"]["RemoveBucketAliasRequest"], projectId?: number): Promise<components["schemas"]["RemoveBucketAliasResponse"]> {
    return adminPost<components["schemas"]["RemoveBucketAliasResponse"]>("/v2/RemoveBucketAlias", data, { projectId })
}

function CreateBucket(data: components["schemas"]["CreateBucketRequest"], projectId?: number): Promise<components["schemas"]["CreateBucketResponse"]> {
    return adminPost<components["schemas"]["CreateBucketResponse"]>("/v2/CreateBucket", data, { projectId })
}

function DeleteBucket(params: { id: string }, projectId?: number): Promise<void> {
    return adminPost<void>("/v2/DeleteBucket", undefined, { query: { id: params.id }, projectId })
}

function GetBucketInfo(query: paths["/v2/GetBucketInfo"]["get"]["parameters"]["query"], projectId?: number): Promise<components["schemas"]["GetBucketInfoResponse"]> {
    return adminGet<components["schemas"]["GetBucketInfoResponse"]>("/v2/GetBucketInfo", { query, projectId })
}

function UpdateBucket(params: { id: string }, data: components["schemas"]["UpdateBucketRequestBody"], projectId?: number): Promise<components["schemas"]["UpdateBucketResponse"]> {
    return adminPost<components["schemas"]["UpdateBucketResponse"]>("/v2/UpdateBucket", data, { query: { id: params.id }, projectId })
}

// --- Keys / Tokens ---
function CreateKey(data: components["schemas"]["CreateKeyRequest"], projectId?: number): Promise<components["schemas"]["CreateKeyResponse"]> {
    return adminPost<components["schemas"]["CreateKeyResponse"]>("/v2/CreateKey", data, { projectId })
}

function DeleteKey(params: { id: string }, projectId?: number): Promise<void> {
    return adminPost<void>("/v2/DeleteKey", undefined, { query: { id: params.id }, projectId })
}

function GetKeyInfo(query: paths["/v2/GetKeyInfo"]["get"]["parameters"]["query"], projectId?: number): Promise<components["schemas"]["GetKeyInfoResponse"]> {
    return adminGet<components["schemas"]["GetKeyInfoResponse"]>("/v2/GetKeyInfo", { query, projectId })
}

function UpdateKey(params: { id: string }, data: components["schemas"]["UpdateKeyRequestBody"], projectId?: number): Promise<components["schemas"]["UpdateKeyResponse"]> {
    return adminPost<components["schemas"]["UpdateKeyResponse"]>("/v2/UpdateKey", data, { query: { id: params.id }, projectId })
}

function ImportKey(data: components["schemas"]["ImportKeyRequest"], projectId?: number): Promise<components["schemas"]["ImportKeyResponse"]> {
    return adminPost<components["schemas"]["ImportKeyResponse"]>("/v2/ImportKey", data, { projectId })
}

// --- Bucket Key Permissions ---
function AllowBucketKey(data: components["schemas"]["AllowBucketKeyRequest"], projectId?: number): Promise<components["schemas"]["AllowBucketKeyResponse"]> {
    return adminPost<components["schemas"]["AllowBucketKeyResponse"]>("/v2/AllowBucketKey", data, { projectId })
}

function DenyBucketKey(data: components["schemas"]["DenyBucketKeyRequest"], projectId?: number): Promise<components["schemas"]["DenyBucketKeyResponse"]> {
    return adminPost<components["schemas"]["DenyBucketKeyResponse"]>("/v2/DenyBucketKey", data, { projectId })
}

// --- Cluster layout & status ---
function GetClusterStatus(projectId?: number): Promise<components["schemas"]["GetClusterStatusResponse"]> {
    return adminGet<components["schemas"]["GetClusterStatusResponse"]>("/v2/GetClusterStatus", { projectId })
}

function GetClusterLayout(projectId?: number): Promise<components["schemas"]["GetClusterLayoutResponse"]> {
    return adminGet<components["schemas"]["GetClusterLayoutResponse"]>("/v2/GetClusterLayout", { projectId })
}

function GetClusterLayoutHistory(projectId?: number): Promise<components["schemas"]["GetClusterLayoutHistoryResponse"]> {
    return adminGet<components["schemas"]["GetClusterLayoutHistoryResponse"]>("/v2/GetClusterLayoutHistory", { projectId })
}

function UpdateClusterLayout(data: components["schemas"]["UpdateClusterLayoutRequest"], projectId?: number): Promise<components["schemas"]["UpdateClusterLayoutResponse"]> {
    return adminPost<components["schemas"]["UpdateClusterLayoutResponse"]>("/v2/UpdateClusterLayout", data, { projectId })
}

function ApplyClusterLayout(data: components["schemas"]["ApplyClusterLayoutRequest"], projectId?: number): Promise<components["schemas"]["ApplyClusterLayoutResponse"]> {
    return adminPost<components["schemas"]["ApplyClusterLayoutResponse"]>("/v2/ApplyClusterLayout", data, { projectId })
}

function PreviewClusterLayoutChanges(projectId?: number): Promise<components["schemas"]["PreviewClusterLayoutChangesResponse"]> {
    return adminGet<components["schemas"]["PreviewClusterLayoutChangesResponse"]>("/v2/PreviewClusterLayoutChanges", { projectId })
}

function RevertClusterLayout(projectId?: number): Promise<components["schemas"]["RevertClusterLayoutResponse"]> {
    return adminPost<components["schemas"]["RevertClusterLayoutResponse"]>("/v2/RevertClusterLayout", { projectId })
}

function ClusterLayoutSkipDeadNodes(data: components["schemas"]["ClusterLayoutSkipDeadNodesRequest"], projectId?: number): Promise<components["schemas"]["ClusterLayoutSkipDeadNodesResponse"]> {
    return adminPost<components["schemas"]["ClusterLayoutSkipDeadNodesResponse"]>("/v2/ClusterLayoutSkipDeadNodes", data, { projectId })
}

// --- Cluster health & stats ---
function GetClusterHealth(projectId?: number): Promise<components["schemas"]["GetClusterHealthResponse"]> {
    return adminGet<components["schemas"]["GetClusterHealthResponse"]>("/v2/GetClusterHealth", { projectId })
}

function GetClusterStatistics(projectId?: number): Promise<components["schemas"]["GetClusterStatisticsResponse"]> {
    return adminGet<components["schemas"]["GetClusterStatisticsResponse"]>("/v2/GetClusterStatistics", { projectId })
}

// --- Admin tokens ---
function CreateAdminToken(data: components["schemas"]["UpdateAdminTokenRequestBody"], projectId?: number): Promise<components["schemas"]["CreateAdminTokenResponse"]> {
    return adminPost<components["schemas"]["CreateAdminTokenResponse"]>("/v2/CreateAdminToken", data, { projectId })
}

function ListAdminTokens(projectId?: number): Promise<components["schemas"]["ListAdminTokensResponse"]> {
    return adminGet<components["schemas"]["ListAdminTokensResponse"]>("/v2/ListAdminTokens", { projectId })
}

function GetAdminTokenInfo(query: paths["/v2/GetAdminTokenInfo"]["get"]["parameters"]["query"], projectId?: number): Promise<components["schemas"]["GetAdminTokenInfoResponse"]> {
    return adminGet<components["schemas"]["GetAdminTokenInfoResponse"]>("/v2/GetAdminTokenInfo", { query, projectId })
}

function UpdateAdminToken(params: { id: string }, data: components["schemas"]["UpdateAdminTokenRequestBody"], projectId?: number): Promise<components["schemas"]["UpdateAdminTokenResponse"]> {
    return adminPost<components["schemas"]["UpdateAdminTokenResponse"]>("/v2/UpdateAdminToken", data, { query: { id: params.id }, projectId })
}

function DeleteAdminToken(params: { id: string }, projectId?: number): Promise<void> {
    return adminPost<void>("/v2/DeleteAdminToken", undefined, { query: { id: params.id }, projectId })
}

// --- Nodes, blocks, workers ---
function GetNodeInfo(params: { node?: string } = {}, projectId?: number): Promise<components["schemas"]["MultiResponse_LocalGetNodeInfoResponse"]> {
    const node = params.node ?? "*"
    return adminGet<components["schemas"]["MultiResponse_LocalGetNodeInfoResponse"]>("/v2/GetNodeInfo", { query: { node }, projectId })
}

function GetNodeStatistics(params: { node?: string } = {}, projectId?: number): Promise<components["schemas"]["MultiResponse_LocalGetNodeStatisticsResponse"]> {
    const node = params.node ?? "*"
    return adminGet<components["schemas"]["MultiResponse_LocalGetNodeStatisticsResponse"]>("/v2/GetNodeStatistics", { query: { node }, projectId })
}

function GetBlockInfo(params: { node?: string } = {}, data: components["schemas"]["LocalGetBlockInfoRequest"], projectId?: number): Promise<components["schemas"]["MultiResponse_LocalGetBlockInfoResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalGetBlockInfoResponse"]>("/v2/GetBlockInfo", data, { query: { node }, projectId })
}

function ListBlockErrors(params: { node?: string } = {}, projectId?: number): Promise<components["schemas"]["MultiResponse_LocalListBlockErrorsResponse"]> {
    const node = params.node ?? "*"
    return adminGet<components["schemas"]["MultiResponse_LocalListBlockErrorsResponse"]>("/v2/ListBlockErrors", { query: { node }, projectId })
}

function PurgeBlocks(params: { node?: string } = {}, data: components["schemas"]["LocalPurgeBlocksRequest"], projectId?: number): Promise<components["schemas"]["MultiResponse_LocalPurgeBlocksResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalPurgeBlocksResponse"]>("/v2/PurgeBlocks", data, { query: { node }, projectId })
}

function RetryBlockResync(params: { node?: string } = {}, data: components["schemas"]["LocalRetryBlockResyncRequest"], projectId?: number): Promise<components["schemas"]["MultiResponse_LocalRetryBlockResyncResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalRetryBlockResyncResponse"]>("/v2/RetryBlockResync", data, { query: { node }, projectId })
}

function LaunchRepairOperation(
    params: { node?: string } = {},
    data: components["schemas"]["LocalLaunchRepairOperationRequest"],
    projectId?: number
): Promise<components["schemas"]["MultiResponse_LocalLaunchRepairOperationResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalLaunchRepairOperationResponse"]>("/v2/LaunchRepairOperation", data, { query: { node }, projectId })
}

function ListWorkers(params: { node?: string } = {}, data: components["schemas"]["LocalListWorkersRequest"], projectId?: number): Promise<components["schemas"]["MultiResponse_LocalListWorkersResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalListWorkersResponse"]>("/v2/ListWorkers", data, { query: { node }, projectId })
}

function GetWorkerInfo(params: { node?: string } = {}, data: components["schemas"]["LocalGetWorkerInfoRequest"], projectId?: number): Promise<components["schemas"]["MultiResponse_LocalGetWorkerInfoResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalGetWorkerInfoResponse"]>("/v2/GetWorkerInfo", data, { query: { node }, projectId })
}

function GetWorkerVariable(
    params: { node?: string } = {},
    data: components["schemas"]["LocalGetWorkerVariableRequest"],
    projectId?: number
): Promise<components["schemas"]["MultiResponse_LocalGetWorkerVariableResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalGetWorkerVariableResponse"]>("/v2/GetWorkerVariable", data, { query: { node }, projectId })
}

function SetWorkerVariable(
    params: { node?: string } = {},
    data: components["schemas"]["LocalSetWorkerVariableRequest"],
    projectId?: number
): Promise<components["schemas"]["MultiResponse_LocalSetWorkerVariableResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalSetWorkerVariableResponse"]>("/v2/SetWorkerVariable", data, { query: { node }, projectId })
}

// --- Objects ---
function InspectObject(query: paths["/v2/InspectObject"]["get"]["parameters"]["query"], projectId?: number): Promise<components["schemas"]["InspectObjectResponse"]> {
    return adminGet<components["schemas"]["InspectObjectResponse"]>("/v2/InspectObject", { query, projectId })
}

// --- Misc / maintenance ---
function CleanupIncompleteUploads(data: components["schemas"]["CleanupIncompleteUploadsRequest"], projectId?: number): Promise<components["schemas"]["CleanupIncompleteUploadsResponse"]> {
    return adminPost<components["schemas"]["CleanupIncompleteUploadsResponse"]>("/v2/CleanupIncompleteUploads", data, { projectId })
}

function ConnectClusterNodes(data: components["schemas"]["ConnectClusterNodesRequest"], projectId?: number): Promise<components["schemas"]["ConnectClusterNodesResponse"]> {
    return adminPost<components["schemas"]["ConnectClusterNodesResponse"]>("/v2/ConnectClusterNodes", data, { projectId })
}

function CreateMetadataSnapshot(node: string, projectId?: number): Promise<components["schemas"]["MultiResponse_LocalCreateMetadataSnapshotResponse"]> {
    return adminGet<components["schemas"]["MultiResponse_LocalCreateMetadataSnapshotResponse"]>("/v2/CreateMetadataSnapshot", { query: { node }, projectId })
}

function ListBuckets(configId?: number, projectId?: number): Promise<components["schemas"]["ListBucketsResponse"]> {
    if (!configId) {
        throw new Error("configId is required for ListBuckets")
    }
    return adminPost<components["schemas"]["ListBucketsResponse"]>("/api/s3/list-buckets", { configId, keyId: "", token: "" }, { projectId })
}

function ListKeys(projectId?: number): Promise<components["schemas"]["ListKeysResponse"]> {
    return adminGet<components["schemas"]["ListKeysResponse"]>("/v2/ListKeys", { projectId })
}

function ListAdminTokensSimple(projectId?: number): Promise<components["schemas"]["ListAdminTokensResponse"]> {
    return adminGet<components["schemas"]["ListAdminTokensResponse"]>("/v2/ListAdminTokens", { projectId })
}

export {
    CheckDomain,
    Health,
    Metrics,
    AddBucketAlias,
    RemoveBucketAlias,
    CreateBucket,
    DeleteBucket,
    GetBucketInfo,
    UpdateBucket,
    CreateKey,
    DeleteKey,
    GetKeyInfo,
    UpdateKey,
    ImportKey,
    AllowBucketKey,
    DenyBucketKey,
    GetClusterStatus,
    GetClusterLayout,
    GetClusterLayoutHistory,
    UpdateClusterLayout,
    ApplyClusterLayout,
    PreviewClusterLayoutChanges,
    RevertClusterLayout,
    ClusterLayoutSkipDeadNodes,
    GetClusterHealth,
    GetClusterStatistics,
    CreateAdminToken,
    ListAdminTokens,
    GetAdminTokenInfo,
    UpdateAdminToken,
    DeleteAdminToken,
    GetNodeInfo,
    GetNodeStatistics,
    GetBlockInfo,
    ListBlockErrors,
    PurgeBlocks,
    RetryBlockResync,
    LaunchRepairOperation,
    ListWorkers,
    GetWorkerInfo,
    GetWorkerVariable,
    SetWorkerVariable,
    InspectObject,
    CleanupIncompleteUploads,
    ConnectClusterNodes,
    CreateMetadataSnapshot,
    ListBuckets,
    ListKeys,
    ListAdminTokensSimple,
}

// --- S3 Configurations ---
export interface S3Config {
    id: number
    user_id: number
    name: string
    type: 'garage' | 's3'
    s3_url?: string
    admin_url?: string
    client_id: string
    region: string
    force_path_style: boolean
}

function GetS3Configs(): Promise<S3Config[]> {
    return adminGet<S3Config[]>("/s3-configs")
}

function CreateS3Config(data: Omit<S3Config, 'id' | 'user_id'>): Promise<S3Config> {
    return adminPost<S3Config>("/s3-configs", data)
}

function UpdateS3Config(id: number, data: Partial<Omit<S3Config, 'id' | 'user_id'>>): Promise<S3Config> {
    return adminPut<S3Config>(`/s3-configs/${id}`, data)
}

function DeleteS3Config(id: number): Promise<void> {
    return adminDelete<void>(`/s3-configs/${id}`)
}

export {
    // ... existing exports ...
    GetS3Configs,
    CreateS3Config,
    UpdateS3Config,
    DeleteS3Config,
}
