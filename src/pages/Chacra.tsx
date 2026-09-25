import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import L from 'leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, borrarChacra, type Chacra } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'
import Mapa from '../components/Mapa'
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
      {chacra.poligono.length >= 3 ? (
        <section className="vista-chacra">
          <Mapa
            key={chacra.poligono.join(';')}
            className="mapa-vista"
            opciones={{ dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }}
            onListo={(map) => {
              const forma = L.polygon(chacra.poligono, { color: '#ffd21f', weight: 3, fillOpacity: 0.1 }).addTo(map)
              map.fitBounds(forma.getBounds(), { padding: [16, 16] })
            }}
          />
          <Link to={`/chacra/${id}/limite`} className="btn btn-chico vista-editar">
            Editar límite
          </Link>
        </section>
      ) : (
        <section className="tarjeta sin-limite">
          <p>Esta chacra todavía no tiene el límite marcado.</p>
          <Link to={`/chacra/${id}/limite`} className="btn btn-primario">
            Marcar límite
          </Link>
        </section>
      )}

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
