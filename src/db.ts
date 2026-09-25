import Dexie, { type EntityTable } from 'dexie'

export type LatLng = [number, number]

export interface Productor {
  id: string
  nombre: string
  telefono?: string
  notas?: string
  creado: number
}

export interface Chacra {
  id: string
  productorId: string
  nombre: string
  poligono: LatLng[]
  areaHa: number
  notas?: string
  creado: number
}

export interface Producto {
  id: string
  nombre: string
  color: string
  dosisKgHa?: number
  creado: number
}

export interface Equipo {
  id: string
  nombre: string
  anchoM: number
  creado: number
}

export type EstadoAplicacion = 'en_curso' | 'finalizada'

export interface Aplicacion {
  id: string
  chacraId: string
  productoId: string
  equipoId?: string
  // Copiados al crear la aplicación: si luego cambia el equipo o el producto,
  // la aplicación conserva los valores reales de ese día.
  anchoM: number
  color: string
  dosisKgHa?: number
  inicio: number
  fin?: number
  estado: EstadoAplicacion
}

export interface Punto {
  id?: number
  aplicacionId: string
  lat: number
  lng: number
  t: number
  acc: number
  vel?: number
  rumbo?: number
  esparciendo: boolean
}

export interface Tile {
  key: string // `${z}/${x}/${y}`
  blob: Blob
}

export interface TilePack {
  chacraId: string
  zMin: number
  zMax: number
  cantidad: number
  bytes: number
  creado: number
}

export const db = new Dexie('ferti') as Dexie & {
  productores: EntityTable<Productor, 'id'>
  chacras: EntityTable<Chacra, 'id'>
  productos: EntityTable<Producto, 'id'>
  equipos: EntityTable<Equipo, 'id'>
  aplicaciones: EntityTable<Aplicacion, 'id'>
  puntos: EntityTable<Punto, 'id'>
  tiles: EntityTable<Tile, 'key'>
  tilePacks: EntityTable<TilePack, 'chacraId'>
}

db.version(1).stores({
  productores: 'id, nombre',
  chacras: 'id, productorId, nombre',
  productos: 'id, nombre',
  equipos: 'id, nombre',
  aplicaciones: 'id, chacraId, productoId, inicio, estado',
  puntos: '++id, aplicacionId, [aplicacionId+t]',
  tiles: 'key',
  tilePacks: 'chacraId',
})

export const uid = () => crypto.randomUUID()

// Colores bien distinguibles sobre imagen satelital.
export const COLORES_PRODUCTO = ['#ffd21f', '#1fd6ff', '#ff4fd8', '#ff7a1a', '#7dff4f', '#ffffff']

export async function sembrarDatosIniciales() {
  if ((await db.equipos.count()) === 0) {
    await db.equipos.add({ id: uid(), nombre: 'Tolva camioneta', anchoM: 5.5, creado: Date.now() })
  }
}

export async function borrarAplicacion(id: string) {
  await db.transaction('rw', db.aplicaciones, db.puntos, async () => {
    await db.puntos.where('aplicacionId').equals(id).delete()
    await db.aplicaciones.delete(id)
  })
}

export async function borrarChacra(id: string) {
  const apps = await db.aplicaciones.where('chacraId').equals(id).primaryKeys()
  for (const a of apps) await borrarAplicacion(a)
  await db.transaction('rw', db.chacras, db.tilePacks, async () => {
    await db.tilePacks.delete(id)
    await db.chacras.delete(id)
  })
}

export async function borrarProductor(id: string) {
  const chacras = await db.chacras.where('productorId').equals(id).primaryKeys()
  for (const c of chacras) await borrarChacra(c)
  await db.productores.delete(id)
}
