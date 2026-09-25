import { useState } from 'react'
import { createPortal } from 'react-dom'
import { compartirKml, compartirPaquete, type Paquete } from '../lib/intercambio'

interface Props {
  titulo: string
  obtener: () => Promise<Paquete>
  className?: string
  texto?: string
}

/** Botón que abre un menú para compartir como archivo Ferti (importable) o KML (Google Earth). */
export default function Compartir({ titulo, obtener, className = 'btn', texto = 'Compartir' }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hacer = async (accion: (p: Paquete) => Promise<void>) => {
    setOcupado(true)
    setError(null)
    try {
      await accion(await obtener())
      setAbierto(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierto(true)}>
        {texto}
      </button>
      {abierto &&
        createPortal(
        <div className="hoja-fondo" onClick={() => !ocupado && setAbierto(false)}>
          <div className="hoja menu" onClick={(e) => e.stopPropagation()}>
            <h2>{titulo}</h2>
            <button className="menu-opcion" disabled={ocupado} onClick={() => hacer(compartirPaquete)}>
              <strong>Archivo Ferti</strong>
              <span>Para abrir en otro celular con esta app (Importar)</span>
            </button>
            <button className="menu-opcion" disabled={ocupado} onClick={() => hacer(compartirKml)}>
              <strong>KML</strong>
              <span>Para ver en Google Earth</span>
            </button>
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={ocupado} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
