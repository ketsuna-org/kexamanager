export function setPreviewSession(params: { key: string; url?: string; mime?: string; bucket?: string }) {
  try {
    if (params.key !== undefined) sessionStorage.setItem('kexamanager:preview:key', params.key)
    if (params.url !== undefined) sessionStorage.setItem('kexamanager:preview:url', params.url)
    if (params.mime !== undefined) sessionStorage.setItem('kexamanager:preview:mime', params.mime)
    if (params.bucket !== undefined) sessionStorage.setItem('kexamanager:preview:bucket', params.bucket)
  } catch {
    // ignore sessionStorage errors
  }
}

export function clearPreviewSession() {
  try {
    sessionStorage.removeItem('kexamanager:preview:key')
    sessionStorage.removeItem('kexamanager:preview:url')
    sessionStorage.removeItem('kexamanager:preview:mime')
    sessionStorage.removeItem('kexamanager:preview:bucket')
  } catch {
    // ignore
  }
}

export default { setPreviewSession, clearPreviewSession }
