# Ferti — Plan del proyecto

PWA 100 % local para registrar por dónde pasó un esparcidor de fertilizante (tolva con disco),
pensada para celular (hoy iPhone) y más adelante tablet + GPS externo.

## Contexto de uso

- Equipo actual: tolva acoplada a una camioneta, ancho de trabajo ~5–6 m (configurable).
- Dispositivo: iPhone, instalado como app desde Safari ("Agregar a pantalla de inicio").
- A veces se pasan dos productos en la misma chacra, uno después del otro → cada producto se ve en su color.
- Futuro: tablet + GPS externo (más precisión).

## Limitaciones conocidas (iPhone / PWA)

- **Sin grabación en segundo plano**: si se bloquea la pantalla o se cambia de app, el GPS se corta.
  Se usa Wake Lock para mantener la pantalla encendida; el celular va en soporte y enchufado.
- Wake Lock en app instalada funciona bien desde iOS 18.4. Si no está disponible, se avisa en pantalla.
- Precisión GPS del celular: 3–5 m. Con 5–6 m de ancho es usable; se muestra la precisión y se
  descartan lecturas malas (umbral configurable).
- Se pide `navigator.storage.persist()` para que iOS no borre los datos.

## Funcionalidades

### Productores y chacras
- ABM de productores.
- ABM de chacras por productor; límite como polígono y superficie en ha.
- Definir el límite: marcando puntos con GPS (promediando lecturas) o tocando el mapa; editar vértices.

### Productos
- ABM de productos: nombre, **color**, dosis por defecto (kg/ha).
- Cada aplicación se hace con un producto; en el mapa cada producto se pinta con su color.
- Los solapes se calculan dentro del mismo producto (pasar dos productos distintos por el mismo lugar es normal).

### Equipos
- Perfiles de esparcidor con ancho de trabajo (m). El ancho se copia a cada aplicación.

### Aplicación en vivo
- Mapa satelital, modo seguirme, franja pintada con el ancho real y el color del producto.
- Botón grande Esparciendo / Pausa.
- Solapes resaltados, % cubierto, ha, kg estimados, velocidad, precisión, tiempo.
- Guardado continuo; aplicación retomable.
- Capas de otras aplicaciones de la chacra visibles de fondo (p. ej. ver el producto 1 mientras se pasa el 2).

### Historial y reproducción
- Lista de aplicaciones por chacra.
- Reproductor con play/pausa, velocidad x1–x60 y barra de tiempo.
- Superponer varias aplicaciones.

### Exportar / importar
- Formato `.ferti.json` versionado (productor, chacras, productos, aplicaciones y puntos).
- Compartir con Web Share API (WhatsApp, mail, Archivos) o descargar.
- Importar con detección de duplicados por UUID.
- Exportar KML/GeoJSON. Backup completo.

### Mapas offline
- Descargar tiles satelitales del área de cada chacra (+ margen), zooms 14–19, con progreso y tamaño.
- Gestionar/borrar mapas descargados.

## Stack

Vite + React + TypeScript · Leaflet · vite-plugin-pwa · Dexie (IndexedDB) · Turf.js · cobertura en grilla raster.

## Modelo de datos

- `Productor { id, nombre, telefono?, notas?, creado }`
- `Chacra { id, productorId, nombre, poligono: [lat,lng][], areaHa, notas?, creado }`
- `Producto { id, nombre, color, dosisKgHa? }`
- `Equipo { id, nombre, anchoM }`
- `Aplicacion { id, chacraId, productoId, equipoId?, anchoM, dosisKgHa?, inicio, fin?, estado }`
- `Punto { id++, aplicacionId, lat, lng, t, acc, vel?, rumbo?, esparciendo }`
- `Tile { key, blob }`, `TilePack { chacraId, zMin, zMax, cantidad, bytes }`

## Etapas

1. Esqueleto: PWA instalable, Dexie, navegación, ABM productores / chacras / productos / equipos.
2. Chacras: mapa, marcado de límite por GPS o toque, edición y área.
3. Grabación en vivo: GPS, franja, pausa, Wake Lock, guardado continuo.
4. Cobertura: grilla, %, solapes por producto, ha, kg.
5. Historial y reproductor.
6. Exportar / importar / compartir.
7. Mapas offline por chacra.
8. Pulido para el campo y prueba real.

Después: guía de pasadas paralelas (A-B), GPS externo Bluetooth, zonas de exclusión, reporte PDF.
