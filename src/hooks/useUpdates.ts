import { useCallback, useEffect, useMemo, useState } from 'react'

interface UpdateDownloadState {
  active: boolean
  percent: number
  filePath: string | null
  error: string | null
}

export interface UpdateState {
  available: boolean
  checking: boolean
  checkedAt: number
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl: string | null
  changelog: string
  error: string | null
  download: UpdateDownloadState
}

const dismissedKey = 'pulseguard-dismissed-update-version'
const defaultState: UpdateState = {
  available: true,
  checking: false,
  checkedAt: 0,
  currentVersion: '0.0.0',
  latestVersion: '0.0.0',
  hasUpdate: false,
  downloadUrl: null,
  changelog: '',
  error: null,
  download: { active: false, percent: 0, filePath: null, error: null }
}

export function useUpdates() {
  const [state, setState] = useState<UpdateState>(defaultState)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(dismissedKey) } catch { return null }
  })
  const [installing, setInstalling] = useState(false)

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/update/status', { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error('No se pudo leer el estado de actualización')
    const result = await response.json() as UpdateState
    setState(result)
    if (!result.hasUpdate || result.latestVersion !== dismissedVersion) {
      setDismissedVersion(current => {
        if (!result.hasUpdate || result.latestVersion !== current) return null
        return current
      })
      if (!result.hasUpdate || result.latestVersion !== dismissedVersion) {
        try { localStorage.removeItem(dismissedKey) } catch {}
      }
    }
    return result
  }, [dismissedVersion])

  const check = useCallback(async (force = false) => {
    const response = await fetch('/api/update/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || result.detail || 'No se pudo verificar actualizaciones')
    setState(current => ({ ...current, ...result }))
    return result as UpdateState
  }, [])

  const startDownload = useCallback(async () => {
    if (!state.downloadUrl) return
    const response = await fetch('/api/update/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadUrl: state.downloadUrl })
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'No se pudo iniciar la descarga')
    setState(current => ({ ...current, download: { ...current.download, active: true, percent: 0, error: null } }))
  }, [state.downloadUrl])

  const install = useCallback(async () => {
    setInstalling(true)
    try {
      await fetch('/api/update/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    } finally {
      setInstalling(false)
    }
  }, [])

  const dismiss = useCallback(() => {
    if (!state.latestVersion) return
    setDismissedVersion(state.latestVersion)
    try { localStorage.setItem(dismissedKey, state.latestVersion) } catch {}
  }, [state.latestVersion])

  useEffect(() => {
    let active = true
    let timer = 0

    const refresh = async () => {
      try {
        await loadStatus()
      } catch {
        // no-op
      } finally {
        if (!active) return
        const delay = state.download.active ? 1000 : document.hidden ? 15 * 60 * 1000 : 5 * 60 * 1000
        timer = window.setTimeout(refresh, delay)
      }
    }

    void refresh()
    const kickoff = window.setTimeout(() => { void check(false).catch(() => {}) }, 3500)
    return () => {
      active = false
      window.clearTimeout(timer)
      window.clearTimeout(kickoff)
    }
  }, [check, loadStatus, state.download.active])

  const visibleUpdate = useMemo(() => state.hasUpdate && dismissedVersion !== state.latestVersion, [dismissedVersion, state.hasUpdate, state.latestVersion])

  return {
    state,
    visibleUpdate,
    installing,
    check,
    loadStatus,
    startDownload,
    install,
    dismiss
  }
}
