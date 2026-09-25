import { useRef, useState } from 'react'
import { Link } from 'react-router'
import Pantalla from '../components/Pantalla'
import Compartir from '../components/Compartir'
import {
  analizar,
  EXTENSION,
  importar,
  leerPaquete,
  paqueteCompleto,
  type Analisis,
  type Conteo,
  type Paquete,
} from '../lib/intercambio'
import { formatearFecha } from '../lib/dispositivo'

const FILAS: [keyof Omit<Analisis, 'puntos' | 'faltantes'>, string][] = [
  ['productores', 'Productores'],
  ['chacras', 'Chacras'],
  ['aplicaciones', 'Aplicaciones'],
  ['productos', 'Productos'],
  ['equipos', 'Equipos'],
]

const describir = (c: Conteo) =>
  [c.nuevos && `${c.nuevos} nueva(s)`, c.existentes && `${c.existentes} ya estaba(n)`].filter(Boolean).join(' · ') || '—'

export default function Importar() {
  const entrada = useRef<HTMLInputElement>(null)
  const [paquete, setPaquete] = useState<Paquete | null>(null)
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const elegir = async (archivo: File | undefined) => {
    setError(null)
    setListo(null)
    setPaquete(null)
    setAnalisis(null)
    if (!archivo) return
    try {
      const p = await leerPaquete(archivo)
      setPaquete(p)
      setAnalisis(await analizar(p))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      if (entrada.current) entrada.current.value = ''
    }
  }

  const confirmar = async () => {
    if (!paquete || !analisis) return
    setOcupado(true)
    try {
      await importar(paquete)
      const n = analisis.aplicaciones.nuevos
      setListo(n ? `Listo: se importaron ${n} aplicación(es).` : 'Listo: se agregaron los datos nuevos.')
      setPaquete(null)
      setAnalisis(null)
    } catch (e) {
      setError(`No se pudo importar: ${(e as Error).message}`)
    } finally {
      setOcupado(false)
    }
  }

  const nada = analisis && FILAS.every(([k]) => analisis[k].nuevos === 0)

  return (
    <Pantalla titulo="Importar y respaldar" volver="/">
      <section className="tarjeta bloque">
        <h2>Importar un archivo</h2>
        <p className="ayuda">
          Elegí un archivo <code>{EXTENSION}</code> que te hayan mandado (guardalo antes en Archivos desde WhatsApp o
          Mail). Lo que ya esté en este celular no se duplica.
        </p>
        <input
          ref={entrada}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => elegir(e.target.files?.[0])}
        />
        <button className="btn btn-primario" onClick={() => entrada.current?.click()}>
          Elegir archivo…
        </button>

        {error && <p className="error">{error}</p>}
        {listo && <p className="exito">{listo}</p>}

        {paquete && analisis && (
          <div className="previa">
            <p>
              <strong>{paquete.descripcion}</strong>
              <br />
              <span className="ayuda">Exportado el {formatearFecha(paquete.exportado)}</span>
            </p>
            <table>
              <tbody>
                {FILAS.map(([k, nombre]) =>
                  analisis[k].nuevos + analisis[k].existentes > 0 ? (
                    <tr key={k}>
                      <th>{nombre}</th>
                      <td>{describir(analisis[k])}</td>
                    </tr>
                  ) : null,
                )}
                {analisis.puntos > 0 && (
                  <tr>
                    <th>Puntos GPS</th>
                    <td>{analisis.puntos.toLocaleString('es-UY')}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {analisis.faltantes.length > 0 && (
              <p className="error">
                El archivo está incompleto: falta {[...new Set(analisis.faltantes)].join(', ')}.
              </p>
            )}
            {nada ? (
              <p className="ayuda">Todo lo de este archivo ya está en el celular.</p>
            ) : (
              <button
                className="btn btn-primario"
                disabled={ocupado || analisis.faltantes.length > 0}
                onClick={confirmar}
              >
                {ocupado ? 'Importando…' : 'Importar'}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="tarjeta bloque">
        <h2>Backup completo</h2>
        <p className="ayuda">
          Un solo archivo con todos los productores, chacras, productos y recorridos. Guardalo en Archivos o mandátelo
          por mail antes de cambiar de celular.
        </p>
        <Compartir titulo="Backup completo" obtener={paqueteCompleto} className="btn" texto="Exportar todo" />
      </section>

      <p className="ayuda">
        Para compartir una sola chacra o aplicación, usá el botón <em>Compartir</em> dentro de ella. <Link to="/">Volver al inicio</Link>
      </p>
    </Pantalla>
  )
}
