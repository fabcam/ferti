import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Chacra } from '../db'
import {
  borrarMapaChacra,
  descargarChacra,
  estimarDescarga,
  limitesConMargen,
  MAX_TESELAS,
  type ProgresoDescarga,
} from '../lib/teselas'
import { formatearBytes, formatearFecha } from '../lib/dispositivo'

/** Estado y acciones del mapa satelital guardado para usar sin conexión. */
export default function MapaOffline({ chacra }: { chacra: Chacra }) {
  const pack = useLiveQuery(() => db.tilePacks.get(chacra.id), [chacra.id])
  const [progreso, setProgreso] = useState<ProgresoDescarga | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  if (chacra.poligono.length < 3) return null
  const estimado = estimarDescarga(chacra.poligono)

  // Si el límite se agrandó después de descargar, el mapa guardado no lo cubre entero.
  const [so, ne] = limitesConMargen(chacra.poligono, 0)
  const desactualizado =
    !!pack && (so[0] < pack.limites[0][0] || so[1] < pack.limites[0][1] || ne[0] > pack.limites[1][0] || ne[1] > pack.limites[1][1])

  const descargar = async () => {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    try {
      const r = await descargarChacra(chacra, { onProgreso: setProgreso, signal: ctrl.signal })
      if (r.fallidas) setError(`No se pudieron bajar ${r.fallidas} teselas. Probá "Actualizar" con mejor señal.`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setProgreso(null)
      abortRef.current = null
    }
  }

  const borrar = async () => {
    if (!confirm('¿Borrar el mapa guardado de esta chacra?')) return
    await borrarMapaChacra(chacra.id)
  }

  return (
    <section className="tarjeta offline">
      <div className="offline-texto">
        <strong>Mapa sin conexión</strong>
        {progreso ? (
          <span>
            Descargando… {progreso.hechas} de {progreso.total} · {formatearBytes(progreso.bytes)}
          </span>
        ) : pack ? (
          <span>
            {desactualizado ? '⚠ El límite cambió: actualizá el mapa' : `✓ Guardado el ${formatearFecha(pack.creado)}`} ·{' '}
            {formatearBytes(pack.bytes)}
          </span>
        ) : estimado.cantidad > MAX_TESELAS ? (
          <span>La chacra es demasiado grande para descargarla entera.</span>
        ) : (
          <span>
            No descargado · ≈ {formatearBytes(estimado.bytes)} ({estimado.cantidad} teselas)
          </span>
        )}
      </div>

      {progreso && (
        <div className="progreso">
          <div style={{ width: `${(progreso.hechas / progreso.total) * 100}%` }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="offline-botones">
        {progreso ? (
          <button className="btn btn-chico" onClick={() => abortRef.current?.abort()}>
            Cancelar
          </button>
        ) : pack ? (
          <>
            <button className="btn btn-chico" onClick={descargar}>
              Actualizar
            </button>
            <button className="btn btn-chico btn-peligro" onClick={borrar}>
              Borrar
            </button>
          </>
        ) : (
          estimado.cantidad <= MAX_TESELAS && (
            <button className="btn btn-chico btn-primario" onClick={descargar} disabled={!navigator.onLine}>
              {navigator.onLine ? 'Descargar' : 'Sin internet'}
            </button>
          )
        )}
      </div>
    </section>
  )
}
