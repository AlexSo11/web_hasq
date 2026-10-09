# CV en línea · Hector Alejandro Solís Quiñones

Sitio personal estático: perfil, stack, servicio social y siete proyectos (dos en
curso y cinco concluidos). Sin build, sin dependencias, sin rastreadores y sin
coste de servidor.

- **Español:** `index.html`
- **Inglés:** `en/index.html`

## Estructura

```
.
├── index.html                     Portada en español
├── en/index.html                  Portada en inglés
├── 404.html                       Página de error (autocontenida, para el hosting)
├── _headers                       Cabeceras de caché y seguridad (Cloudflare Pages)
├── .nojekyll                      Evita el procesado con Jekyll en GitHub Pages
├── assets/
│   ├── css/style.css              Hoja única: tokens, componentes, movimiento e impresión
│   ├── js/ascii-field.js          Fondo ASCII en <canvas>
│   ├── js/main.js                 Tema, entradas por scroll, sección activa, copiar correo
│   ├── fonts/                     Departure Mono + IBM Plex Mono (SIL OFL) y su licencia
│   └── img/                       Favicon
└── markdowns/                     Documentación de trabajo (ignorada por git, no se publica)
```

No hay `package.json`, ni `node_modules`, ni paso de compilación: lo que se edita
es lo que se publica.

## Ver el sitio en local

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

Conviene servirlo por HTTP y no abrir el archivo con `file://`: los navegadores
restringen la carga de fuentes desde `file://`, así que se vería la tipografía de
reserva.

## Publicar en Cloudflare Pages

1. Sube el repositorio a GitHub.
2. En el panel de Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**
   y elige el repositorio.
3. Configuración del build:

   | Campo | Valor |
   | :--- | :--- |
   | Framework preset | `None` |
   | Build command | *(vacío)* |
   | Build output directory | `/` |

4. **Save and Deploy**. Cada push a `main` vuelve a desplegar.

Cloudflare sirve `404.html` automáticamente para las rutas que no existen, así
que no hay nada que configurar para eso.

### Qué hace `_headers`

Cloudflare Pages lee ese archivo y aplica las cabeceras que declara:

- **Caché**: el HTML se revalida siempre (`max-age=0`) porque los nombres de
  archivo no llevan huella; los recursos de `assets/` se cachean una hora, y las
  fuentes un año con `immutable`, porque su nombre cambia si cambia el binario.
- **Seguridad**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy` y una `Content-Security-Policy` que solo permite recursos
  del propio dominio.

> **Importante al tocar los scripts en línea.** La CSP autoriza los tres scripts
> en línea (el del tema en `index.html`, el de `en/index.html` y el de
> `404.html`) por su hash `sha256`. Si cambias el contenido de cualquiera de
> ellos, la CSP dejará de autorizarlo, el navegador lo bloqueará y el tema no se
> inicializará. Para recalcular los hashes:

```bash
python3 - <<'PY'
import re, base64, hashlib, pathlib
for name in ["index.html", "en/index.html", "404.html"]:
    t = pathlib.Path(name).read_text(encoding="utf-8")
    for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", t, re.S):
        d = base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode()
        print(f"{name}: 'sha256-{d}'")
