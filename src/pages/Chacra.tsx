import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, borrarChacra, type Chacra } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'
import { formatearFecha, formatearHa } from '../lib/dispositivo'

export default function ChacraPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const chacra = useLiveQuery(() => db.chacras.get(id), [id])
  const aplicaciones = useLiveQuery(
    () => db.aplicaciones.where('chacraId').equals(id).reverse().sortBy('inicio'),
    [id],
  )
  const productos = useLiveQuery(() => db.productos.toArray(), [])
  const [editando, setEditando] = useState<Partial<Chacra> | null>(null)

  if (chacra === undefined) return null
  const volver = `/productor/${chacra.productorId}`

  const guardar = async () => {
    if (!editando?.nombre?.trim()) return
    await db.chacras.update(id, { nombre: editando.nombre.trim(), notas: editando.notas })
    setEditando(null)
  }

  const borrar = async () => {
    const n = aplicaciones?.length ?? 0
    if (!confirm(`¿Borrar la chacra ${chacra.nombre}${n ? ` y sus ${n} aplicación(es)` : ''}?`)) return
    await borrarChacra(id)
    navigate(volver, { replace: true })
  }

  const nombreProducto = (pid: string) => productos?.find((p) => p.id === pid)?.nombre ?? '—'

  return (
    <Pantalla
      titulo={chacra.nombre}
      subtitulo={chacra.poligono.length >= 3 ? formatearHa(chacra.areaHa) : 'Sin límite marcado'}
      volver={volver}
      acciones={
        <button className="btn btn-chico" onClick={() => setEditando(chacra)}>
          Editar
        </button>
      }
    >
      <section className="tarjeta mapa-pendiente">
        <p>El mapa y el marcado del límite llegan en la etapa 2.</p>
      </section>

      <h2 className="seccion">Aplicaciones</h2>
      {aplicaciones?.length === 0 && <Vacio>Todavía no hay aplicaciones en esta chacra.</Vacio>}
      <ul className="lista">
        {aplicaciones?.map((a) => (
          <li key={a.id} className="item">
            <div className="item-principal">
              <strong>
                <span className="muestra" style={{ background: a.color }} /> {nombreProducto(a.productoId)}
              </strong>
              <span>
                {formatearFecha(a.inicio)} · {a.anchoM} m{a.estado === 'en_curso' ? ' · en curso' : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <Hoja
        titulo="Editar chacra"
        abierta={!!editando}
        onCerrar={() => setEditando(null)}
        onGuardar={guardar}
        onBorrar={borrar}
      >
        <label>
          Nombre
          <input
            required
            value={editando?.nombre ?? ''}
            onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
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
