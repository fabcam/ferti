import L from 'leaflet'
import { db, type Chacra, type LatLng, type TilePack } from '../db'
import { URL_SATELITAL, ZOOM_NATIVO_MAX } from './fuenteSatelital'

export const ZOOM_MIN_OFFLINE = 13
export const ZOOM_MAX_OFFLINE = ZOOM_NATIVO_MAX
/** Alrededor del límite, para ver el entorno y los accesos. */
export const MARGEN_OFFLINE_M = 150
const BYTES_ESTIMADOS_POR_TESELA = 10_000
const DESCARGAS_SIMULTANEAS = 4
export const MAX_TESELAS = 4_000

/**
 * Donde Esri no tiene imágenes a cierto zoom devuelve siempre la misma imagen gris
 * ("Map data not yet available"). Se reconoce por su huella para no guardarla ni mostrarla.
 */
const RELLENOS = new Set(['9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858'])
const TAMANOS_RELLENO = new Set([2521])

async function huella(blob: Blob) {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function esRelleno(blob: Blob) {
  // Solo se calcula la huella si el tamaño coincide: el resto de las teselas no paga el costo.
  return TAMANOS_RELLENO.has(blob.size) && RELLENOS.has(await huella(blob))
}

export interface Tesela {
  z: number
  x: number
  y: number
}

export const claveTesela = ({ z, x, y }: Tesela) => `${z}/${x}/${y}`

export const urlTesela = ({ z, x, y }: Tesela) =>
  URL_SATELITAL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))

const lngAX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z)
const latAY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Rectángulo [suroeste, noreste] que contiene el polígono más un margen en metros. */
export function limitesConMargen(poligono: LatLng[], margenM = MARGEN_OFFLINE_M): [LatLng, LatLng] {
  const lats = poligono.map((p) => p[0])
  const lngs = poligono.map((p) => p[1])
  const dLat = margenM / 111_320
  const dLng = margenM / (111_320 * Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180)))
  return [
    [Math.min(...lats) - dLat, Math.min(...lngs) - dLng],
    [Math.max(...lats) + dLat, Math.max(...lngs) + dLng],
  ]
}

export function teselasEn([so, ne]: [LatLng, LatLng], zMin = ZOOM_MIN_OFFLINE, zMax = ZOOM_MAX_OFFLINE): Tesela[] {
  const r: Tesela[] = []
  for (let z = zMin; z <= zMax; z++) {
    const x0 = lngAX(so[1], z)
    const x1 = lngAX(ne[1], z)
    const y0 = latAY(ne[0], z) // en teselas la y crece hacia el sur
    const y1 = latAY(so[0], z)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) r.push({ z, x, y })
  }
  return r
}

export function estimarDescarga(poligono: LatLng[]) {
  const cantidad = teselasEn(limitesConMargen(poligono)).length
  return { cantidad, bytes: cantidad * BYTES_ESTIMADOS_POR_TESELA }
}

export interface ProgresoDescarga {
  hechas: number
  total: number
  bytes: number
  fallidas: number
  /** Teselas donde no hay imagen a ese zoom (se usa la del zoom anterior). */
  sinImagen: number
}

async function bajarTesela(t: Tesela, signal?: AbortSignal): Promise<Blob> {
  let ultimoError: unknown
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(urlTesela(t), { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error('Respuesta que no es imagen')
      return blob
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      ultimoError = e
      await new Promise((r) => setTimeout(r, 500 * (intento + 1)))
    }
  }
  throw ultimoError
}

