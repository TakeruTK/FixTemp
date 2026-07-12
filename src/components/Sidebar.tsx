import { Activity, Cpu, Download, Gamepad2, HeartPulse, Info, LayoutDashboard, Settings, ShieldCheck, TestTubeDiagonal } from 'lucide-react'
import { useI18n } from '../i18n'

export type View = 'dashboard' | 'stress' | 'hardware' | 'health' | 'overlay' | 'settings' | 'updates'

const copy = {
  es: {
    items: { dashboard: 'Resumen', stress: 'Pruebas de estrÃ©s', overlay: 'Overlay', hardware: 'Mi equipo', health: 'Salud del dispositivo' },
    tools: 'HERRAMIENTAS',
    performance: 'Rendimiento',
    storage: 'Almacenamiento',
    protection: 'ProtecciÃ³n activa',
    settings: 'Ajustes',
    updates: 'Actualizaciones',
    about: 'Acerca de'
  },
  en: {
    items: { dashboard: 'Overview', stress: 'Stress tests', overlay: 'Overlay', hardware: 'My device', health: 'Device health' },
    tools: 'TOOLS',
    performance: 'Performance',
    storage: 'Storage',
    protection: 'Protection active',
    settings: 'Settings',
    updates: 'Updates',
    about: 'About'
  },
  'zh-CN': {
    items: { dashboard: 'æ¦‚è§ˆ', stress: 'åŽ‹åŠ›æµ‹è¯•', overlay: 'æ‚¬æµ®å±‚', hardware: 'æˆ‘çš„è®¾å¤‡', health: 'è®¾å¤‡å¥åº·' },
    tools: 'å·¥å…·',
    performance: 'æ€§èƒ½',
    storage: 'å­˜å‚¨',
    protection: 'ä¿æŠ¤å·²å¯ç”¨',
    settings: 'è®¾ç½®',
    updates: 'æ›´æ–°',
    about: 'å…³äºŽ'
  }
} as const

export function Sidebar({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const { language } = useI18n()
  const text = copy[language]
  const items = [
    { id: 'dashboard' as const, label: text.items.dashboard, icon: LayoutDashboard },
    { id: 'stress' as const, label: text.items.stress, icon: TestTubeDiagonal },
    { id: 'overlay' as const, label: text.items.overlay, icon: Gamepad2 },
    { id: 'hardware' as const, label: text.items.hardware, icon: Cpu },
    { id: 'health' as const, label: text.items.health, icon: HeartPulse }
  ]

  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand__mark"><Activity size={19}/></div><div><strong>PULSE</strong><span>GUARD</span></div></div>
      <nav>{items.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onChange(id)}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar__footer">
        <div className="safe"><ShieldCheck size={16}/><span>{text.protection}</span></div>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => onChange('settings')}><Settings size={17}/><span>{text.settings}</span></button>
        <button className={view === 'updates' ? 'active' : ''} onClick={() => onChange('updates')}><Download size={17}/><span>{text.updates}</span></button>
        <button disabled><Info size={17}/><span>{text.about}</span></button>
      </div>
    </aside>
  )
}
