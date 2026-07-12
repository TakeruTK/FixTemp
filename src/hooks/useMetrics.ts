import { startTransition, useEffect, useState } from 'react'
import type { Metrics } from '../types'

export function useMetrics() {
 const [data, setData] = useState<Metrics | null>(null)
 const [connected, setConnected] = useState(false)
 const [error, setError] = useState<string | null>(null)

 useEffect(() => {
 let active = true
 let timer = 0
 let online = false
 let stressActive = false
 let refreshing = false

 const schedule = () => {
 if (!active) return
 const delay = document.hidden ? (stressActive ? 1500 : 30000) : online ? (stressActive ? 1500 : 3000) : 15000
 timer = window.setTimeout(refresh, delay)
 }

 const refresh = async () => {
 if (refreshing) return
 refreshing = true
 window.clearTimeout(timer)
 try {
 const response = await fetch('/api/metrics/live', { signal: AbortSignal.timeout(7000) })
 if (!response.ok) throw new Error('No se pudo leer el equipo')
 const result = await response.json()
 online = true
 stressActive = Boolean(result.stress?.active)
 if (active) {
 startTransition(() => {
 setData(result)
 setConnected(true)
 setError(null)
 })
 }
 } catch (err) {
 online = false
 if (active) {
 startTransition(() => {
 setConnected(false)
 setError(err instanceof Error ? err.message : 'Sin conexi-n')
 })
 }
 } finally {
 refreshing = false
 schedule()
 }
 }

 const onVisibility = () => { if (!document.hidden) refresh() }
 document.addEventListener('visibilitychange', onVisibility)
 refresh()
 return () => {
 active = false
 window.clearTimeout(timer)
 document.removeEventListener('visibilitychange', onVisibility)
 }
 }, [])

 return { data, connected, error }
}
