import { useEffect, useState } from 'react'
import type { LatLng } from '../db'

const OPCIONES: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }

export function mensajeErrorGps(e: GeolocationPositionError) {
  if (e.code === e.PERMISSION_DENIED)
    return 'Sin permiso de ubicación. En el iPhone: Ajustes → Privacidad → Localización → Safari.'
  if (e.code === e.POSITION_UNAVAILABLE) return 'No se puede obtener la ubicación.'
  return 'El GPS tarda en responder…'
}

/** Sigue la ubicación mientras `activo` sea true. */
export function useUbicacion(activo = true) {
  const [pos, setPos] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activo) return
    if (!('geolocation' in navigator)) {
      setError('Este dispositivo no tiene GPS disponible.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos(p)
        setError(null)
      },
      (e) => setError(mensajeErrorGps(e)),
      OPCIONES,
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [activo])

  return { pos, error }
}

export interface Muestreo {
  lecturas: number
  objetivo: number
  ultimaPrecision?: number
}

export interface OpcionesPromedio {
  lecturas?: number // lecturas buenas a juntar
  precisionMaxM?: number // descartar lecturas peores que esto
  tiempoMaxMs?: number
  onProgreso?: (m: Muestreo) => void
  signal?: AbortSignal
}

/**
 * Junta varias lecturas del GPS y devuelve el promedio ponderado por precisión (1/acc²).
 * Si se acaba el tiempo con al menos una lectura buena, usa lo que haya.
 */
export function promediarPosicion({
  lecturas = 5,
  precisionMaxM = 25,
  tiempoMaxMs = 15_000,
  onProgreso,
  signal,
}: OpcionesPromedio = {}): Promise<{ punto: LatLng; precision: number; lecturas: number }> {
  return new Promise((resolve, reject) => {
    const buenas: GeolocationCoordinates[] = []
    let id = -1

    const terminar = () => {
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancelar)
      if (!buenas.length) {
        reject(new Error(`No se logró una lectura con precisión mejor que ${precisionMaxM} m.`))
        return
      }
      let sw = 0, lat = 0, lng = 0
      for (const c of buenas) {
        const w = 1 / Math.max(c.accuracy, 1) ** 2
        sw += w
        lat += c.latitude * w
        lng += c.longitude * w
      }
      // Precisión estimada del promedio (no mejor que la mejor lectura / √n).
      const mejor = Math.min(...buenas.map((c) => c.accuracy))
      resolve({ punto: [lat / sw, lng / sw], precision: mejor / Math.sqrt(buenas.length), lecturas: buenas.length })
    }

    const cancelar = () => {
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      reject(new DOMException('Cancelado', 'AbortError'))
    }

    const timer = setTimeout(terminar, tiempoMaxMs)
    signal?.addEventListener('abort', cancelar)

    id = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy <= precisionMaxM) buenas.push(p.coords)
        onProgreso?.({ lecturas: buenas.length, objetivo: lecturas, ultimaPrecision: p.coords.accuracy })
        if (buenas.length >= lecturas) terminar()
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          clearTimeout(timer)
          navigator.geolocation.clearWatch(id)
          reject(new Error(mensajeErrorGps(e)))
        }
      },
      OPCIONES,
    )
  })
}
