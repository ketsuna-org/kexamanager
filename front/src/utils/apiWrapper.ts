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
function CheckDomain(domain: string): Promise<null> {
    return adminGet<null>(`/check/${domain}`)
}

function Health(): Promise<null> {
    return adminGet<null>("/health")
}

function Metrics(): Promise<null> {
    return adminGet<null>("/metrics")
}

// --- Buckets ---
function AddBucketAlias(data: components["schemas"]["AddBucketAliasRequest"]): Promise<components["schemas"]["AddBucketAliasResponse"]> {
    return adminPost<components["schemas"]["AddBucketAliasResponse"]>("/v2/AddBucketAlias", data)
}

function RemoveBucketAlias(data: components["schemas"]["RemoveBucketAliasRequest"]): Promise<components["schemas"]["RemoveBucketAliasResponse"]> {
    return adminPost<components["schemas"]["RemoveBucketAliasResponse"]>("/v2/RemoveBucketAlias", data)
}

function CreateBucket(data: components["schemas"]["CreateBucketRequest"]): Promise<components["schemas"]["CreateBucketResponse"]> {
    return adminPost<components["schemas"]["CreateBucketResponse"]>("/v2/CreateBucket", data)
}

function DeleteBucket(params: { id: string }): Promise<void> {
    return adminPost<void>("/v2/DeleteBucket", undefined, { query: { id: params.id } })
}

function GetBucketInfo(query: paths["/v2/GetBucketInfo"]["get"]["parameters"]["query"]): Promise<components["schemas"]["GetBucketInfoResponse"]> {
    return adminGet<components["schemas"]["GetBucketInfoResponse"]>("/v2/GetBucketInfo", { query })
}

function UpdateBucket(params: { id: string }, data: components["schemas"]["UpdateBucketRequestBody"]): Promise<components["schemas"]["UpdateBucketResponse"]> {
    return adminPost<components["schemas"]["UpdateBucketResponse"]>("/v2/UpdateBucket", data, { query: { id: params.id } })
}

// --- Keys / Tokens ---
function CreateKey(data: components["schemas"]["CreateKeyRequest"]): Promise<components["schemas"]["CreateKeyResponse"]> {
    return adminPost<components["schemas"]["CreateKeyResponse"]>("/v2/CreateKey", data)
}

function DeleteKey(params: { id: string }): Promise<void> {
    return adminPost<void>("/v2/DeleteKey", undefined, { query: { id: params.id } })
}

function GetKeyInfo(query: paths["/v2/GetKeyInfo"]["get"]["parameters"]["query"]): Promise<components["schemas"]["GetKeyInfoResponse"]> {
    return adminGet<components["schemas"]["GetKeyInfoResponse"]>("/v2/GetKeyInfo", { query })
}

function UpdateKey(params: { id: string }, data: components["schemas"]["UpdateKeyRequestBody"]): Promise<components["schemas"]["UpdateKeyResponse"]> {
    return adminPost<components["schemas"]["UpdateKeyResponse"]>("/v2/UpdateKey", data, { query: { id: params.id } })
}

function ImportKey(data: components["schemas"]["ImportKeyRequest"]): Promise<components["schemas"]["ImportKeyResponse"]> {
    return adminPost<components["schemas"]["ImportKeyResponse"]>("/v2/ImportKey", data)
}

// --- Bucket Key Permissions ---
function AllowBucketKey(data: components["schemas"]["AllowBucketKeyRequest"]): Promise<components["schemas"]["AllowBucketKeyResponse"]> {
    return adminPost<components["schemas"]["AllowBucketKeyResponse"]>("/v2/AllowBucketKey", data)
}

function DenyBucketKey(data: components["schemas"]["DenyBucketKeyRequest"]): Promise<components["schemas"]["DenyBucketKeyResponse"]> {
    return adminPost<components["schemas"]["DenyBucketKeyResponse"]>("/v2/DenyBucketKey", data)
}

// --- Cluster layout & status ---
function GetClusterStatus(): Promise<components["schemas"]["GetClusterStatusResponse"]> {
    return adminGet<components["schemas"]["GetClusterStatusResponse"]>("/v2/GetClusterStatus")
}

function GetClusterLayout(): Promise<components["schemas"]["GetClusterLayoutResponse"]> {
    return adminGet<components["schemas"]["GetClusterLayoutResponse"]>("/v2/GetClusterLayout")
}

function GetClusterLayoutHistory(): Promise<components["schemas"]["GetClusterLayoutHistoryResponse"]> {
    return adminGet<components["schemas"]["GetClusterLayoutHistoryResponse"]>("/v2/GetClusterLayoutHistory")
}

