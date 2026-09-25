import { useEffect, useState } from 'react'
import Pantalla from '../components/Pantalla'
import {
  esAppInstalada,
  estadoAlmacenamiento,
  formatearBytes,
  pedirAlmacenamientoPersistente,
  soportaGeolocalizacion,
  soportaWakeLock,
} from '../lib/dispositivo'

type Estado = Awaited<ReturnType<typeof estadoAlmacenamiento>>

export default function Ajustes() {
  const [alm, setAlm] = useState<Estado | null>(null)
  const refrescar = () => estadoAlmacenamiento().then(setAlm)
  useEffect(() => {
    refrescar()
  }, [])

  const filas: [string, boolean, string][] = [
    ['App instalada', esAppInstalada(), 'En Safari: Compartir → Agregar a pantalla de inicio'],
    ['GPS disponible', soportaGeolocalizacion(), 'El navegador no expone la ubicación'],
    ['Mantener pantalla encendida', soportaWakeLock(), 'Actualizá iOS (18.4 o más nuevo)'],
    ['Datos protegidos contra borrado', alm?.persistente ?? false, 'Instalá la app para que iOS no borre los datos'],
  ]

  return (
    <Pantalla titulo="Ajustes" subtitulo="Estado del dispositivo" volver="/">
      <ul className="lista">
        {filas.map(([nombre, ok, ayuda]) => (
          <li key={nombre} className="item">
            <div className="item-principal">
              <strong>
                <span className={ok ? 'ok' : 'mal'}>{ok ? '✓' : '✕'}</span> {nombre}
              </strong>
              {!ok && <span>{ayuda}</span>}
            </div>
          </li>
        ))}
      </ul>

      {alm && (
        <p className="ayuda">
          Espacio usado: {formatearBytes(alm.usado)}
          {alm.cuota ? ` de ${formatearBytes(alm.cuota)}` : ''}
        </p>
      )}
      {alm && !alm.persistente && (
        <button className="btn" onClick={() => pedirAlmacenamientoPersistente().then(refrescar)}>
          Pedir almacenamiento persistente
        </button>
      )}
      <p className="ayuda">Versión {__APP_VERSION__}</p>
    </Pantalla>
  )
}
