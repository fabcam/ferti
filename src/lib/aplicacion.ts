import L from 'leaflet'
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

export function metrosPorPixel(lat: number, zoom: number) {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8)
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

interface OpcionesCapa {
  color: string
  anchoM: number
  opacidad?: number
  /** Mostrar el recorrido sin esparcir como línea punteada. */
  mostrarRecorrido?: boolean
  renderer?: L.Renderer
}

/**
 * Dibuja una aplicación sobre el mapa: franjas del ancho real (en metros) donde se esparció,
 * y opcionalmente el recorrido sin esparcir. Admite agregar puntos de a uno (grabación en vivo).
 */
export class CapaAplicacion {
  private grupo = L.layerGroup()
  private lineas: { linea: L.Polyline; esparciendo: boolean }[] = []
  private ultimo?: Punto
  private map?: L.Map
  private opts: Required<Omit<OpcionesCapa, 'renderer'>> & { renderer?: L.Renderer }

  constructor(opts: OpcionesCapa) {
    this.opts = { opacidad: 0.55, mostrarRecorrido: true, ...opts }
  }

  addTo(map: L.Map) {
    this.map = map
    this.grupo.addTo(map)
    map.on('zoomend', this.ajustarAncho)
    return this
  }

  remove() {
    this.map?.off('zoomend', this.ajustarAncho)
    this.grupo.remove()
    this.map = undefined
  }

  limpiar() {
    this.grupo.clearLayers()
    this.lineas = []
    this.ultimo = undefined
  }

  cargar(puntos: Punto[]) {
    this.limpiar()
    for (const p of puntos) this.agregar(p)
  }

  agregar(p: Punto) {
    const ll: L.LatLngTuple = [p.lat, p.lng]
    const actual = this.lineas.at(-1)
    const corte = !this.ultimo || p.t - this.ultimo.t > CORTE_MS
    if (!actual || corte || actual.esparciendo !== p.esparciendo) {
      // Nuevo tramo; si no hubo corte, arranca donde terminó el anterior para que no quede hueco.
      const inicio: L.LatLngTuple[] = !corte && this.ultimo ? [[this.ultimo.lat, this.ultimo.lng], ll] : [ll]
      if (p.esparciendo || this.opts.mostrarRecorrido) {
        const linea = L.polyline(inicio, this.estilo(p.esparciendo)).addTo(this.grupo)
        this.lineas.push({ linea, esparciendo: p.esparciendo })
      } else {
        this.lineas.push({ linea: L.polyline(inicio), esparciendo: false }) // marcador de tramo, sin dibujar
      }
    } else {
      actual.linea.addLatLng(ll)
    }
    this.ultimo = p
  }

  private anchoPx() {
    if (!this.map) return 4
    const mpp = metrosPorPixel(this.map.getCenter().lat, this.map.getZoom())
    return Math.max(2, this.opts.anchoM / mpp)
  }

  private estilo(esparciendo: boolean): L.PolylineOptions {
    if (esparciendo)
      return {
        color: this.opts.color,
        weight: this.anchoPx(),
        opacity: this.opts.opacidad,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer: this.opts.renderer,
      }
    return {
      color: '#ffffff',
      weight: 2,
      opacity: 0.7,
      dashArray: '4 6',
      interactive: false,
      renderer: this.opts.renderer,
    }
  }

  private ajustarAncho = () => {
    const w = this.anchoPx()
    for (const { linea, esparciendo } of this.lineas) if (esparciendo) linea.setStyle({ weight: w })
  }
}
