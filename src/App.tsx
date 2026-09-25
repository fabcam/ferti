import type { ComponentType } from 'react'
import { createHashRouter, RouterProvider, useParams } from 'react-router'
import Inicio from './pages/Inicio'
import ProductorPage from './pages/Productor'
import ChacraPage from './pages/Chacra'
import EditorLimite from './pages/EditorLimite'
import AplicacionPage from './pages/Aplicacion'
import Productos from './pages/Productos'
import Equipos from './pages/Equipos'
import Ajustes from './pages/Ajustes'
import Importar from './pages/Importar'
import AvisoActualizacion from './components/AvisoActualizacion'

/** Recrea la pantalla al cambiar el :id, para que no arrastre estado de otra chacra o aplicación. */
function porId(Pagina: ComponentType) {
  return function ConClave() {
    const { id } = useParams()
    return <Pagina key={id} />
  }
}
const Limite = porId(EditorLimite)
const AplicacionPorId = porId(AplicacionPage)

// Hash router: la app se sirve como archivos estáticos y funciona offline sin reescrituras del servidor.
const router = createHashRouter([
  { path: '/', element: <Inicio /> },
  { path: '/productor/:id', element: <ProductorPage /> },
  { path: '/chacra/:id', element: <ChacraPage /> },
  { path: '/chacra/:id/limite', element: <Limite /> },
  { path: '/aplicacion/:id', element: <AplicacionPorId /> },
  { path: '/productos', element: <Productos /> },
  { path: '/equipos', element: <Equipos /> },
  { path: '/ajustes', element: <Ajustes /> },
  { path: '/importar', element: <Importar /> },
])

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <AvisoActualizacion />
    </>
  )
}
