import { useEffect, useRef } from 'react'
import type L from 'leaflet'
import { crearMapa } from '../lib/mapa'

interface Props {
  className?: string
  opciones?: L.MapOptions
  /** Se llama una vez con el mapa creado. Puede devolver una función de limpieza. */
  onListo: (map: L.Map) => void | (() => void)
}

export default function Mapa({ className, opciones, onListo }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = crearMapa(ref.current!, opciones)
    const limpiar = onListo(map)
    // El contenedor puede cambiar de tamaño (rotar el celular, teclado, etc.).
    const obs = new ResizeObserver(() => map.invalidateSize())
    obs.observe(ref.current!)
    return () => {
      obs.disconnect()
      limpiar?.()
      map.remove()
    }
    // El mapa se crea una sola vez; los cambios se manejan desde onListo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={ref} className={className ?? 'mapa'} />
}
