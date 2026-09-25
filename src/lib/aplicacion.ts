import L from 'leaflet'
import type { Punto } from '../db'
import { CORTE_MS } from './recorrido'

export function metrosPorPixel(lat: number, zoom: number) {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8)
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
