import { ListKeys } from "../utils/apiWrapper"
import { useAsync } from "./useAsync"

/** Access keys of the active Garage project (empty without the admin API). */
export function useKeys(projectId: number, enabled: boolean) {
    return useAsync(() => (enabled ? ListKeys() : undefined), [projectId, enabled])
}
