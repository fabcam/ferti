import L from 'leaflet'
import area from '@turf/area'
import type { LatLng } from '../db'

// Uruguay, por si todavía no hay ubicación ni límite.
export const CENTRO_DEFECTO: LatLng = [-32.6, -56.0]
export const ZOOM_DEFECTO = 7
export const ZOOM_CHACRA = 17

export const URL_SATELITAL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const ZOOM_NATIVO_MAX = 19

export function crearCapaSatelital() {
  return L.tileLayer(URL_SATELITAL, {
    maxNativeZoom: ZOOM_NATIVO_MAX,
    maxZoom: 21,
    attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
  })
}

export function crearMapa(el: HTMLElement, opciones: L.MapOptions = {}) {
  const map = L.map(el, {
    center: CENTRO_DEFECTO,
    zoom: ZOOM_DEFECTO,
    zoomControl: false,
    maxZoom: 21,
    ...opciones,
  })
  map.attributionControl.setPrefix(false)
  crearCapaSatelital().addTo(map)
  return map
}

/** Superficie en hectáreas de un polígono [lat, lng][]. */
export function areaHa(poligono: LatLng[]): number {
  if (poligono.length < 3) return 0
  const anillo = poligono.map(([lat, lng]) => [lng, lat])
  anillo.push(anillo[0])
  return area({ type: 'Polygon', coordinates: [anillo] }) / 10_000
}

/** Perímetro en metros. */
export function perimetroM(poligono: LatLng[]): number {
  if (poligono.length < 2) return 0
  const cerrado = poligono.length > 2 ? [...poligono, poligono[0]] : poligono
  let total = 0
  for (let i = 1; i < cerrado.length; i++) total += L.latLng(cerrado[i - 1]).distanceTo(L.latLng(cerrado[i]))
  return total
}

export const puntoMedio = (a: LatLng, b: LatLng): LatLng => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
