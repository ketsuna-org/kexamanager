import { useTranslation } from 'react-i18next'

export default function AdminTokens(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.adminTokens')}</h3><p>{t('dashboard.adminTokens_desc')}</p></div>
}
