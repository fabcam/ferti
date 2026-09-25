import type { LatLng, Punto } from '../db'
import { CORTE_MS } from './recorrido'

const M_POR_GRADO = 111_320
/** Tope de celdas de la grilla (memoria y tiempo de cálculo en el celular). */
const MAX_CELDAS = 2_000_000
const CELDA_MIN_M = 0.5

export interface ResumenCobertura {
  /** % del área de la chacra que recibió producto. */
  porcentaje: number
  cubiertaHa: number
  /** Área de la chacra que recibió producto más de una vez. */
  solapeHa: number
  /** Área fuera del límite que recibió producto. */
  fueraHa: number
  /** Área total aplicada contando cada pasada (base para estimar kg). */
  aplicadaHa: number
}

/** Porcentaje truncado (nunca muestra 100 % si falta algo); con un decimal por debajo de 10. */
export function formatearPorcentaje(n: number) {
  const v = n < 10 ? Math.floor(n * 10) / 10 : Math.floor(n)
  return `${v.toLocaleString('es-UY')} %`
}

export type Resaltado = 'nada' | 'solapes' | 'huecos'

/**
 * Grilla de cobertura sobre la chacra. Cada celda cuenta cuántas pasadas distintas la cubrieron.
 *
 * Para no contar dos veces la misma pasada (los tramos consecutivos se superponen en las uniones),
 * cada celda guarda la distancia recorrida en el momento en que se la cubrió por última vez: si
 * se la vuelve a cubrir tras recorrer más de `umbral` metros (por ejemplo, después de dar la vuelta
 * en la cabecera), es otra pasada y cuenta como solape.
 */
export class Cobertura {
  readonly celda: number
  readonly ancho: number
  readonly alto: number
  private x0: number
  private y0: number
  private lat0: number
  private lng0: number
  private mLng: number
  private cuenta: Uint8Array
  private ultimaS: Float32Array
  private dentro: Uint8Array
  private celdasDentro = 0
  private radio: number
  private umbral: number

  private cubiertasDentro = 0
  private cubiertasFuera = 0
  private solapeDentro = 0
  private sumaPasadas = 0

  private anterior?: Punto
  private s = 0 // distancia recorrida acumulada (m)

  constructor(poligono: LatLng[], anchoM: number) {
    if (poligono.length < 3) throw new Error('La cobertura necesita el límite de la chacra')
    this.radio = anchoM / 2
    this.umbral = Math.max(2 * anchoM, 10)

    this.lat0 = poligono.reduce((a, p) => a + p[0], 0) / poligono.length
    this.lng0 = poligono.reduce((a, p) => a + p[1], 0) / poligono.length
    this.mLng = M_POR_GRADO * Math.cos((this.lat0 * Math.PI) / 180)

    const xy = poligono.map((p) => this.aXY(p[0], p[1]))
    const margen = anchoM * 2 + 10
    const minX = Math.min(...xy.map((p) => p[0])) - margen
    const maxX = Math.max(...xy.map((p) => p[0])) + margen
    const minY = Math.min(...xy.map((p) => p[1])) - margen
    const maxY = Math.max(...xy.map((p) => p[1])) + margen

    const area = (maxX - minX) * (maxY - minY)
    this.celda = Math.max(CELDA_MIN_M, Math.ceil(Math.sqrt(area / MAX_CELDAS) * 10) / 10)
    this.x0 = minX
    this.y0 = minY
    this.ancho = Math.ceil((maxX - minX) / this.celda)
    this.alto = Math.ceil((maxY - minY) / this.celda)

    const n = this.ancho * this.alto
    this.cuenta = new Uint8Array(n)
    this.ultimaS = new Float32Array(n).fill(Number.NEGATIVE_INFINITY)
    this.dentro = new Uint8Array(n)
    this.rasterizarPoligono(xy)
  }

  private aXY(lat: number, lng: number): [number, number] {
    return [(lng - this.lng0) * this.mLng, (lat - this.lat0) * M_POR_GRADO]
  }

  private aLatLng(x: number, y: number): LatLng {
    return [this.lat0 + y / M_POR_GRADO, this.lng0 + x / this.mLng]
  }

  /** Esquinas [suroeste, noreste] de la grilla, para ubicar la imagen en el mapa. */
  limites(): [LatLng, LatLng] {
    return [this.aLatLng(this.x0, this.y0), this.aLatLng(this.x0 + this.ancho * this.celda, this.y0 + this.alto * this.celda)]
  }

