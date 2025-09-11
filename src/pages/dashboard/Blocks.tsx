import { useTranslation } from 'react-i18next'

export default function Blocks(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.blocks')}</h3><p>{t('dashboard.blocks_desc')}</p></div>
}
