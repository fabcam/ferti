import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import L from 'leaflet'
import { borrarAplicacion, db, type Punto } from '../db'
import Mapa from '../components/Mapa'
import { CapaAplicacion } from '../lib/aplicacion'
import { Cobertura, formatearPorcentaje, type Resaltado, type ResumenCobertura } from '../lib/cobertura'
import {
  acumular,
  distanciaM,
  DISTANCIA_MIN_M,
  CORTE_MS,
  formatearDuracion,
  PRECISION_MAX_M,
  resumir,
  RESUMEN_VACIO,
  VELOCIDAD_MAX_MS,
} from '../lib/recorrido'
import { mensajeErrorGps } from '../lib/gps'
import { useWakeLock } from '../lib/wakeLock'
import { formatearFecha } from '../lib/dispositivo'

const ZOOM_GRABANDO = 18
const SIN_SENAL_MS = 6_000
const REFRESCO_RESALTADO_MS = 3_000

const SIGUIENTE_RESALTADO: Record<Resaltado, Resaltado> = { nada: 'solapes', solapes: 'huecos', huecos: 'nada' }
const TEXTO_RESALTADO: Record<Resaltado, string> = { nada: 'Resaltar', solapes: 'Solapes', huecos: 'Huecos' }

const ha = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: n < 10 ? 2 : 1 })

