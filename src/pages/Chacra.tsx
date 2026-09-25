import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import L from 'leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, borrarChacra, uid, type Aplicacion, type Chacra } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'
import Mapa from '../components/Mapa'
import Compartir from '../components/Compartir'
import { formatearFecha, formatearHa } from '../lib/dispositivo'
import { CapaAplicacion } from '../lib/aplicacion'
import { formatearPorcentaje } from '../lib/cobertura'
import { paqueteChacra } from '../lib/intercambio'

interface NuevaAplicacion {
  productoId?: string
  equipoId?: string
  anchoM?: number
  dosisKgHa?: number
}

export default function ChacraPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const chacra = useLiveQuery(() => db.chacras.get(id), [id])
  const aplicaciones = useLiveQuery(
    () => db.aplicaciones.where('chacraId').equals(id).reverse().sortBy('inicio'),
    [id],
  )
  const productos = useLiveQuery(() => db.productos.orderBy('nombre').toArray(), [])
  const equipos = useLiveQuery(() => db.equipos.orderBy('nombre').toArray(), [])
  const [editando, setEditando] = useState<Partial<Chacra> | null>(null)
  const [nueva, setNueva] = useState<NuevaAplicacion | null>(null)

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

  const abrirNueva = async () => {
    // Proponer el último equipo usado y un producto distinto al de la última aplicación.
    const ultima = aplicaciones?.[0]
    const equipo = equipos?.find((e) => e.id === ultima?.equipoId) ?? equipos?.[0]
    const producto = productos?.find((p) => p.id !== ultima?.productoId) ?? productos?.[0]
    setNueva({
      productoId: producto?.id,
      equipoId: equipo?.id,
      anchoM: ultima?.anchoM ?? equipo?.anchoM,
      dosisKgHa: producto?.dosisKgHa,
    })
  }

  const empezar = async () => {
    const producto = productos?.find((p) => p.id === nueva?.productoId)
    if (!nueva || !producto || !nueva.anchoM || nueva.anchoM <= 0) return
    const app: Aplicacion = {
      id: uid(),
      chacraId: id,
      productoId: producto.id,
      equipoId: nueva.equipoId,
      anchoM: nueva.anchoM,
      color: producto.color,
      dosisKgHa: nueva.dosisKgHa,
      inicio: Date.now(),
      estado: 'en_curso',
    }
    await db.aplicaciones.add(app)
    navigate(`/aplicacion/${app.id}`)
  }

  return (
    <Pantalla
      titulo={chacra.nombre}
      subtitulo={chacra.poligono.length >= 3 ? formatearHa(chacra.areaHa) : 'Sin límite marcado'}
      volver={volver}
      acciones={
        <>
          <Compartir titulo={`Compartir ${chacra.nombre}`} obtener={() => paqueteChacra(id)} className="btn btn-chico" />
          <button className="btn btn-chico" onClick={() => setEditando(chacra)}>
            Editar
          </button>
        </>
      }
    >
      {chacra.poligono.length >= 3 ? (
        <section className="vista-chacra">
          <Mapa
            key={chacra.poligono.join(';')}
            className="mapa-vista"
            opciones={{ dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }}
            onListo={(map) => {
              const forma = L.polygon(chacra.poligono, { color: '#ffffff', weight: 2, fill: false }).addTo(map)
              map.fitBounds(forma.getBounds(), { padding: [16, 16] })
              let cancelado = false
              ;(async () => {
                const apps = await db.aplicaciones.where('chacraId').equals(id).sortBy('inicio')
                for (const a of apps) {
                  const puntos = await db.puntos.where('aplicacionId').equals(a.id).sortBy('t')
                  if (cancelado) return
                  new CapaAplicacion({ color: a.color, anchoM: a.anchoM, mostrarRecorrido: false }).addTo(map).cargar(puntos)
                }
              })()
              return () => {
                cancelado = true
              }
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
            <Link to={`/aplicacion/${a.id}`} className="item-principal">
              <strong>
                <span className="muestra" style={{ background: a.color }} /> {nombreProducto(a.productoId)}
                {a.estado === 'en_curso' && <span className="etiqueta">en curso</span>}
              </strong>
              <span>
                {formatearFecha(a.inicio)} · {a.anchoM.toLocaleString('es-UY')} m{a.dosisKgHa ? ` · ${a.dosisKgHa} kg/ha` : ''}
              </span>
              {a.cobertura && (
                <span>
                  <b>{formatearPorcentaje(a.cobertura.porcentaje)} cubierto</b> · {formatearHa(a.cobertura.cubiertaHa)}
                  {a.cobertura.solapeHa >= 0.01 && ` · ${formatearHa(a.cobertura.solapeHa)} de solape`}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <button className="fab" onClick={abrirNueva}>+ Aplicación</button>

      <Hoja
        titulo="Nueva aplicación"
        abierta={!!nueva}
        onCerrar={() => setNueva(null)}
        onGuardar={empezar}
        textoGuardar="Empezar"
      >
        {productos?.length === 0 ? (
          <p className="ayuda">
            Primero cargá al menos un producto en <Link to="/productos">Productos</Link>.
          </p>
        ) : (
          <fieldset className="opciones">
            <legend>Producto</legend>
            {productos?.map((p) => (
              <button
                type="button"
                key={p.id}
                className={'opcion' + (nueva?.productoId === p.id ? ' elegida' : '')}
                onClick={() => setNueva({ ...nueva, productoId: p.id, dosisKgHa: p.dosisKgHa ?? nueva?.dosisKgHa })}
              >
                <span className="muestra" style={{ background: p.color }} /> {p.nombre}
              </button>
            ))}
          </fieldset>
        )}
        {!!equipos?.length && (
          <label>
            Equipo
            <select
              value={nueva?.equipoId ?? ''}
              onChange={(e) => {
                const eq = equipos.find((x) => x.id === e.target.value)
                setNueva({ ...nueva, equipoId: eq?.id, anchoM: eq?.anchoM ?? nueva?.anchoM })
              }}
            >
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} ({e.anchoM.toLocaleString('es-UY')} m)
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Ancho de trabajo (m)
          <input
            type="number"
            inputMode="decimal"
            required
            min={0.5}
            max={60}
            step={0.1}
            value={nueva?.anchoM ?? ''}
            onChange={(e) => setNueva({ ...nueva, anchoM: Number(e.target.value) })}
          />
        </label>
        <label>
          Dosis (kg/ha, opcional)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={nueva?.dosisKgHa ?? ''}
            onChange={(e) => setNueva({ ...nueva, dosisKgHa: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        {chacra.poligono.length < 3 && (
          <p className="ayuda">La chacra no tiene límite marcado: se puede aplicar igual, pero sin % de cobertura.</p>
        )}
      </Hoja>

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
