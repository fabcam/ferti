import type { LatLng } from '../db'

const M_POR_GRADO = 111_320

export interface LineaGuia {
  /** Fuerte: borde del carril (cada 2 anchos). Clara: centro del carril. */
  tipo: 'fuerte' | 'clara'
  /** Tramos dentro de la chacra (una línea puede cortarse si el límite es cóncavo). */
  tramos: [LatLng, LatLng][]
}

/**
 * Líneas guía paralelas al lado `lado` (del vértice `lado` al siguiente) del límite.
 *
 * Los carriles miden 2 × ancho y tienen una línea clara al medio: en total hay una línea cada
 * `anchoM`, alternando fuerte y clara. Pasando por cada línea se cubre todo sin huecos.
 * La primera línea va a medio ancho del lado elegido, para que esa pasada llegue justo al borde.
 */
export function calcularGuias(poligono: LatLng[], lado: number, anchoM: number): LineaGuia[] {
  const n = poligono.length
  if (n < 3 || lado < 0 || lado >= n || anchoM <= 0) return []

  const lat0 = poligono.reduce((a, p) => a + p[0], 0) / n
  const lng0 = poligono.reduce((a, p) => a + p[1], 0) / n
  const mLng = M_POR_GRADO * Math.cos((lat0 * Math.PI) / 180)
  const aXY = ([lat, lng]: LatLng): [number, number] => [(lng - lng0) * mLng, (lat - lat0) * M_POR_GRADO]
  const aLatLng = (x: number, y: number): LatLng => [lat0 + y / M_POR_GRADO, lng0 + x / mLng]

  const xy = poligono.map(aXY)
  const [ax, ay] = xy[lado]
  const [bx, by] = xy[(lado + 1) % n]
  const largo = Math.hypot(bx - ax, by - ay)
  if (largo < 1) return []
  const ux = (bx - ax) / largo
  const uy = (by - ay) / largo

  // Normal hacia adentro: del lado donde queda el resto del polígono.
  let nx = -uy
  let ny = ux
  const cx = xy.reduce((a, p) => a + p[0], 0) / n - ax
  const cy = xy.reduce((a, p) => a + p[1], 0) / n - ay
  if (cx * nx + cy * ny < 0) {
    nx = -nx
    ny = -ny
  }

  // Hasta dónde llega la chacra en dirección de la normal.
  const alcance = Math.max(...xy.map(([x, y]) => (x - ax) * nx + (y - ay) * ny))

  const lineas: LineaGuia[] = []
  for (let k = 0; ; k++) {
    const d = anchoM / 2 + k * anchoM
    if (d > alcance) break
    // Recta: O + t·u, con O = A + d·n. Se corta con cada lado del polígono.
    const ox = ax + nx * d
    const oy = ay + ny * d
    const cortes: number[] = []
    for (let i = 0; i < n; i++) {
      const [px, py] = xy[i]
      const [qx, qy] = xy[(i + 1) % n]
      // Distancias con signo de P y Q a la recta; hay corte si cambian de signo.
      const sp = (px - ox) * nx + (py - oy) * ny
      const sq = (qx - ox) * nx + (qy - oy) * ny
      if ((sp < 0) === (sq < 0)) continue
      const f = sp / (sp - sq)
      const ix = px + (qx - px) * f
      const iy = py + (qy - py) * f
      cortes.push((ix - ox) * ux + (iy - oy) * uy)
    }
    cortes.sort((a, b) => a - b)
    const tramos: [LatLng, LatLng][] = []
    for (let i = 0; i + 1 < cortes.length; i += 2) {
      if (cortes[i + 1] - cortes[i] < 0.5) continue
      tramos.push([
        aLatLng(ox + ux * cortes[i], oy + uy * cortes[i]),
        aLatLng(ox + ux * cortes[i + 1], oy + uy * cortes[i + 1]),
      ])
    }
    if (tramos.length) lineas.push({ tipo: k % 2 === 0 ? 'fuerte' : 'clara', tramos })
  }
  return lineas
}

/** Largo de cada lado en metros, para mostrar al elegir. */
export function largosDeLados(poligono: LatLng[]): number[] {
  const lat0 = poligono.reduce((a, p) => a + p[0], 0) / poligono.length
  const mLng = M_POR_GRADO * Math.cos((lat0 * Math.PI) / 180)
  return poligono.map((p, i) => {
    const q = poligono[(i + 1) % poligono.length]
    return Math.hypot((q[1] - p[1]) * mLng, (q[0] - p[0]) * M_POR_GRADO)
  })
}
