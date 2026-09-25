import { useEffect, type FormEvent, type ReactNode } from 'react'

interface Props {
  titulo: string
  abierta: boolean
  onCerrar: () => void
  onGuardar: () => void | Promise<void>
  onBorrar?: () => void | Promise<void>
  textoGuardar?: string
  children: ReactNode
}

/** Hoja inferior con un formulario, cómoda de usar con una mano. */
export default function Hoja({ titulo, abierta, onCerrar, onGuardar, onBorrar, textoGuardar = 'Guardar', children }: Props) {
  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierta, onCerrar])

  if (!abierta) return null

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    await onGuardar()
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <form className="hoja" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h2>{titulo}</h2>
        <div className="hoja-campos">{children}</div>
        <div className="hoja-botones">
          {onBorrar && (
            <button type="button" className="btn btn-peligro" onClick={onBorrar}>
              Borrar
            </button>
          )}
          <span className="espacio" />
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario">
            {textoGuardar}
          </button>
        </div>
      </form>
    </div>
  )
}
