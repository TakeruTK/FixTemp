import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AppLanguage = 'es' | 'en' | 'zh-CN'

interface I18nContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  languageOptions: Array<{ code: AppLanguage; label: string; nativeLabel: string }>
}

const STORAGE_KEY = 'fixtemp-language'

const options: Array<{ code: AppLanguage; label: string; nativeLabel: string }> = [
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)', nativeLabel: '简体中文' }
]

function normalizeLanguage(value?: string | null): AppLanguage {
  if (!value) return 'es'
  const lower = value.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en'
  return 'es'
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    return normalizeLanguage(saved || (typeof navigator !== 'undefined' ? navigator.language : 'es'))
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    languageOptions: options
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
