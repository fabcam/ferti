import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Chacra } from '../db'
import Pantalla from '../components/Pantalla'
import Hoja from '../components/Hoja'
import Vacio from '../components/Vacio'
import { formatearHa } from '../lib/dispositivo'

export default function ProductorPage() {
  const { id = '' } = useParams()
  const productor = useLiveQuery(() => db.productores.get(id), [id])
  const chacras = useLiveQuery(() => db.chacras.where('productorId').equals(id).sortBy('nombre'), [id])
  const [nueva, setNueva] = useState<string | null>(null)

  const crear = async () => {
    if (!nueva?.trim()) return
    const chacra: Chacra = {
      id: uid(),
      productorId: id,
      nombre: nueva.trim(),
      poligono: [],
      areaHa: 0,
      creado: Date.now(),
    }
    await db.chacras.add(chacra)
    setNueva(null)
  }

  if (productor === undefined) return null

  return (
    <Pantalla titulo={productor?.nombre ?? 'Productor'} subtitulo="Chacras" volver="/">
      {chacras?.length === 0 && <Vacio>Este productor todavía no tiene chacras.</Vacio>}

      <ul className="lista">
        {chacras?.map((c) => (
          <li key={c.id} className="item">
            <Link to={`/chacra/${c.id}`} className="item-principal">
              <strong>{c.nombre}</strong>
              <span>{c.poligono.length >= 3 ? formatearHa(c.areaHa) : 'Sin límite marcado'}</span>
            </Link>
          </li>
        ))}
      </ul>

      <button className="fab" onClick={() => setNueva('')}>+ Chacra</button>

      <Hoja titulo="Nueva chacra" abierta={nueva !== null} onCerrar={() => setNueva(null)} onGuardar={crear}>
        <label>
          Nombre
          <input autoFocus required value={nueva ?? ''} onChange={(e) => setNueva(e.target.value)} />
        </label>
        <p className="ayuda">Después de crearla vas a poder marcar su límite en el mapa.</p>
      </Hoja>
    </Pantalla>
  )
}
