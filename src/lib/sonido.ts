// Safari en iPhone no permite vibrar desde la web: se avisa con un pitido corto.
let ctx: AudioContext | null = null

function tono(frecuencia: number, inicio: number, duracion: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const vol = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frecuencia
  vol.gain.setValueAtTime(0.0001, ctx.currentTime + inicio)
  vol.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + inicio + 0.01)
  vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracion)
  osc.connect(vol).connect(ctx.destination)
  osc.start(ctx.currentTime + inicio)
  osc.stop(ctx.currentTime + inicio + duracion + 0.02)
}

/** Debe llamarse desde un toque del usuario (requisito de iOS para el audio). */
export function avisar(tipo: 'empezar' | 'pausar') {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    if (tipo === 'empezar') tono(880, 0, 0.18)
    else {
      tono(520, 0, 0.12)
      tono(520, 0.18, 0.12)
    }
  } catch {
    // Sin audio disponible: no es crítico.
  }
  navigator.vibrate?.(tipo === 'empezar' ? 80 : [40, 60, 40])
}
