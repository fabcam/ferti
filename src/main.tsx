import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'
import { sembrarDatosIniciales } from './db'
import { pedirAlmacenamientoPersistente } from './lib/dispositivo'

registerSW({ immediate: true })
sembrarDatosIniciales()
pedirAlmacenamientoPersistente()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
