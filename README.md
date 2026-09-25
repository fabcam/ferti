# Ferti

Registro de por dónde pasó el esparcidor de fertilizante. Funciona en el celular, sin internet y sin cuentas:
todos los datos quedan guardados en el dispositivo.

**App:** https://fabcam.github.io/ferti/

**Guía de uso (PDF, con capturas):** [docs/Guia-de-uso-Ferti.pdf](docs/Guia-de-uso-Ferti.pdf)

## Instalar en el iPhone

1. Abrir el link en **Safari**.
2. **Compartir → Agregar a pantalla de inicio**.
3. Abrir Ferti desde el ícono y permitir la ubicación cuando la pida.
4. En **Ajustes** (dentro de la app) todo debería estar en verde.

## Uso en el campo

1. **Productos**: cargar cada producto con su color (por ejemplo, urea amarilla y fosfato celeste).
2. **Equipos**: revisar el ancho de trabajo del esparcidor (viene "Tolva camioneta" con 5,5 m).
3. **Productor → Chacra → Marcar límite**: tocando el mapa o recorriendo el borde con
   **📍 Marcar aquí** (quedarse quieto unos segundos en cada esquina).
4. En la chacra, **Mapa sin conexión → Descargar** mientras haya internet.
5. **+ Aplicación**: elegir producto, equipo y dosis, y **Empezar**.
6. Con el celular en el soporte, enchufado y con la pantalla prendida:
   **▶ Esparcir** al abrir la tolva y **Pausar** en cabeceras, traslados y recargas.
7. **Guías** (botón al costado del mapa): tocar un lado de la chacra y aparecen líneas paralelas a ese lado,
   una cada ancho de trabajo, alternando **fuerte** y **clara** (carriles del doble del ancho con la clara al
   medio). Pasando por cada línea no quedan huecos; la primera va a medio ancho del borde.
   Se ven al acercar el mapa.
8. Abajo se ve el **% cubierto**, las hectáreas y los **solapes**. El botón **Resaltar** marca en rojo
   donde se pasó dos veces o en rosado lo que falta.
9. **Finalizar** al terminar. Después se puede **reproducir**, **compartir** o **reanudar**.

Importante: si se bloquea el celular o se cambia de app, **no se registra**. Si pasa, al volver la
aplicación sigue en pausa y hay que tocar Esparcir de nuevo.

## Compartir y respaldar

- **Compartir** (en una chacra o aplicación): archivo Ferti para abrir en otro celular, o KML para Google Earth.
- **Importar**: elegir el archivo `.ferti.json` (guardarlo antes en Archivos). No duplica lo que ya existe.
- **Importar → Exportar todo**: backup completo, recomendado antes de cambiar de celular.

## Desarrollo

```bash
npm install
npm run dev
```

Vite + React + TypeScript, Leaflet, Dexie (IndexedDB) y vite-plugin-pwa. Cada push a `main` se publica
en GitHub Pages. El plan y las decisiones de diseño están en [docs/PLAN.md](docs/PLAN.md).
