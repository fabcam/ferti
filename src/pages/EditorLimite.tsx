import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import L from 'leaflet'
import { db, type LatLng } from '../db'
import Mapa from '../components/Mapa'
import { areaHa, perimetroM, puntoMedio, ZOOM_CHACRA } from '../lib/mapa'
import { promediarPosicion, useUbicacion, type Muestreo } from '../lib/gps'
import { formatearHa } from '../lib/dispositivo'

const iconoVertice = (n: number, elegido: boolean) =>
  L.divIcon({
    className: '',
    html: `<div class="vertice${elegido ? ' elegido' : ''}">${n}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })

const iconoMedio = L.divIcon({ className: '', html: '<div class="vertice-medio">+</div>', iconSize: [26, 26], iconAnchor: [13, 13] })

const iconoYo = L.divIcon({ className: '', html: '<div class="yo"></div>', iconSize: [22, 22], iconAnchor: [11, 11] })

export default function EditorLimite() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const chacra = useLiveQuery(() => db.chacras.get(id), [id])

  const [puntos, setPuntos] = useState<LatLng[] | null>(null)
  const [historial, setHistorial] = useState<LatLng[][]>([])
  const [elegido, setElegido] = useState<number | null>(null)
  const [muestreo, setMuestreo] = useState<Muestreo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [siguiendo, setSiguiendo] = useState(false)

  const { pos, error: errorGps } = useUbicacion()

  const mapRef = useRef<L.Map | null>(null)
  const capaRef = useRef<L.LayerGroup | null>(null)
  const yoRef = useRef<{ punto: L.Marker; circulo: L.Circle } | null>(null)
  const centradoRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  // Cargar el límite guardado una sola vez.
  useEffect(() => {
    if (chacra && puntos === null) setPuntos(chacra.poligono)
  }, [chacra, puntos])

  const cambiar = useCallback(
    (nuevos: LatLng[]) => {
      if (puntos) setHistorial((h) => [...h.slice(-49), puntos])
      setPuntos(nuevos)
    },
    [puntos],
  )

  const alListo = useCallback((map: L.Map) => {
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __mapa: L.Map }).__mapa = map
    capaRef.current = L.layerGroup().addTo(map)
    map.on('dragstart', () => setSiguiendo(false))
    return () => {
      mapRef.current = null
      capaRef.current = null
      yoRef.current = null
    }
  }, [])

  // Encuadre inicial: el límite si existe; si no, la ubicación actual.
  useEffect(() => {
    const map = mapRef.current
    if (!map || centradoRef.current || puntos === null) return
    if (puntos.length >= 2) {
      map.fitBounds(L.latLngBounds(puntos), { padding: [40, 40] })
      centradoRef.current = true
    } else if (puntos.length > 0) {
      // Ya empezó a marcar a mano: no mover más el mapa.
      centradoRef.current = true
    } else if (pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], ZOOM_CHACRA)
      centradoRef.current = true
      setSiguiendo(true)
    }
  }, [puntos, pos])

  // Tocar el mapa agrega un punto al final.
  useEffect(() => {
    const map = mapRef.current
    if (!map || puntos === null) return
    const onClick = (e: L.LeafletMouseEvent) => {
      if (elegido !== null) {
        setElegido(null)
        return
      }
      cambiar([...puntos, [e.latlng.lat, e.latlng.lng]])
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [puntos, elegido, cambiar])

  // Dibujar polígono, vértices y puntos intermedios.
  useEffect(() => {
    const capa = capaRef.current
    if (!capa || !puntos) return
    capa.clearLayers()

    const forma =
      puntos.length >= 3
        ? L.polygon(puntos, { color: '#ffd21f', weight: 3, fillOpacity: 0.15, interactive: false })
        : L.polyline(puntos, { color: '#ffd21f', weight: 3, dashArray: '6 6', interactive: false })
    forma.addTo(capa)

    const cerrado = puntos.length >= 3
    const lados = cerrado ? puntos.length : puntos.length - 1
    for (let i = 0; i < lados; i++) {
      const a = puntos[i]
      const b = puntos[(i + 1) % puntos.length]
      const medio = L.marker(puntoMedio(a, b), { icon: iconoMedio, draggable: true, zIndexOffset: -100 })
      const insertar = (ll: LatLng) => {
        const nuevos = [...puntos]
        nuevos.splice(i + 1, 0, ll)
        cambiar(nuevos)
        setElegido(i + 1)
      }
      medio.on('click', () => insertar(puntoMedio(a, b)))
      medio.on('dragend', () => {
        const ll = medio.getLatLng()
        insertar([ll.lat, ll.lng])
      })
      medio.addTo(capa)
    }

    puntos.forEach((p, i) => {
      const m = L.marker(p, { icon: iconoVertice(i + 1, elegido === i), draggable: true })
      m.on('click', () => setElegido(elegido === i ? null : i))
      m.on('drag', () => {
        const ll = m.getLatLng()
        const copia = [...puntos]
        copia[i] = [ll.lat, ll.lng]
        forma.setLatLngs(copia)
      })
      m.on('dragend', () => {
        const ll = m.getLatLng()
        const copia = [...puntos]
        copia[i] = [ll.lat, ll.lng]
        cambiar(copia)
        setElegido(i)
      })
      m.addTo(capa)
    })
  }, [puntos, elegido, cambiar])

  // Mi ubicación.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !pos) return
    const ll: LatLng = [pos.coords.latitude, pos.coords.longitude]
    if (!yoRef.current) {
      yoRef.current = {
        circulo: L.circle(ll, { radius: pos.coords.accuracy, color: '#4aa3ff', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map),
        punto: L.marker(ll, { icon: iconoYo, interactive: false, zIndexOffset: 1000 }).addTo(map),
      }
    } else {
      yoRef.current.punto.setLatLng(ll)
      yoRef.current.circulo.setLatLng(ll).setRadius(pos.coords.accuracy)
    }
    if (siguiendo) map.panTo(ll)
  }, [pos, siguiendo])

  const deshacer = () => {
    const anterior = historial.at(-1)
    if (!anterior) return
    setHistorial(historial.slice(0, -1))
    setPuntos(anterior)
    setElegido(null)
  }

  const borrarElegido = () => {
    if (elegido === null || !puntos) return
    cambiar(puntos.filter((_, i) => i !== elegido))
    setElegido(null)
  }

  const borrarTodo = () => {
    if (!puntos?.length || !confirm('¿Borrar todos los puntos del límite?')) return
    cambiar([])
    setElegido(null)
  }

  const marcarAqui = async () => {
    if (!puntos) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setMuestreo({ lecturas: 0, objetivo: 5 })
    try {
      const r = await promediarPosicion({ onProgreso: setMuestreo, signal: ctrl.signal })
      cambiar([...puntos, r.punto])
      setElegido(null)
      setAviso(`Punto ${puntos.length + 1} marcado (±${r.precision.toFixed(1)} m, ${r.lecturas} lecturas)`)
      mapRef.current?.panTo(r.punto)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setAviso((e as Error).message)
    } finally {
      setMuestreo(null)
      abortRef.current = null
    }
  }

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const hayCambios = !!chacra && !!puntos && JSON.stringify(puntos) !== JSON.stringify(chacra.poligono)

  const salir = () => {
    if (hayCambios && !confirm('Hay cambios sin guardar. ¿Salir igual?')) return
    navigate(`/chacra/${id}`)
  }

  const guardar = async () => {
    if (!puntos) return
    if (puntos.length > 0 && puntos.length < 3) {
      setAviso('El límite necesita al menos 3 puntos.')
      return
    }
    await db.chacras.update(id, { poligono: puntos, areaHa: areaHa(puntos) })
    navigate(`/chacra/${id}`)
  }

  if (chacra === undefined) return null
  const n = puntos?.length ?? 0

  return (
    <div className="editor">
      {/* Sin zoom por doble toque: al marcar puntos seguidos se confundiría con un zoom. */}
      <Mapa className="editor-mapa" opciones={{ doubleClickZoom: false }} onListo={alListo} />

      <header className="editor-barra">
        <button className="btn btn-chico" onClick={salir}>Cancelar</button>
        <div className="editor-titulo">
          <strong>Límite · {chacra.nombre}</strong>
          <span>
            {n} punto(s)
            {n >= 3 && ` · ${formatearHa(areaHa(puntos!))} · ${(perimetroM(puntos!) / 1000).toFixed(2)} km`}
          </span>
        </div>
        <button className="btn btn-chico btn-primario" onClick={guardar} disabled={!hayCambios}>
          Guardar
        </button>
      </header>

      <div className="editor-lateral">
        <button
          className={'redondo' + (siguiendo ? ' activo' : '')}
          onClick={() => {
            setSiguiendo(true)
            if (pos) mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], Math.max(mapRef.current.getZoom(), ZOOM_CHACRA))
          }}
          aria-label="Centrar en mi ubicación"
          disabled={!pos}
        >
          ◎
        </button>
        {puntos && puntos.length >= 2 && (
          <button
            className="redondo"
            onClick={() => mapRef.current?.fitBounds(L.latLngBounds(puntos), { padding: [40, 40] })}
            aria-label="Ver todo el límite"
          >
            ⛶
          </button>
        )}
      </div>

      {aviso && <div className="aviso">{aviso}</div>}

      <footer className="editor-panel">
        <p className="editor-estado">
          {errorGps ?? (pos ? `GPS ±${pos.coords.accuracy.toFixed(0)} m · ` : 'Buscando GPS… · ')}
          {!errorGps && 'Tocá el mapa o marcá con GPS'}
        </p>
        <div className="editor-botones">
          <button className="btn" onClick={deshacer} disabled={!historial.length}>Deshacer</button>
          {elegido !== null ? (
            <button className="btn btn-peligro" onClick={borrarElegido}>Borrar punto {elegido + 1}</button>
          ) : (
            <button className="btn btn-peligro" onClick={borrarTodo} disabled={!n}>Borrar</button>
          )}
          <button className="btn btn-primario btn-grande" onClick={marcarAqui} disabled={!pos || !!muestreo}>
            📍 Marcar aquí
          </button>
        </div>
      </footer>

      {muestreo && (
        <div className="hoja-fondo">
          <div className="hoja muestreo">
            <h2>Marcando punto con GPS…</h2>
            <p>Quedate quieto unos segundos.</p>
            <div className="progreso">
              <div style={{ width: `${(muestreo.lecturas / muestreo.objetivo) * 100}%` }} />
            </div>
            <p className="ayuda">
              {muestreo.lecturas} de {muestreo.objetivo} lecturas
              {muestreo.ultimaPrecision !== undefined && ` · precisión actual ±${muestreo.ultimaPrecision.toFixed(0)} m`}
            </p>
            <button className="btn" onClick={() => abortRef.current?.abort()}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