const iconoVehiculo = L.divIcon({
  className: '',
  html: '<div class="vehiculo"><div class="flecha"></div></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

export default function AplicacionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const app = useLiveQuery(() => db.aplicaciones.get(id), [id])
  const chacra = useLiveQuery(() => (app ? db.chacras.get(app.chacraId) : undefined), [app?.chacraId])
  const producto = useLiveQuery(() => (app ? db.productos.get(app.productoId) : undefined), [app?.productoId])

  const grabando = app?.estado === 'en_curso'

  const [mapa, setMapa] = useState<L.Map | null>(null)
  const [cargado, setCargado] = useState(false)
  const [esparciendo, setEsparciendo] = useState(false)
  const [resumen, setResumen] = useState(RESUMEN_VACIO)
  const [pos, setPos] = useState<GeolocationPosition | null>(null)
  const [errorGps, setErrorGps] = useState<string | null>(null)
  const [siguiendo, setSiguiendo] = useState(true)
  const [ahora, setAhora] = useState(Date.now())
  const [cobertura, setCobertura] = useState<ResumenCobertura | null>(null)
  const [resaltado, setResaltado] = useState<Resaltado>('nada')

  const { estado: wake, pedir: pedirWakeLock } = useWakeLock(grabando)

  const capaRef = useRef<CapaAplicacion | null>(null)
  const ultimoRef = useRef<Punto | undefined>(undefined)
  const esparciendoRef = useRef(false)
  const vehiculoRef = useRef<L.Marker | null>(null)
  const encuadradoRef = useRef(false)
  const puntosRef = useRef<Punto[]>([])
  const coberturaRef = useRef<Cobertura | null>(null)
  const coberturaCambioRef = useRef(false)

  const alListo = useCallback((map: L.Map) => {
    setMapa(map)
    map.on('dragstart', () => setSiguiendo(false))
    return () => setMapa(null)
  }, [])

  // Límite de la chacra.
  useEffect(() => {
    if (!mapa || !chacra || chacra.poligono.length < 3) return
    const forma = L.polygon(chacra.poligono, { color: '#ffffff', weight: 2, fill: false, interactive: false }).addTo(mapa)
    if (!encuadradoRef.current) {
      mapa.fitBounds(forma.getBounds(), { padding: [30, 30] })
      encuadradoRef.current = true
    }
    return () => {
      forma.remove()
    }
  }, [mapa, chacra])

  // Otras aplicaciones de la misma chacra, de fondo (p. ej. el producto que se pasó antes).
  useEffect(() => {
    if (!mapa || !app) return
    let capas: CapaAplicacion[] = []
    let cancelado = false
    ;(async () => {
      const otras = await db.aplicaciones.where('chacraId').equals(app.chacraId).filter((a) => a.id !== app.id).toArray()
      for (const otra of otras) {
        const puntos = await db.puntos.where('aplicacionId').equals(otra.id).sortBy('t')
        if (cancelado) return
        const capa = new CapaAplicacion({ color: otra.color, anchoM: otra.anchoM, opacidad: 0.3, mostrarRecorrido: false }).addTo(mapa)
        capa.cargar(puntos)
        capas.push(capa)
      }
    })()
    return () => {
      cancelado = true
      capas.forEach((c) => c.remove())
      capas = []
    }
  }, [mapa, app?.id, app?.chacraId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esta aplicación.
  useEffect(() => {
    if (!mapa || !app) return
    let cancelado = false
    const capa = new CapaAplicacion({ color: app.color, anchoM: app.anchoM, renderer: L.canvas({ padding: 0.5 }) }).addTo(mapa)
    capaRef.current = capa
    db.puntos
      .where('aplicacionId')
      .equals(app.id)
      .sortBy('t')
      .then((puntos) => {
        if (cancelado) return
        capa.cargar(puntos)
        puntosRef.current = puntos
        ultimoRef.current = puntos.at(-1)
        setResumen(resumir(puntos, app.anchoM))
        if (!chacra?.poligono.length && puntos.length && !encuadradoRef.current) {
          mapa.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng])), { padding: [30, 30] })
          encuadradoRef.current = true
        }
        setCargado(true)
      })
    return () => {
      cancelado = true
      capa.remove()
      capaRef.current = null
    }
  }, [mapa, app?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Grilla de cobertura: se arma con todo el recorrido y después se actualiza punto a punto.
  const poligonoClave = chacra?.poligono.join(';')
  useEffect(() => {
    if (!cargado || !app || !chacra || chacra.poligono.length < 3) {
      coberturaRef.current = null
      setCobertura(null)
      return
    }
    const cob = new Cobertura(chacra.poligono, app.anchoM).cargar(puntosRef.current)
    coberturaRef.current = cob
    coberturaCambioRef.current = true
    const r = cob.resumen()
    setCobertura(r)
    // Guardar el resultado para que la lista de la chacra lo muestre sin recalcular.
    if (JSON.stringify(r) !== JSON.stringify(app.cobertura)) db.aplicaciones.update(app.id, { cobertura: r })
  }, [cargado, app?.id, app?.anchoM, poligonoClave]) // eslint-disable-line react-hooks/exhaustive-deps

  // Capa que resalta solapes o huecos.
  useEffect(() => {
    if (!mapa || resaltado === 'nada') return
    const canvas = document.createElement('canvas')
    let capa: L.ImageOverlay | null = null
    let url: string | null = null
    let ocupado = false

    const dibujar = () => {
      const cob = coberturaRef.current
      if (!cob || ocupado || !coberturaCambioRef.current) return
      coberturaCambioRef.current = false
      ocupado = true
      cob.dibujar(resaltado, canvas)
      canvas.toBlob((blob) => {
        ocupado = false
        if (!blob) return
        const anterior = url
        url = URL.createObjectURL(blob)
        if (!capa) {
          capa = L.imageOverlay(url, cob.limites(), { className: 'capa-cobertura', interactive: false }).addTo(mapa)
        } else {
          capa.setUrl(url)
          capa.setBounds(L.latLngBounds(cob.limites()))
        }
        if (anterior) setTimeout(() => URL.revokeObjectURL(anterior), 1000)
      })
    }

    coberturaCambioRef.current = true
    dibujar()
    const t = setInterval(dibujar, REFRESCO_RESALTADO_MS)
    return () => {
      clearInterval(t)
      capa?.remove()
      if (url) URL.revokeObjectURL(url)
    }
  }, [mapa, resaltado, cobertura === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardarCobertura = async () => {
    const cob = coberturaRef.current
    if (app && cob) await db.aplicaciones.update(app.id, { cobertura: cob.resumen() })
  }

  const registrar = useCallback(
    (punto: Punto) => {
      if (!app) return
      const prev = ultimoRef.current
      ultimoRef.current = punto
      puntosRef.current.push(punto)
      capaRef.current?.agregar(punto)
      setResumen((r) => acumular(r, prev, punto, app.anchoM))
      const cob = coberturaRef.current
      if (cob) {
        cob.agregar(punto)
        setCobertura(cob.resumen())
        coberturaCambioRef.current = true
      }
      db.puntos.add(punto).catch((e) => setErrorGps(`No se pudo guardar: ${(e as Error).message}`))
    },
    [app],
  )

  // GPS mientras se graba.
  useEffect(() => {
    if (!grabando || !cargado || !app) return
    if (!('geolocation' in navigator)) {
      setErrorGps('Este dispositivo no tiene GPS disponible.')
      return
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setPos(p)
        setErrorGps(null)
        const c = p.coords
        if (c.accuracy > PRECISION_MAX_M) return
        const punto: Punto = {
          aplicacionId: app.id,
          lat: c.latitude,
          lng: c.longitude,
          t: p.timestamp,
          acc: c.accuracy,
          vel: c.speed ?? undefined,
          rumbo: c.heading != null && !Number.isNaN(c.heading) ? c.heading : undefined,
          esparciendo: esparciendoRef.current,
        }
        const u = ultimoRef.current
        if (u) {
          if (punto.t <= u.t) return
          const d = distanciaM(u, punto)
          const dt = (punto.t - u.t) / 1000
          if (u.esparciendo === punto.esparciendo && d < DISTANCIA_MIN_M) return
          if (dt * 1000 < CORTE_MS && d / dt > VELOCIDAD_MAX_MS) return // salto del GPS
        }
        registrar(punto)
      },
      (e) => setErrorGps(mensajeErrorGps(e)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [grabando, cargado, app, registrar])

  // Reloj para tiempos y aviso de "sin señal".
  useEffect(() => {
    if (!grabando) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [grabando])

  // Marcador del vehículo.
  useEffect(() => {
    if (!mapa || !pos) return
    const ll: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude]
    if (!vehiculoRef.current) {
      vehiculoRef.current = L.marker(ll, { icon: iconoVehiculo, interactive: false, zIndexOffset: 1000 }).addTo(mapa)
    } else {
      vehiculoRef.current.setLatLng(ll)
    }
    const flecha = vehiculoRef.current.getElement()?.querySelector<HTMLElement>('.flecha')
    const rumbo = pos.coords.heading
    if (flecha) {
      const conRumbo = rumbo != null && !Number.isNaN(rumbo) && (pos.coords.speed ?? 0) > 0.5
      flecha.style.display = conRumbo ? '' : 'none'
      if (conRumbo) flecha.style.transform = `rotate(${rumbo}deg)`
    }
    if (siguiendo) {
      if (mapa.getZoom() < ZOOM_GRABANDO - 2) mapa.setView(ll, ZOOM_GRABANDO)
      else mapa.panTo(ll)
    }
  }, [mapa, pos, siguiendo])

  useEffect(() => {
    return () => {
      vehiculoRef.current?.remove()
      vehiculoRef.current = null
    }
  }, [mapa])

  const alternarEsparcir = () => {
    pedirWakeLock()
    const nuevo = !esparciendoRef.current
    esparciendoRef.current = nuevo
    setEsparciendo(nuevo)
    navigator.vibrate?.(nuevo ? 80 : [40, 60, 40])
    // Registrar el cambio en la última posición conocida, para que la franja empiece/termine donde se tocó.
    if (app && pos && Date.now() - pos.timestamp < 5_000 && pos.coords.accuracy <= PRECISION_MAX_M) {
      const t = Math.max(Date.now(), (ultimoRef.current?.t ?? 0) + 1)
      registrar({
        aplicacionId: app.id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        t,
        acc: pos.coords.accuracy,
        vel: pos.coords.speed ?? undefined,
        esparciendo: nuevo,
      })
    }
  }

  const salir = async () => {
    if (esparciendo && !confirm('Fuera de esta pantalla no se registra el recorrido. ¿Salir igual?')) return
    await guardarCobertura()
    navigate(chacra ? `/chacra/${chacra.id}` : '/')
  }

  const finalizar = async () => {
    if (!app || !confirm('¿Finalizar esta aplicación?')) return
    esparciendoRef.current = false
    setEsparciendo(false)
    await guardarCobertura()
    await db.aplicaciones.update(app.id, { estado: 'finalizada', fin: Date.now() })
    navigate(`/chacra/${app.chacraId}`)
  }

  const reanudar = async () => {
    if (!app) return
    await db.aplicaciones.update(app.id, { estado: 'en_curso', fin: undefined })
  }

  const borrar = async () => {
    if (!app || !confirm('¿Borrar esta aplicación y todo su recorrido?')) return
    await borrarAplicacion(app.id)
    navigate(`/chacra/${app.chacraId}`, { replace: true })
  }

  if (app === undefined) return null
  if (app === null) return <p className="ayuda">Aplicación no encontrada.</p>

  const velocidadKmh =
    pos && pos.coords.speed != null && !Number.isNaN(pos.coords.speed) ? pos.coords.speed * 3.6 : null
  const kg = app.dosisKgHa ? (cobertura ? cobertura.aplicadaHa : resumen.haAprox) * app.dosisKgHa : null

  let alerta: string | null = null
  if (grabando) {
    if (errorGps) alerta = errorGps
    else if (!pos) alerta = 'Buscando GPS…'
    else if (ahora - pos.timestamp > SIN_SENAL_MS) alerta = `Sin señal GPS hace ${Math.round((ahora - pos.timestamp) / 1000)} s`
    else if (pos.coords.accuracy > PRECISION_MAX_M) alerta = `Precisión GPS mala (±${pos.coords.accuracy.toFixed(0)} m): no se registra`
    else if (wake === 'no_soportado') alerta = 'Este iPhone no puede mantener la pantalla encendida: no la bloquees'
    else if (wake === 'inactivo') alerta = 'La pantalla puede apagarse: no bloquees el celular'
  }

  return (
    <div className="editor">
      <Mapa className="editor-mapa" opciones={{ doubleClickZoom: false }} onListo={alListo} />

      <header className="editor-barra">
        <button className="btn btn-chico" onClick={salir}>‹ Salir</button>
        <div className="editor-titulo">
          <strong>
            <span className="muestra" style={{ background: app.color }} /> {producto?.nombre ?? 'Producto'}
          </strong>
          <span>
            {chacra?.nombre} · {app.anchoM.toLocaleString('es-UY')} m{grabando ? '' : ` · ${formatearFecha(app.inicio)}`}
          </span>
        </div>
        {grabando ? (
          <button className="btn btn-chico" onClick={finalizar}>Finalizar</button>
        ) : (
          <button className="btn btn-chico btn-peligro-claro" onClick={borrar}>Borrar</button>
        )}
      </header>

      {alerta && <div className="alerta">{alerta}</div>}

      <div className="editor-lateral">
        {grabando && (
          <button
            className={'redondo' + (siguiendo ? ' activo' : '')}
            onClick={() => {
              setSiguiendo(true)
              if (pos) mapa?.setView([pos.coords.latitude, pos.coords.longitude], Math.max(mapa.getZoom(), ZOOM_GRABANDO))
            }}
            aria-label="Seguir mi ubicación"
          >
            ◎
          </button>
        )}
        {chacra && chacra.poligono.length >= 3 && (
          <button
            className="redondo"
            onClick={() => {
              setSiguiendo(false)
              mapa?.fitBounds(L.latLngBounds(chacra.poligono), { padding: [30, 30] })
            }}
            aria-label="Ver toda la chacra"
          >
            ⛶
          </button>
        )}
        {cobertura && (
          <button
            className={'pildora resaltado-' + resaltado}
            onClick={() => setResaltado(SIGUIENTE_RESALTADO[resaltado])}
            aria-label="Cambiar resaltado"
          >
            {TEXTO_RESALTADO[resaltado]}
          </button>
        )}
      </div>

      <footer className="editor-panel">
        <div className="datos">
          {grabando && (
            <div>
              <strong>{velocidadKmh !== null ? velocidadKmh.toFixed(1) : '—'}</strong>
              <span>km/h</span>
            </div>
          )}
          {cobertura ? (
            <>
              <div>
                <strong>{formatearPorcentaje(cobertura.porcentaje)}</strong>
                <span>cubierto</span>
              </div>
              <div>
                <strong>{ha(cobertura.cubiertaHa)}</strong>
                <span>ha cubiertas</span>
              </div>
              <div className={cobertura.solapeHa >= 0.01 ? 'dato-solape' : undefined}>
                <strong>{ha(cobertura.solapeHa)}</strong>
                <span>ha solape</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <strong>{ha(resumen.haAprox)}</strong>
                <span>ha aplicadas*</span>
              </div>
              <div>
                <strong>{formatearDuracion(resumen.tiempoEsparciendoMs)}</strong>
                <span>esparciendo</span>
              </div>
            </>
          )}
        </div>

        {grabando ? (
          <button
            className={'btn-esparcir' + (esparciendo ? ' activo' : '')}
            style={esparciendo ? { background: app.color } : undefined}
            onClick={alternarEsparcir}
            disabled={!cargado}
          >
            {esparciendo ? '⏸  Pausar  ·  esparciendo' : '▶  Esparcir'}
          </button>
        ) : (
          <div className="editor-botones">
            <button className="btn btn-primario btn-grande" onClick={reanudar}>Reanudar aplicación</button>
          </div>
        )}
        <p className="nota">
          {[
            kg !== null && `≈ ${Math.round(kg).toLocaleString('es-UY')} kg`,
            cobertura && `${formatearDuracion(resumen.tiempoEsparciendoMs)} esparciendo`,
            cobertura && cobertura.fueraHa >= 0.01 && `${ha(cobertura.fueraHa)} ha fuera del límite`,
            !cobertura && '* Aproximado: sin límite marcado no se calculan solapes',
            grabando && pos && `GPS ±${pos.coords.accuracy.toFixed(0)} m`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </footer>
    </div>
  )
}