/** Descarga las teselas de la chacra que todavía no están guardadas. */
export async function descargarChacra(
  chacra: Chacra,
  { onProgreso, signal }: { onProgreso?: (p: ProgresoDescarga) => void; signal?: AbortSignal } = {},
): Promise<TilePack> {
  if (chacra.poligono.length < 3) throw new Error('La chacra no tiene límite marcado.')
  const limites = limitesConMargen(chacra.poligono)
  const todas = teselasEn(limites)
  if (todas.length > MAX_TESELAS) throw new Error(`Son demasiadas teselas (${todas.length}). La chacra es muy grande.`)

  const guardadas = new Set(
    (await db.tiles.where('key').anyOf(todas.map(claveTesela)).primaryKeys()) as string[],
  )
  const pendientes = todas.filter((t) => !guardadas.has(claveTesela(t)))
  const prog: ProgresoDescarga = {
    hechas: todas.length - pendientes.length,
    total: todas.length,
    bytes: 0,
    fallidas: 0,
    sinImagen: 0,
  }
  onProgreso?.({ ...prog })

  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < pendientes.length) {
      if (signal?.aborted) return
      const t = pendientes[siguiente++]
      try {
        const blob = await bajarTesela(t, signal)
        if (await esRelleno(blob)) {
          prog.sinImagen++
        } else {
          await db.tiles.put({ key: claveTesela(t), blob })
          prog.bytes += blob.size
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        prog.fallidas++
      }
      prog.hechas++
      onProgreso?.({ ...prog })
    }
  }
  await Promise.all(Array.from({ length: DESCARGAS_SIMULTANEAS }, trabajador))
  if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')

  // Tamaño real de lo guardado para esta chacra (incluye lo que ya estaba).
  let bytes = 0
  await db.tiles
    .where('key')
    .anyOf(todas.map(claveTesela))
    .each((t) => {
      bytes += t.blob.size
    })
  const pack: TilePack = {
    chacraId: chacra.id,
    zMin: ZOOM_MIN_OFFLINE,
    zMax: ZOOM_MAX_OFFLINE,
    cantidad: todas.length - prog.fallidas - prog.sinImagen,
    bytes,
    creado: Date.now(),
    limites,
    fallidas: prog.fallidas,
  }
  await db.tilePacks.put(pack)
  return pack
}

const clavesDe = (p: TilePack) => teselasEn(p.limites, p.zMin, p.zMax).map(claveTesela)

/** Borra el mapa de una chacra, sin tocar teselas que usa otra chacra descargada. */
export async function borrarMapaChacra(chacraId: string) {
  const pack = await db.tilePacks.get(chacraId)
  if (!pack) return
  const otras = new Set((await db.tilePacks.toArray()).filter((p) => p.chacraId !== chacraId).flatMap(clavesDe))
  const borrar = clavesDe(pack).filter((k) => !otras.has(k))
  await db.transaction('rw', db.tiles, db.tilePacks, async () => {
    await db.tiles.bulkDelete(borrar)
    await db.tilePacks.delete(chacraId)
  })
}

export async function borrarTodosLosMapas() {
  await db.transaction('rw', db.tiles, db.tilePacks, async () => {
    await db.tiles.clear()
    await db.tilePacks.clear()
  })
}

/** Cuántos zooms hacia atrás se busca una imagen para agrandar. */
const MAX_AGRANDADO = 4

async function obtenerTesela(t: Tesela, url: string): Promise<Blob | null> {
  try {
    const guardada = await db.tiles.get(claveTesela(t))
    if (guardada) return guardada.blob
  } catch {
    // Si falla la base, se intenta igual por internet.
  }
  if (!navigator.onLine) return null
  try {
    const res = await fetch(url)
    return res.ok ? await res.blob() : null
  } catch {
    return null
  }
}

/**
 * Capa satelital que:
 * - usa primero la tesela guardada en el celular y, si no está, la pide a internet;
 * - si a ese zoom no hay imagen (relleno de Esri) o no hay conexión, agranda la del zoom anterior.
 */
export const CapaSatelital = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const tam = this.getTileSize()
    const lienzo = document.createElement('canvas')
    lienzo.width = tam.x
    lienzo.height = tam.y
    lienzo.setAttribute('role', 'presentation')

    const url = (t: Tesela) => urlTesela(t)
    ;(async () => {
      for (let d = 0; d <= MAX_AGRANDADO && coords.z - d >= 0; d++) {
        const f = 2 ** d
        const padre = { z: coords.z - d, x: Math.floor(coords.x / f), y: Math.floor(coords.y / f) }
        const blob = await obtenerTesela(padre, url(padre))
        if (!blob || (await esRelleno(blob))) continue
        try {
          const bmp = await createImageBitmap(blob)
          const ctx = lienzo.getContext('2d')!
          const lado = bmp.width / f
          ctx.drawImage(bmp, (coords.x % f) * lado, (coords.y % f) * lado, lado, lado, 0, 0, tam.x, tam.y)
          bmp.close()
          done(undefined, lienzo)
          return
        } catch {
          // Imagen dañada: probar con el zoom anterior.
        }
      }
      done(new Error('Sin imagen para esta zona'), lienzo)
    })()
    return lienzo
  },
}) as unknown as new (url: string, opciones?: L.TileLayerOptions) => L.TileLayer
