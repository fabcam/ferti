export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function estadoAlmacenamiento() {
  const persistente = (await navigator.storage?.persisted?.()) ?? false
  const est = await navigator.storage?.estimate?.()
  return { persistente, usado: est?.usage ?? 0, cuota: est?.quota ?? 0 }
}

export const soportaWakeLock = () => 'wakeLock' in navigator
export const soportaGeolocalizacion = () => 'geolocation' in navigator
export const esAppInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function formatearBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

export const formatearHa = (ha: number) =>
  ha.toLocaleString('es-UY', { maximumFractionDigits: ha < 10 ? 2 : 1 }) + ' ha'

export const formatearFecha = (t: number) =>
  new Date(t).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' })
