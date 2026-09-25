import type { Punto } from '../db'

/** Si entre dos lecturas pasa más que esto (pantalla bloqueada, sin señal), no se une el trazo. */
export const CORTE_MS = 15_000
/** Lecturas con peor precisión que esto no se registran. */
export const PRECISION_MAX_M = 20
/** Distancia mínima entre puntos guardados (evita juntar ruido estando quieto). */
export const DISTANCIA_MIN_M = 1
/** Velocidad por encima de la cual una lectura se considera un salto del GPS (≈ 180 km/h). */
export const VELOCIDAD_MAX_MS = 50

const R = 6_371_008.8

export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Rumbo en grados (0 = norte, sentido horario) de a hacia b. */
export function rumboEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad)
  return ((Math.atan2(y, x) / rad) + 360) % 360
}

export interface Resumen {
  distanciaEsparcidaM: number
  tiempoEsparciendoMs: number
  haAprox: number
}

export const RESUMEN_VACIO: Resumen = { distanciaEsparcidaM: 0, tiempoEsparciendoMs: 0, haAprox: 0 }

/** Suma el tramo entre `prev` y `p` al resumen (sin contar solapes; eso lo calcula la grilla). */
export function acumular(r: Resumen, prev: Punto | undefined, p: Punto, anchoM: number): Resumen {
  if (!prev || !prev.esparciendo || !p.esparciendo || p.t - prev.t > CORTE_MS) return r
  const d = distanciaM(prev, p)
  return {
    distanciaEsparcidaM: r.distanciaEsparcidaM + d,
    tiempoEsparciendoMs: r.tiempoEsparciendoMs + (p.t - prev.t),
    haAprox: r.haAprox + (d * anchoM) / 10_000,
  }
}

export function resumir(puntos: Punto[], anchoM: number): Resumen {
  let r = RESUMEN_VACIO
  for (let i = 1; i < puntos.length; i++) r = acumular(r, puntos[i - 1], puntos[i], anchoM)
  return r
}

export function formatearDuracion(ms: number) {
  const min = Math.floor(ms / 60_000)
  const h = Math.floor(min / 60)
  return h ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`
}
