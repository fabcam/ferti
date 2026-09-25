import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, borrarProductor, type Productor } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'

export default function Inicio() {
  const productores = useLiveQuery(() => db.productores.orderBy('nombre').toArray(), [])
  const chacras = useLiveQuery(() => db.chacras.toArray(), [])
  const [editando, setEditando] = useState<Partial<Productor> | null>(null)

  const cantidadChacras = (id: string) => chacras?.filter((c) => c.productorId === id).length ?? 0

  const guardar = async () => {
    if (!editando?.nombre?.trim()) return
    const datos = { ...editando, nombre: editando.nombre.trim() }
    if (datos.id) await db.productores.update(datos.id, datos)
    else await db.productores.add({ ...datos, id: uid(), creado: Date.now() } as Productor)
    setEditando(null)
  }

  const borrar = async () => {
    if (!editando?.id) return
    const n = cantidadChacras(editando.id)
    const aviso = n
      ? `¿Borrar a ${editando.nombre} y sus ${n} chacra(s) con todas sus aplicaciones?`
      : `¿Borrar a ${editando.nombre}?`
    if (!confirm(aviso)) return
    await borrarProductor(editando.id)
    setEditando(null)
  }

  return (
    <Pantalla titulo="Ferti" subtitulo="Productores">
      <nav className="accesos">
        <Link to="/productos" className="acceso">Productos</Link>
        <Link to="/equipos" className="acceso">Equipos</Link>
        <Link to="/importar" className="acceso">Importar</Link>
        <Link to="/ajustes" className="acceso">Ajustes</Link>
      </nav>

      {productores?.length === 0 && (
        <Vacio>
          Todavía no hay productores.
          <br />
          Creá el primero para empezar a cargar sus chacras.
        </Vacio>
      )}

      <ul className="lista">
        {productores?.map((p) => (
          <li key={p.id} className="item">
            <Link to={`/productor/${p.id}`} className="item-principal">
              <strong>{p.nombre}</strong>
              <span>{cantidadChacras(p.id)} chacra(s)</span>
            </Link>
            <button className="item-editar" onClick={() => setEditando(p)} aria-label="Editar">
              ✎
            </button>
          </li>
        ))}
      </ul>

      <button className="fab" onClick={() => setEditando({})}>+ Productor</button>

      <Hoja
        titulo={editando?.id ? 'Editar productor' : 'Nuevo productor'}
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
          Teléfono
          <input
            type="tel"
            value={editando?.telefono ?? ''}
            onChange={(e) => setEditando({ ...editando, telefono: e.target.value })}
          />
        </label>
        <label>
          Notas
          <textarea
            rows={3}
            value={editando?.notas ?? ''}
            onChange={(e) => setEditando({ ...editando, notas: e.target.value })}
          />
        </label>
      </Hoja>
    </Pantalla>
  )
}