function UpdateClusterLayout(data: components["schemas"]["UpdateClusterLayoutRequest"]): Promise<components["schemas"]["UpdateClusterLayoutResponse"]> {
    return adminPost<components["schemas"]["UpdateClusterLayoutResponse"]>("/v2/UpdateClusterLayout", data)
}

function ApplyClusterLayout(data: components["schemas"]["ApplyClusterLayoutRequest"]): Promise<components["schemas"]["ApplyClusterLayoutResponse"]> {
    return adminPost<components["schemas"]["ApplyClusterLayoutResponse"]>("/v2/ApplyClusterLayout", data)
}

function PreviewClusterLayoutChanges(): Promise<components["schemas"]["PreviewClusterLayoutChangesResponse"]> {
    return adminGet<components["schemas"]["PreviewClusterLayoutChangesResponse"]>("/v2/PreviewClusterLayoutChanges")
}

function RevertClusterLayout(): Promise<components["schemas"]["RevertClusterLayoutResponse"]> {
    return adminPost<components["schemas"]["RevertClusterLayoutResponse"]>("/v2/RevertClusterLayout")
}

function ClusterLayoutSkipDeadNodes(data: components["schemas"]["ClusterLayoutSkipDeadNodesRequest"]): Promise<components["schemas"]["ClusterLayoutSkipDeadNodesResponse"]> {
    return adminPost<components["schemas"]["ClusterLayoutSkipDeadNodesResponse"]>("/v2/ClusterLayoutSkipDeadNodes", data)
}

// --- Cluster health & stats ---
function GetClusterHealth(): Promise<components["schemas"]["GetClusterHealthResponse"]> {
    return adminGet<components["schemas"]["GetClusterHealthResponse"]>("/v2/GetClusterHealth")
}

function GetClusterStatistics(): Promise<components["schemas"]["GetClusterStatisticsResponse"]> {
    return adminGet<components["schemas"]["GetClusterStatisticsResponse"]>("/v2/GetClusterStatistics")
}

// --- Admin tokens ---
function CreateAdminToken(data: components["schemas"]["UpdateAdminTokenRequestBody"]): Promise<components["schemas"]["CreateAdminTokenResponse"]> {
    return adminPost<components["schemas"]["CreateAdminTokenResponse"]>("/v2/CreateAdminToken", data)
}

function ListAdminTokens(): Promise<components["schemas"]["ListAdminTokensResponse"]> {
    return adminGet<components["schemas"]["ListAdminTokensResponse"]>("/v2/ListAdminTokens")
}

function GetAdminTokenInfo(query: paths["/v2/GetAdminTokenInfo"]["get"]["parameters"]["query"]): Promise<components["schemas"]["GetAdminTokenInfoResponse"]> {
    return adminGet<components["schemas"]["GetAdminTokenInfoResponse"]>("/v2/GetAdminTokenInfo", { query })
}

function UpdateAdminToken(params: { id: string }, data: components["schemas"]["UpdateAdminTokenRequestBody"]): Promise<components["schemas"]["UpdateAdminTokenResponse"]> {
    return adminPost<components["schemas"]["UpdateAdminTokenResponse"]>("/v2/UpdateAdminToken", data, { query: { id: params.id } })
}

function DeleteAdminToken(params: { id: string }): Promise<void> {
    return adminPost<void>("/v2/DeleteAdminToken", undefined, { query: { id: params.id } })
}

// --- Nodes, blocks, workers ---
function GetNodeInfo(params: { node?: string } = {}): Promise<components["schemas"]["MultiResponse_LocalGetNodeInfoResponse"]> {
    const node = params.node ?? "*"
    return adminGet<components["schemas"]["MultiResponse_LocalGetNodeInfoResponse"]>("/v2/GetNodeInfo", { query: { node } })
}

function GetNodeStatistics(params: { node?: string } = {}): Promise<components["schemas"]["MultiResponse_LocalGetNodeStatisticsResponse"]> {
    const node = params.node ?? "*"
    return adminGet<components["schemas"]["MultiResponse_LocalGetNodeStatisticsResponse"]>("/v2/GetNodeStatistics", { query: { node } })
}

function GetBlockInfo(params: { node?: string } = {}, data: components["schemas"]["LocalGetBlockInfoRequest"]): Promise<components["schemas"]["MultiResponse_LocalGetBlockInfoResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalGetBlockInfoResponse"]>("/v2/GetBlockInfo", data, { query: { node } })
}

