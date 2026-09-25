import type { EntityTable } from 'dexie'
import {
  db,
  type Aplicacion,
  type Chacra,
  type Equipo,
  type Producto,
  type Productor,
  type Punto,
} from '../db'
import { CORTE_MS } from './recorrido'

export const FORMATO = 'ferti'
export const VERSION = 1
export const EXTENSION = '.ferti.json'

/** Punto compacto: [lat, lng, t, precisión, esparciendo (0/1), velocidad?, rumbo?] */
type PuntoCompacto = [number, number, number, number, 0 | 1, number?, number?]

export interface Paquete {
  formato: typeof FORMATO
  version: number
  exportado: number
  descripcion: string
  productores: Productor[]
  chacras: Chacra[]
  productos: Producto[]
  equipos: Equipo[]
  aplicaciones: Aplicacion[]
  puntos: Record<string, PuntoCompacto[]>
}

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

function compactar(p: Punto): PuntoCompacto {
  const c: PuntoCompacto = [redondear(p.lat, 7), redondear(p.lng, 7), p.t, redondear(p.acc, 1), p.esparciendo ? 1 : 0]
  if (p.vel != null || p.rumbo != null) c.push(p.vel != null ? redondear(p.vel, 2) : undefined)
  if (p.rumbo != null) c.push(redondear(p.rumbo, 1))
  return c
}

function expandir(aplicacionId: string, c: PuntoCompacto): Punto {
  const p: Punto = { aplicacionId, lat: c[0], lng: c[1], t: c[2], acc: c[3], esparciendo: c[4] === 1 }
  if (c[5] != null) p.vel = c[5]
  if (c[6] != null) p.rumbo = c[6]
  return p
}

async function armarPaquete(aplicaciones: Aplicacion[], chacras: Chacra[], descripcion: string): Promise<Paquete> {
  const productorIds = new Set(chacras.map((c) => c.productorId))
  const productoIds = new Set(aplicaciones.map((a) => a.productoId))
  const equipoIds = new Set(aplicaciones.map((a) => a.equipoId).filter(Boolean) as string[])
  const puntos: Paquete['puntos'] = {}
  for (const a of aplicaciones) {
    const pts = await db.puntos.where('aplicacionId').equals(a.id).sortBy('t')
    puntos[a.id] = pts.map(compactar)
  }
  return {
    formato: FORMATO,
    version: VERSION,
    exportado: Date.now(),
    descripcion,
    productores: (await db.productores.bulkGet([...productorIds])).filter(Boolean) as Productor[],
    chacras,
    productos: (await db.productos.bulkGet([...productoIds])).filter(Boolean) as Producto[],
    equipos: (await db.equipos.bulkGet([...equipoIds])).filter(Boolean) as Equipo[],
    aplicaciones,
    puntos,
  }
}

export async function paqueteAplicacion(id: string) {
  const a = await db.aplicaciones.get(id)
  if (!a) throw new Error('Aplicación no encontrada')
  const chacra = await db.chacras.get(a.chacraId)
  if (!chacra) throw new Error('Chacra no encontrada')
  const producto = await db.productos.get(a.productoId)
  return armarPaquete([a], [chacra], `${chacra.nombre} · ${producto?.nombre ?? 'aplicación'} · ${fechaCorta(a.inicio)}`)
}

export async function paqueteChacra(id: string) {
  const chacra = await db.chacras.get(id)
  if (!chacra) throw new Error('Chacra no encontrada')
  const apps = await db.aplicaciones.where('chacraId').equals(id).sortBy('inicio')
  return armarPaquete(apps, [chacra], `Chacra ${chacra.nombre}`)
}

export async function paqueteCompleto(): Promise<Paquete> {
  const p = await armarPaquete(await db.aplicaciones.toArray(), await db.chacras.toArray(), 'Backup completo')
  // En el backup van también los que no se usan en ninguna aplicación.
  p.productores = await db.productores.toArray()
  p.productos = await db.productos.toArray()
  p.equipos = await db.equipos.toArray()
  return p
}

const fechaCorta = (t: number) => new Date(t).toISOString().slice(0, 10)

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export function nombreArchivo(p: Paquete, extension = EXTENSION) {
  return `ferti-${slug(p.descripcion) || 'datos'}-${fechaCorta(p.exportado)}${extension}`
}

