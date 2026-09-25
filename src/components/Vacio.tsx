import type { ReactNode } from 'react'

export default function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>
}
