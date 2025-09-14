import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GetClusterLayout } from '../../utils/apiWrapper'

export default function ClusterLayout(){
  const { t } = useTranslation()
  const [layout, setLayout] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    GetClusterLayout()
      .then((res) => {
        if (!mounted) return
        const maybe = res as unknown
        const data = (maybe as { data?: unknown }).data
        setLayout(data ?? maybe)
      })
      .catch((e) => { if (mounted) setError((e as unknown as { message?: string })?.message || String(e)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  return (
    <div>
      <h3>{t('dashboard.cluster')}</h3>
      <p>{t('dashboard.cluster_desc')}</p>
      {loading && <div>{t('common.loading')}</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(layout, null, 2)}</pre>}
    </div>
  )
}
