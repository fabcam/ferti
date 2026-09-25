import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

// La app NO se recarga sola al haber versión nueva: si pasara grabando, la aplicación
// volvería en pausa mientras el esparcidor sigue tirando. Se avisa y se actualiza al tocar.
let hayNueva = false
const oyentes = new Set<() => void>()

const actualizarSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    hayNueva = true
    oyentes.forEach((f) => f())
  },
})

export const aplicarActualizacion = () => actualizarSW(true)

export function useHayActualizacion() {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => hayNueva,
  )
}
