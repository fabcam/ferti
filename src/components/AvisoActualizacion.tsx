import { useEffect, useState } from 'react'
import { aplicarActualizacion, useHayActualizacion } from '../lib/actualizacion'

/** Aviso de versión nueva. No se muestra en la pantalla de grabación para no distraer. */
export default function AvisoActualizacion() {
  const hay = useHayActualizacion()
  const [ruta, setRuta] = useState(location.hash)
  useEffect(() => {
    const f = () => setRuta(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  if (!hay || ruta.startsWith('#/aplicacion/')) return null
  return (
    <button className="aviso-version" onClick={aplicarActualizacion}>
      Hay una versión nueva · <strong>Actualizar</strong>
    </button>
  )
}
