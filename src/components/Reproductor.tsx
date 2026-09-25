import { useEffect, useMemo, useRef, useState } from 'react'
import type { Punto } from '../db'
import { CORTE_MS } from '../lib/recorrido'

const VELOCIDADES = [10, 30, 60, 120, 300]

interface Props {
  puntos: Punto[]
  /** Índice del último punto a mostrar. */
  onIndice: (i: number) => void
  onCerrar: () => void
}

const hora = (t: number) => new Date(t).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })

function formatearMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Último índice con tiempo <= t (búsqueda binaria). */
function indiceEn(tiempos: number[], t: number) {
  let lo = 0
  let hi = tiempos.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tiempos[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

export default function Reproductor({ puntos, onIndice, onCerrar }: Props) {
  // Tiempo "efectivo": las pausas largas (sin GPS, de un día para otro) se comprimen.
  const tiempos = useMemo(() => {
    const r = [0]
    for (let i = 1; i < puntos.length; i++) r.push(r[i - 1] + Math.min(puntos[i].t - puntos[i - 1].t, CORTE_MS))
    return r
  }, [puntos])
  const total = tiempos.at(-1) ?? 0

  const [t, setT] = useState(0)
  const [jugando, setJugando] = useState(true)
  const [velocidad, setVelocidad] = useState(60)
  const indiceRef = useRef(-1)

  // Avanzar el tiempo mientras se reproduce.
  useEffect(() => {
    if (!jugando) return
    let ultimo = performance.now()
    let raf = 0
    const paso = (ahora: number) => {
      const dt = (ahora - ultimo) * velocidad
      ultimo = ahora
      setT((prev) => {
        const nuevo = Math.min(total, prev + dt)
        if (nuevo >= total) setJugando(false)
        return nuevo
      })
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [jugando, velocidad, total])

  useEffect(() => {
    const i = indiceEn(tiempos, t)
    if (i !== indiceRef.current) {
      indiceRef.current = i
      onIndice(i)
    }
  }, [t, tiempos, onIndice])

  const i = indiceEn(tiempos, t)

  const alternar = () => {
    if (!jugando && t >= total) setT(0)
    setJugando(!jugando)
  }

  return (
    <div className="reproductor">
      <div className="reproductor-fila">
        <button className="rep-btn" onClick={alternar} aria-label={jugando ? 'Pausar' : 'Reproducir'}>
          {jugando ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={total}
          step={1000}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Posición"
        />
        <button
          className="rep-vel"
          onClick={() => setVelocidad(VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length])}
          aria-label="Velocidad"
        >
          x{velocidad}
        </button>
      </div>
      <div className="reproductor-fila reproductor-info">
        <span>
          {puntos[i] ? hora(puntos[i].t) : '—'} · {formatearMs(t)} / {formatearMs(total)}
        </span>
        <button className="rep-cerrar" onClick={onCerrar}>Cerrar ✕</button>
      </div>
    </div>
  )
}
