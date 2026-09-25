import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

interface Props {
  titulo: string
  subtitulo?: string
  volver?: string
  acciones?: ReactNode
  children: ReactNode
}

export default function Pantalla({ titulo, subtitulo, volver, acciones, children }: Props) {
  const navigate = useNavigate()
  return (
    <div className="pantalla">
      <header className="barra">
        {volver !== undefined && (
          <button className="barra-volver" onClick={() => navigate(volver)} aria-label="Volver">
            ‹
          </button>
        )}
        <div className="barra-titulos">
          <h1>{titulo}</h1>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {acciones && <div className="barra-acciones">{acciones}</div>}
      </header>
      <main className="contenido">{children}</main>
    </div>
  )
}
