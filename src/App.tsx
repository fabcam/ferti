import { createHashRouter, RouterProvider } from 'react-router'
import Inicio from './pages/Inicio'
import ProductorPage from './pages/Productor'
import ChacraPage from './pages/Chacra'
import EditorLimite from './pages/EditorLimite'
import Productos from './pages/Productos'
import Equipos from './pages/Equipos'
import Ajustes from './pages/Ajustes'

// Hash router: la app se sirve como archivos estáticos y funciona offline sin reescrituras del servidor.
const router = createHashRouter([
  { path: '/', element: <Inicio /> },
  { path: '/productor/:id', element: <ProductorPage /> },
  { path: '/chacra/:id', element: <ChacraPage /> },
  { path: '/chacra/:id/limite', element: <EditorLimite /> },
  { path: '/productos', element: <Productos /> },
  { path: '/equipos', element: <Equipos /> },
  { path: '/ajustes', element: <Ajustes /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
