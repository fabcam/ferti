import { useEffect, useRef, useState } from 'react'

export type EstadoWakeLock = 'no_soportado' | 'activo' | 'inactivo'

/**
 * Mantiene la pantalla encendida mientras `activo` sea true.
 * El sistema lo suelta al pasar a segundo plano, así que se vuelve a pedir al volver.
 */
export function useWakeLock(activo: boolean): { estado: EstadoWakeLock; pedir: () => void } {
  const soportado = 'wakeLock' in navigator
  const [estado, setEstado] = useState<EstadoWakeLock>(soportado ? 'inactivo' : 'no_soportado')
  // Safari puede exigir un toque del usuario: se expone `pedir` para llamarlo desde un botón.
  const pedirRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!soportado || !activo) return
    let lock: WakeLockSentinel | null = null
    let cancelado = false

    const pedir = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelado) {
          lock.release()
          return
        }
        setEstado('activo')
        lock.addEventListener('release', () => setEstado('inactivo'))
      } catch {
        setEstado('inactivo')
      }
    }

    pedirRef.current = pedir
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', pedir)
      lock?.release()
      pedirRef.current = () => {}
    }
  }, [activo, soportado])

  return { estado, pedir: () => pedirRef.current() }
}