/** Comparte con el menú del sistema (iPhone: WhatsApp, Mail, AirDrop, Archivos…) o descarga. */
export async function compartirArchivo(contenido: string, nombre: string, tipo: string) {
  const archivo = new File([contenido], nombre, { type: tipo })
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // el usuario cerró el menú
    }
  }
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function compartirPaquete(p: Paquete) {
  await compartirArchivo(JSON.stringify(p), nombreArchivo(p), 'application/json')
}

// ---------- Importar ----------

export class ErrorImportacion extends Error {}

function esArreglo(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

/** Lee y valida un archivo. No toca la base. */
export async function leerPaquete(archivo: File): Promise<Paquete> {
  let datos: unknown
  try {
    datos = JSON.parse(await archivo.text())
  } catch {
    throw new ErrorImportacion('El archivo no es un JSON válido.')
  }
  const p = datos as Partial<Paquete>
  if (!p || p.formato !== FORMATO) throw new ErrorImportacion('El archivo no es de Ferti.')
  if (typeof p.version !== 'number' || p.version > VERSION)
    throw new ErrorImportacion('El archivo es de una versión más nueva de Ferti. Actualizá la app.')
  for (const clave of ['productores', 'chacras', 'productos', 'equipos', 'aplicaciones'] as const)
    if (!esArreglo(p[clave])) throw new ErrorImportacion(`Falta la lista de ${clave}.`)
  if (!p.puntos || typeof p.puntos !== 'object') throw new ErrorImportacion('Faltan los recorridos.')

  const tieneId = (x: unknown) => !!x && typeof (x as { id?: unknown }).id === 'string'
  for (const clave of ['productores', 'chacras', 'productos', 'equipos', 'aplicaciones'] as const)
    if (!p[clave]!.every(tieneId)) throw new ErrorImportacion(`Hay ${clave} sin identificador.`)
  for (const c of p.chacras!)
    if (!esArreglo(c.poligono) || !c.poligono.every((v) => esArreglo(v) && v.length === 2 && v.every(Number.isFinite)))
      throw new ErrorImportacion(`El límite de la chacra ${c.nombre} está dañado.`)
  for (const [id, pts] of Object.entries(p.puntos))
    if (!esArreglo(pts) || !pts.every((v) => esArreglo(v) && v.length >= 5 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2])))
      throw new ErrorImportacion(`El recorrido ${id} está dañado.`)
  return p as Paquete
}

export interface Conteo {
  nuevos: number
  existentes: number
}

export interface Analisis {
  productores: Conteo
  chacras: Conteo
  productos: Conteo
  equipos: Conteo
  aplicaciones: Conteo
  puntos: number
  /** Referencias que no están ni en el archivo ni en este celular. */
  faltantes: string[]
}

/** Qué pasaría al importar: cuántos registros son nuevos y cuántos ya existen. */
export async function analizar(p: Paquete): Promise<Analisis> {
  const contar = async (tabla: { bulkGet(ids: string[]): Promise<unknown[]> }, items: { id: string }[]) => {
    const existentes = (await tabla.bulkGet(items.map((i) => i.id))).filter(Boolean).length
    return { nuevos: items.length - existentes, existentes }
  }
  const aplicaciones = await contar(db.aplicaciones, p.aplicaciones)
  const yaEstan = new Set(
    (await db.aplicaciones.bulkGet(p.aplicaciones.map((a) => a.id))).filter(Boolean).map((a) => a!.id),
  )
  const nuevasApps = p.aplicaciones.map((a) => a.id).filter((id) => !yaEstan.has(id))

  const faltantes: string[] = []
  const hay = async (tabla: { get(id: string): Promise<unknown> }, lista: { id: string }[], id: string) =>
    lista.some((x) => x.id === id) || !!(await tabla.get(id))
  for (const c of p.chacras)
    if (!(await hay(db.productores, p.productores, c.productorId))) faltantes.push(`productor de la chacra ${c.nombre}`)
  for (const a of p.aplicaciones) {
    if (!(await hay(db.chacras, p.chacras, a.chacraId))) faltantes.push(`chacra de una aplicación`)
    if (!(await hay(db.productos, p.productos, a.productoId))) faltantes.push(`producto de una aplicación`)
  }

  return {
    productores: await contar(db.productores, p.productores),
    chacras: await contar(db.chacras, p.chacras),
    productos: await contar(db.productos, p.productos),
    equipos: await contar(db.equipos, p.equipos),
    aplicaciones,
    puntos: nuevasApps.reduce((n, id) => n + (p.puntos[id]?.length ?? 0), 0),
    faltantes,
  }
}

