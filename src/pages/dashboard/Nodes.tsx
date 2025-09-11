import { useTranslation } from 'react-i18next'

export default function Nodes(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.nodes')}</h3><p>{t('dashboard.nodes_desc')}</p></div>
}