function ListBlockErrors(params: { node?: string } = {}): Promise<components["schemas"]["MultiResponse_LocalListBlockErrorsResponse"]> {
    const node = params.node ?? "*"
    return adminGet<components["schemas"]["MultiResponse_LocalListBlockErrorsResponse"]>("/v2/ListBlockErrors", { query: { node } })
}

function PurgeBlocks(params: { node?: string } = {}, data: components["schemas"]["LocalPurgeBlocksRequest"]): Promise<components["schemas"]["MultiResponse_LocalPurgeBlocksResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalPurgeBlocksResponse"]>("/v2/PurgeBlocks", data, { query: { node } })
}

function RetryBlockResync(params: { node?: string } = {}, data: components["schemas"]["LocalRetryBlockResyncRequest"]): Promise<components["schemas"]["MultiResponse_LocalRetryBlockResyncResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalRetryBlockResyncResponse"]>("/v2/RetryBlockResync", data, { query: { node } })
}

function LaunchRepairOperation(
    params: { node?: string } = {},
    data: components["schemas"]["LocalLaunchRepairOperationRequest"],
): Promise<components["schemas"]["MultiResponse_LocalLaunchRepairOperationResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalLaunchRepairOperationResponse"]>("/v2/LaunchRepairOperation", data, { query: { node } })
}

function ListWorkers(params: { node?: string } = {}, data: components["schemas"]["LocalListWorkersRequest"]): Promise<components["schemas"]["MultiResponse_LocalListWorkersResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalListWorkersResponse"]>("/v2/ListWorkers", data, { query: { node } })
}

function GetWorkerInfo(params: { node?: string } = {}, data: components["schemas"]["LocalGetWorkerInfoRequest"]): Promise<components["schemas"]["MultiResponse_LocalGetWorkerInfoResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalGetWorkerInfoResponse"]>("/v2/GetWorkerInfo", data, { query: { node } })
}

function GetWorkerVariable(
    params: { node?: string } = {},
    data: components["schemas"]["LocalGetWorkerVariableRequest"],
): Promise<components["schemas"]["MultiResponse_LocalGetWorkerVariableResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalGetWorkerVariableResponse"]>("/v2/GetWorkerVariable", data, { query: { node } })
}

function SetWorkerVariable(
    params: { node?: string } = {},
    data: components["schemas"]["LocalSetWorkerVariableRequest"],
): Promise<components["schemas"]["MultiResponse_LocalSetWorkerVariableResponse"]> {
    const node = params.node ?? "*"
    return adminPost<components["schemas"]["MultiResponse_LocalSetWorkerVariableResponse"]>("/v2/SetWorkerVariable", data, { query: { node } })
}

// --- Objects ---
function InspectObject(query: paths["/v2/InspectObject"]["get"]["parameters"]["query"]): Promise<components["schemas"]["InspectObjectResponse"]> {
    return adminGet<components["schemas"]["InspectObjectResponse"]>("/v2/InspectObject", { query })
}

// --- Misc / maintenance ---
function CleanupIncompleteUploads(data: components["schemas"]["CleanupIncompleteUploadsRequest"]): Promise<components["schemas"]["CleanupIncompleteUploadsResponse"]> {
    return adminPost<components["schemas"]["CleanupIncompleteUploadsResponse"]>("/v2/CleanupIncompleteUploads", data)
}

function ConnectClusterNodes(data: components["schemas"]["ConnectClusterNodesRequest"]): Promise<components["schemas"]["ConnectClusterNodesResponse"]> {
    return adminPost<components["schemas"]["ConnectClusterNodesResponse"]>("/v2/ConnectClusterNodes", data)
}

function CreateMetadataSnapshot(node: string): Promise<components["schemas"]["MultiResponse_LocalCreateMetadataSnapshotResponse"]> {
    return adminGet<components["schemas"]["MultiResponse_LocalCreateMetadataSnapshotResponse"]>("/v2/CreateMetadataSnapshot", { query: { node } })
}

function ListBuckets(configId: number): Promise<components["schemas"]["ListBucketsResponse"]> {
    return adminPost<components["schemas"]["ListBucketsResponse"]>("/api/s3/list-buckets", { configId, keyId: "", token: "" })
}

function ListKeys(): Promise<components["schemas"]["ListKeysResponse"]> {
    return adminGet<components["schemas"]["ListKeysResponse"]>("/v2/ListKeys")
}

function ListAdminTokensSimple(): Promise<components["schemas"]["ListAdminTokensResponse"]> {
    return adminGet<components["schemas"]["ListAdminTokensResponse"]>("/v2/ListAdminTokens")
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