/**
 * Agrega lo que no existe. Lo que ya está en el celular (mismo identificador) no se modifica,
 * así importar dos veces el mismo archivo no duplica nada.
 */
export async function importar(p: Paquete) {
  await db.transaction('rw', [db.productores, db.chacras, db.productos, db.equipos, db.aplicaciones, db.puntos], async () => {
    const agregarNuevos = async <T extends { id: string }>(tabla: EntityTable<T, 'id'>, items: T[]) => {
      // Los ids son siempre string; Dexie los tipa de forma genérica y hay que ayudarlo.
      const ids = items.map((i) => i.id) as Parameters<typeof tabla.bulkGet>[0]
      const existentes = new Set((await tabla.bulkGet(ids)).filter(Boolean).map((i) => i!.id))
      const nuevos = items.filter((i) => !existentes.has(i.id))
      if (nuevos.length) await tabla.bulkAdd(nuevos)
      return nuevos
    }
    await agregarNuevos(db.productores, p.productores)
    await agregarNuevos(db.chacras, p.chacras)
    await agregarNuevos(db.productos, p.productos)
    await agregarNuevos(db.equipos, p.equipos)
    // Una aplicación importada siempre queda finalizada: se grabó en otro dispositivo.
    const apps = await agregarNuevos(
      db.aplicaciones,
      p.aplicaciones.map((a) => ({ ...a, estado: 'finalizada' as const, fin: a.fin ?? a.inicio })),
    )
    for (const a of apps) {
      const pts = (p.puntos[a.id] ?? []).map((c) => expandir(a.id, c))
      if (pts.length) await db.puntos.bulkAdd(pts)
    }
  })
}

// ---------- KML (Google Earth) ----------

const escapar = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)

/** Color KML: aabbggrr. */
function colorKml(hex: string, alfa = 'b0') {
  const h = hex.replace('#', '')
  return `${alfa}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`
}

export function kml(p: Paquete) {
  const productos = new Map(p.productos.map((x) => [x.id, x.nombre]))
  const partes: string[] = []
  for (const c of p.chacras) {
    if (c.poligono.length < 3) continue
    const anillo = [...c.poligono, c.poligono[0]].map(([lat, lng]) => `${lng},${lat},0`).join(' ')
    partes.push(`<Placemark><name>${escapar(c.nombre)}</name><Style><LineStyle><color>ffffffff</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style><Polygon><outerBoundaryIs><LinearRing><coordinates>${anillo}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`)
  }
  for (const a of p.aplicaciones) {
    const pts = p.puntos[a.id] ?? []
    const tramos: string[][] = []
    let actual: string[] | null = null
    for (let i = 0; i < pts.length; i++) {
      const [lat, lng, t, , esp] = pts[i]
      const corte = i === 0 || t - pts[i - 1][2] > CORTE_MS || !pts[i - 1][4]
      if (!esp) {
        actual = null
        continue
      }
      if (!actual || corte) {
        actual = i > 0 && !corte ? [`${pts[i - 1][1]},${pts[i - 1][0]},0`] : []
        tramos.push(actual)
      }
      actual.push(`${lng},${lat},0`)
    }
    const lineas = tramos
      .filter((t) => t.length > 1)
      .map((t) => `<LineString><tessellate>1</tessellate><coordinates>${t.join(' ')}</coordinates></LineString>`)
      .join('')
    if (!lineas) continue
    const nombre = `${productos.get(a.productoId) ?? 'Aplicación'} ${new Date(a.inicio).toLocaleDateString('es-UY')}`
    partes.push(`<Placemark><name>${escapar(nombre)}</name><description>Ancho ${a.anchoM} m</description><Style><LineStyle><color>${colorKml(a.color)}</color><width>4</width></LineStyle></Style><MultiGeometry>${lineas}</MultiGeometry></Placemark>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapar(p.descripcion)}</name>${partes.join('')}</Document></kml>`
}

export async function compartirKml(p: Paquete) {
  await compartirArchivo(kml(p), nombreArchivo(p, '.kml'), 'application/vnd.google-earth.kml+xml')
}
