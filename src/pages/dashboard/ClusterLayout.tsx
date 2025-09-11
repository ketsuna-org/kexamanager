import { useTranslation } from 'react-i18next'

export default function ClusterLayout(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.cluster')}</h3><p>{t('dashboard.cluster_desc')}</p></div>
}
