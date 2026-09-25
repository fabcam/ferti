import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Equipo } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'

export default function Equipos() {
  const equipos = useLiveQuery(() => db.equipos.orderBy('nombre').toArray(), [])
  const [editando, setEditando] = useState<Partial<Equipo> | null>(null)

  const guardar = async () => {
    if (!editando?.nombre?.trim() || !editando.anchoM || editando.anchoM <= 0) return
    const datos = { ...editando, nombre: editando.nombre.trim() }
    if (datos.id) await db.equipos.update(datos.id, datos)
    else await db.equipos.add({ ...datos, id: uid(), creado: Date.now() } as Equipo)
    setEditando(null)
  }

  const borrar = async () => {
    if (!editando?.id || !confirm(`¿Borrar ${editando.nombre}?`)) return
    // Las aplicaciones guardan su propio ancho, así que borrar el equipo no las afecta.
    await db.equipos.delete(editando.id)
    setEditando(null)
  }

  return (
    <Pantalla titulo="Equipos" subtitulo="Ancho de trabajo del esparcidor" volver="/">
      {equipos?.length === 0 && <Vacio>No hay equipos cargados.</Vacio>}
      <ul className="lista">
        {equipos?.map((e) => (
          <li key={e.id} className="item">
            <button className="item-principal" onClick={() => setEditando(e)}>
              <strong>{e.nombre}</strong>
              <span>{e.anchoM.toLocaleString('es-UY')} m de ancho</span>
            </button>
          </li>
        ))}
      </ul>

      <button className="fab" onClick={() => setEditando({ anchoM: 5.5 })}>+ Equipo</button>

      <Hoja
        titulo={editando?.id ? 'Editar equipo' : 'Nuevo equipo'}
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
        <label>
          Ancho de trabajo (metros)
          <input
            type="number"
            inputMode="decimal"
            required
            min={0.5}
            max={60}
            step={0.1}
            value={editando?.anchoM ?? ''}
            onChange={(e) => setEditando({ ...editando, anchoM: Number(e.target.value) })}
          />
        </label>
        <p className="ayuda">Es el ancho total de la franja que cubre el disco en cada pasada.</p>
      </Hoja>
    </Pantalla>
  )
}
