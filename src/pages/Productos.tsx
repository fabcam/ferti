import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, COLORES_PRODUCTO, type Producto } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'

export default function Productos() {
  const productos = useLiveQuery(() => db.productos.orderBy('nombre').toArray(), [])
  const [editando, setEditando] = useState<Partial<Producto> | null>(null)

  const nuevo = () => {
    // Sugerir el primer color que todavía no se usa.
    const usados = new Set(productos?.map((p) => p.color))
    const color = COLORES_PRODUCTO.find((c) => !usados.has(c)) ?? COLORES_PRODUCTO[0]
    setEditando({ color })
  }

  const guardar = async () => {
    if (!editando?.nombre?.trim() || !editando.color) return
    const datos = { ...editando, nombre: editando.nombre.trim() }
    if (datos.id) await db.productos.update(datos.id, datos)
    else await db.productos.add({ ...datos, id: uid(), creado: Date.now() } as Producto)
    setEditando(null)
  }

  const borrar = async () => {
    if (!editando?.id) return
    const usos = await db.aplicaciones.where('productoId').equals(editando.id).count()
    if (usos) {
      alert(`No se puede borrar: ${editando.nombre} se usó en ${usos} aplicación(es).`)
      return
    }
    if (!confirm(`¿Borrar ${editando.nombre}?`)) return
    await db.productos.delete(editando.id)
    setEditando(null)
  }

  return (
    <Pantalla titulo="Productos" subtitulo="Cada producto se pinta con su color" volver="/">
      {productos?.length === 0 && (
        <Vacio>Cargá los productos que se esparcen (urea, fosfato, cal…). Cada uno tiene su color en el mapa.</Vacio>
      )}
      <ul className="lista">
        {productos?.map((p) => (
          <li key={p.id} className="item">
            <button className="item-principal" onClick={() => setEditando(p)}>
              <strong>
                <span className="muestra" style={{ background: p.color }} /> {p.nombre}
              </strong>
              <span>{p.dosisKgHa ? `${p.dosisKgHa} kg/ha` : 'Sin dosis por defecto'}</span>
            </button>
          </li>
        ))}
      </ul>

      <button className="fab" onClick={nuevo}>+ Producto</button>

      <Hoja
        titulo={editando?.id ? 'Editar producto' : 'Nuevo producto'}
        abierta={!!editando}
        onCerrar={() => setEditando(null)}
        onGuardar={guardar}
        onBorrar={editando?.id ? borrar : undefined}
      >
        <label>
          Nombre
          <input
            autoFocus
            required
            value={editando?.nombre ?? ''}
            onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
          />
        </label>
        <fieldset className="colores">
          <legend>Color en el mapa</legend>
          {COLORES_PRODUCTO.map((c) => (
            <button
              type="button"
              key={c}
              className={'color' + (editando?.color === c ? ' elegido' : '')}
              style={{ background: c }}
              onClick={() => setEditando({ ...editando, color: c })}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            type="color"
            value={editando?.color ?? '#ffffff'}
            onChange={(e) => setEditando({ ...editando, color: e.target.value })}
            aria-label="Otro color"
          />
        </fieldset>
        <label>
          Dosis por defecto (kg/ha, opcional)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={editando?.dosisKgHa ?? ''}
            onChange={(e) =>
              setEditando({ ...editando, dosisKgHa: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </label>
      </Hoja>
    </Pantalla>
  )
}
