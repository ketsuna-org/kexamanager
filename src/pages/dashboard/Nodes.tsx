import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GetNodeStatistics } from '../../utils/apiWrapper'

export default function Nodes(){
  const { t } = useTranslation()
  const [nodes, setNodes] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
  GetNodeStatistics()
      .then((res) => {
        if (!mounted) return
        const maybe = res as unknown
        const data = (maybe as { data?: unknown }).data
        if (Array.isArray(data)) setNodes(data)
        else if (Array.isArray(maybe)) setNodes(maybe as unknown[])
        else setNodes([])
      })
      .catch((e) => { if (mounted) setError((e as unknown as { message?: string })?.message || String(e)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  return (
    <div>
      <h3>{t('dashboard.nodes')}</h3>
      <p>{t('dashboard.nodes_desc')}</p>
      {loading && <div>{t('common.loading')}</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && (
        <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(nodes, null, 2)}</pre>
      )}
    </div>
  )
}