  private rasterizarPoligono(xy: [number, number][]) {
    const cortes: number[] = []
    for (let j = 0; j < this.alto; j++) {
      const y = this.y0 + (j + 0.5) * this.celda
      cortes.length = 0
      for (let k = 0; k < xy.length; k++) {
        const [ax, ay] = xy[k]
        const [bx, by] = xy[(k + 1) % xy.length]
        if (ay <= y !== by <= y) cortes.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
      }
      cortes.sort((a, b) => a - b)
      for (let k = 0; k + 1 < cortes.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((cortes[k] - this.x0) / this.celda - 0.5))
        const i1 = Math.min(this.ancho - 1, Math.floor((cortes[k + 1] - this.x0) / this.celda - 0.5))
        for (let i = i0; i <= i1; i++) {
          this.dentro[j * this.ancho + i] = 1
          this.celdasDentro++
        }
      }
    }
  }

  cargar(puntos: Punto[]) {
    for (const p of puntos) this.agregar(p)
    return this
  }

  agregar(p: Punto) {
    const prev = this.anterior
    this.anterior = p
    if (!prev) return
    const [ax, ay] = this.aXY(prev.lat, prev.lng)
    const [bx, by] = this.aXY(p.lat, p.lng)
    const largo = Math.hypot(bx - ax, by - ay)
    const s0 = this.s
    this.s += largo
    if (!prev.esparciendo || !p.esparciendo || p.t - prev.t > CORTE_MS) return
    this.estampar(ax, ay, bx, by, largo, s0)
  }

  /** Marca las celdas a menos de `radio` del tramo AB. */
  private estampar(ax: number, ay: number, bx: number, by: number, largo: number, s0: number) {
    const r = this.radio
    const c = this.celda
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - this.x0) / c))
    const i1 = Math.min(this.ancho - 1, Math.floor((Math.max(ax, bx) + r - this.x0) / c))
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - r - this.y0) / c))
    const j1 = Math.min(this.alto - 1, Math.floor((Math.max(ay, by) + r - this.y0) / c))
    if (i0 > i1 || j0 > j1) return

    const dx = bx - ax
    const dy = by - ay
    const l2 = largo * largo
    const r2 = r * r

    for (let j = j0; j <= j1; j++) {
      const py = this.y0 + (j + 0.5) * c
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + (i + 0.5) * c
        let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const qx = ax + t * dx - px
        const qy = ay + t * dy - py
        if (qx * qx + qy * qy > r2) continue

        const k = j * this.ancho + i
        const s = s0 + t * largo
        if (s - this.ultimaS[k] > this.umbral) {
          const antes = this.cuenta[k]
          if (antes < 255) this.cuenta[k] = antes + 1
          this.sumaPasadas++
          if (this.dentro[k]) {
            if (antes === 0) this.cubiertasDentro++
            else if (antes === 1) this.solapeDentro++
          } else if (antes === 0) {
            this.cubiertasFuera++
          }
        }
        this.ultimaS[k] = s
      }
    }
  }

  resumen(): ResumenCobertura {
    const haCelda = (this.celda * this.celda) / 10_000
    return {
      porcentaje: this.celdasDentro ? (this.cubiertasDentro / this.celdasDentro) * 100 : 0,
      cubiertaHa: this.cubiertasDentro * haCelda,
      solapeHa: this.solapeDentro * haCelda,
      fueraHa: this.cubiertasFuera * haCelda,
      aplicadaHa: this.sumaPasadas * haCelda,
    }
  }

  /** Imagen de la grilla (fila 0 = norte) resaltando solapes o huecos. */
  dibujar(modo: Resaltado, canvas: HTMLCanvasElement) {
    canvas.width = this.ancho
    canvas.height = this.alto
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(this.ancho, this.alto)
    const d = img.data
    for (let j = 0; j < this.alto; j++) {
      const fila = (this.alto - 1 - j) * this.ancho
      for (let i = 0; i < this.ancho; i++) {
        const k = j * this.ancho + i
        const n = this.cuenta[k]
        const o = (fila + i) * 4
        if (modo === 'solapes' && n >= 2) {
          d[o] = 255; d[o + 1] = 32; d[o + 2] = 32; d[o + 3] = n >= 3 ? 230 : 190
        } else if (modo === 'huecos' && n === 0 && this.dentro[k]) {
          d[o] = 255; d[o + 1] = 45; d[o + 2] = 149; d[o + 3] = 170
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  }
}