PY
```

Y sustituye los hashes del bloque `Content-Security-Policy` de `_headers`. El
fallo es silencioso en consola, así que conviene comprobarlo en el navegador tras
cada cambio.

### Alternativas

| Plataforma | Build command | Output directory |
| :--- | :--- | :--- |
| GitHub Pages | *(ninguno)* | rama `main`, carpeta `/ (root)` |
| Netlify | *(vacío)* | `.` |

En GitHub Pages las cabeceras de `_headers` se ignoran (es un formato de
Cloudflare). El archivo `.nojekyll` no es necesario aquí, pero se conserva porque
sin él Jekyll eliminaría `_headers` al empezar por guion bajo, y porque no cuesta
nada si algún día se publica también allí.

### Coste

Cero. Son archivos estáticos: no hay servidor, ni base de datos, ni funciones que
ejecutar. El plan gratuito de Cloudflare Pages cubre de sobra el tráfico de un
CV, con HTTPS, CDN y ancho de banda ilimitado.

## Editar el contenido

El texto está directamente en los dos HTML, sin plantillas ni i18n.

| Qué | Dónde |
| :--- | :--- |
| Nombre, rol y terminal | `index.html` y `en/index.html`, sección `.hero` |
| Perfil | `id="perfil"` |
| Stack | `id="stack"` (bloques `.stack-block`) |
| Servicio social | `id="servicio"` |
| Proyectos | `id="proyectos"`: dos grupos (`.projects__group`) con su rejilla de tarjetas (`.projects__grid`) y un `<article class="project">` por proyecto |
| Diagrama de arquitectura | `id="proyectos"`, bloque `.diagrama` dentro de la tarjeta del gemelo digital |
| Contacto | `id="contacto"` |
| Colores, tipografía, movimiento | `assets/css/style.css`, bloque *1. Tokens* |
| Densidad y zonas del fondo | `--ascii-max` y `--ascii-margin-max` en la hoja; el ruido y el tramado en `ascii-field.js` |

Las secciones van en este orden: perfil, stack, servicio social, proyectos y
contacto. Si mueves una, renumera su `section__num` y su entrada en la nav.

La tarjeta «Esta página» cita el peso total del sitio (226 kB). Si añades o
quitas archivos, mide con
`find . -type f -not -path './markdowns/*' -not -path './.git/*' -printf '%s\n' | awk '{s+=$1} END {print s/1024" kB"}'`
y actualiza esa cifra: es una afirmación verificable y conviene que siga siéndolo.

## Sistema de diseño

### Color

La paleta parte de tres colores y reparte los papeles: `#141414` (shadow) es el
fondo oscuro, `#1c1c28` (navy profundo) es la superficie y la tinta del tema
claro, y `#a0bddb` (frozen) es la tinta del tema oscuro. El complemento claro que
faltaba es un gris azulado frío derivado de frozen, y el acento es un arena
cálido que da la señal sin romper la paleta fría.

Los contrastes están **calculados** con la fórmula de luminancia relativa de la
WCAG, no elegidos a ojo:

| Tema | token | sobre el fondo | sobre la superficie |
| :--- | :--- | ---: | ---: |
| Oscuro | `--fg` | 9,47 | 8,66 |
| Oscuro | `--fg-2` | 7,60 | 6,96 |
| Oscuro | `--fg-3` | 6,90 | 6,31 |
| Oscuro | `--accent` | 9,64 | 8,82 |
| Claro | `--fg` | 14,75 | 16,85 |
| Claro | `--fg-2` | 6,17 | 7,05 |
| Claro | `--fg-3` | 5,44 | 6,22 |
| Claro | `--accent` | 6,04 | 6,90 |

El mínimo exigido es 4,5:1. El caso peor no es el fondo liso sino el glifo más
claro del campo ASCII, y ahí el terciario del tema oscuro se queda en **4,72:1**
(calculado con alfa 0,22 sobre `#141414`).

### Tipografía

- **Departure Mono** (SIL OFL) solo como display y **siempre en múltiplos de
  11 px**, que es su rejilla de diseño: wordmark, nombre del hero, números de
  sección, valores de las fichas, antetítulo y terminal. A otros tamaños el borde
  del glifo deja de caer en píxeles enteros y pierde la nitidez que la justifica.
- **IBM Plex Mono** (SIL OFL) para todo lo demás, incluido el texto de párrafo.

Se autoalojan en `assets/fonts/` con su licencia al lado, así que el sitio sigue
sin hacer una sola petición a terceros. El canvas del fondo también las usa, y
rehace la rejilla cuando terminan de cargar: si midiera antes, tomaría las
métricas de la fuente de reserva y la rejilla quedaría desalineada.

### Fondo ASCII

- **Dos zonas**: en la columna de contenido el alfa está topado (0,22 en oscuro,
  0,20 en claro) para que el texto terciario no baje de 4,5:1 sobre el glifo más
  claro; en los márgenes laterales, donde no hay nada encima, sube a 0,6 y 0,45 y
  se permite la rampa completa de caracteres. El resultado medido: los márgenes
  tienen entre 3,3× y 4,7× más tinta por píxel que la columna de lectura, y los
  dos márgenes quedan equilibrados entre sí dentro del 6 %.
