import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App'
import { sembrarDatosIniciales } from './db'
import { pedirAlmacenamientoPersistente } from './lib/dispositivo'
import './lib/actualizacion' // registra el service worker

sembrarDatosIniciales()
pedirAlmacenamientoPersistente()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