- **Tramado ordenado con matriz de Bayer**: la fracción de celdas entintadas en
  cualquier zona es exactamente la intensidad media del ruido en esa zona, así que
  no hay regiones vacías. Un percentil global garantizaba el reparto total pero no
  el local, y dejaba un tercio de la pantalla limpio.
- **Estela del cursor**: el puntero levanta un campo de calor que se enfría con
  una vida media de 450 ms. El bucle de animación solo corre mientras hay algo
  vivo, así que en reposo el coste es cero.
- Con `prefers-reduced-motion` el foco es directo, sin estela ni bucle.

### Movimiento

| Efecto | Valores |
| :--- | :--- |
| Entrada de la portada | escalonado de 60 ms, 300 ms, `translateY(12px)`, `cubic-bezier(0.23, 1, 0.32, 1)` |
| Impresión del terminal | barrido de `clip-path` de 480 ms, una sola vez |
| Entrada de cada sección | la misma curva, disparada por `IntersectionObserver` una sola vez por sección |
| Micropresiones | 140 ms, `scale(0.96)` al pulsar |

Las curvas son las de una tabla (`--ease-out`, `--ease-in-out`), no inventadas.
No se anima nada de alta frecuencia: ni el hover de los elementos de lista, ni el
indicador de la nav, ni las cifras de las fichas (un contador ascendente retrasa
leer un número). Todo degrada: sin JavaScript no se marca el documento como `.js`
y el CSS no oculta nada; con `prefers-reduced-motion` no hay ni desplazamiento ni
impresión, pero el contenido se ve entero.

### Otras decisiones

- **Sin degradados y sin emojis**, por pedido explícito, y **sin guiones em** en
  el texto visible. La hoja no contiene la palabra `gradient` en ninguna regla.
- **La arquitectura del gemelo digital se cuenta con ASCII**, no con una imagen:
  un bloque `<pre>` de cuatro capas dentro de su tarjeta, de 37 caracteres de
  ancho como máximo para que quepa en un móvil sin desplazarse. Lleva
  `role="img"` y un `aria-label`, de modo que un lector de pantalla oye la
  descripción y no las barras. El SVG de la documentación, que pesaba 44 kB y
  traía un degradado y catorce sombras, no se publica.
- **Contraste e impresión**: los estilos de `@media print` ocultan la decoración y
  el navegador añade la URL de cada enlace, así que `Ctrl+P` da un CV en papel
  decente sin necesidad de un PDF aparte.
- **Accesibilidad**: enlace de salto, `aria-current` en la sección activa,
  `aria-pressed` en el conmutador de tema, región viva al copiar el correo, foco
  visible de 2 px y foco de puntero solo en dispositivos con ratón.
- **Sin rastreo**: ni analítica, ni cookies, ni peticiones a terceros. Lo único
  que se guarda en el navegador es el tema elegido, en `localStorage`.

## Estado del contenido

Hay siete proyectos: dos en curso y cinco concluidos.

- **Sin enlace** (repositorio privado): el gemelo digital, la segmentación PET/CT
  y el visor InnovaMed AI. En su lugar muestran «Repositorio privado».
- **Con enlace público**: los sistemas de gestión hospitalaria, control escolar y
  gestión de farmacia, y este mismo sitio.

La única referencia externa que no es un repositorio es la página del laboratorio,
enlazada una sola vez en la sección de servicio social.

### `markdowns/` no se publica

Esa carpeta es la documentación de trabajo de los proyectos y está en
`.gitignore`: un sitio estático serviría los `.md` como texto plano y quedarían
públicos el changelog, los planes de migración y sobre todo la sección de
seguridad de `README_DEPLOY_WEB.md`, que enumera los puntos pendientes del visor
(rutas de datos sin autenticación, traversal en subidas, ausencia de rate
limiting y la advertencia de que no es apto para uso clínico real).

El sitio no depende de ella: el contenido de los proyectos ya está escrito en los
dos HTML y la arquitectura del gemelo digital está resumida como diagrama ASCII.
