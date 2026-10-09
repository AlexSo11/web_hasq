# CV en línea — Hector Alejandro Solís Quiñones

Sitio personal estático: perfil, stack, dos proyectos de imagen médica y el
servicio social en el CIBLab. Sin build, sin dependencias y sin coste de
servidor.

- **Español:** `index.html`
- **Inglés:** `en/index.html`

## Estructura

```
.
├── index.html              Portada en español
├── en/index.html           Portada en inglés
├── 404.html                Página de error (autocontenida, para el hosting)
├── .nojekyll               Evita que GitHub Pages procese el sitio con Jekyll
├── assets/
│   ├── css/style.css       Hoja única: tokens, componentes y estilos de impresión
│   ├── js/ascii-field.js   Fondo ASCII en <canvas> (ruido determinista)
│   ├── js/main.js          Tema claro/oscuro, sección activa, copiar el correo
│   └── img/favicon.svg     Icono `>_`
└── markdowns/              Documentación de los proyectos (fuente del contenido)
```

No hay `package.json`, ni `node_modules`, ni paso de compilación: los tres
archivos que se publican son los que se editan.

## Ver el sitio en local

Cualquier servidor de archivos estáticos sirve. Por ejemplo:

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

Abrir `index.html` con `file://` también funciona, salvo que el navegador trate
`localStorage` de forma restringida (el tema simplemente no se recuerda).

## Publicar

### GitHub Pages (recomendado)

Lo más limpio es usar el repositorio de usuario, que da la URL sin subcarpeta:

1. Crea un repositorio llamado exactamente **`AlexSo11.github.io`**.
2. Sube el contenido de esta carpeta a la rama `main`.
3. En **Settings → Pages**, elige *Deploy from a branch* → `main` → `/ (root)`.
4. En un minuto el sitio queda en **https://alexso11.github.io/**.

Si en cambio lo publicas como sitio de proyecto (`AlexSo11/portfolio`), la URL
será `https://alexso11.github.io/portfolio/`. Todo el sitio usa rutas relativas
y funciona igual, con una excepción: en `404.html`, cambia el `href="/"` del
botón «Volver al inicio» por `href="/portfolio/"`.

### Cloudflare Pages o Netlify

Ambos tienen plan gratuito y despliegan esta carpeta tal cual:

| Plataforma | Build command | Output directory |
| :--- | :--- | :--- |
| Cloudflare Pages | *(vacío)* | `/` |
| Netlify | *(vacío)* | `.` |

También se puede arrastrar la carpeta en la interfaz de cualquiera de los dos.

### Coste

Cero. Son archivos estáticos: no hay servidor, ni base de datos, ni función que
ejecutar. En los tres hostings el plan gratuito cubre de sobra el tráfico de un
CV, con HTTPS y CDN incluidos.

## Editar el contenido

El texto está directamente en los dos HTML, sin plantillas ni i18n: se edita y
se recarga.

| Qué | Dónde |
| :--- | :--- |
| Nombre, rol y bloque del terminal | `index.html` y `en/index.html`, sección `.hero` |
| Perfil | `id="perfil"` en ambos archivos |
| Stack | `id="stack"` (bloques `.stack-block`) |
| Proyectos | `id="proyectos"` (un `<article class="project">` por proyecto) |
| Servicio social | `id="servicio"` |
| Contacto | `id="contacto"` |
| Colores, tipografía y espaciado | `assets/css/style.css`, bloque *1. Tokens* |
| Densidad del fondo ASCII | `--ascii-max` en la hoja y el umbral en `ascii-field.js` |

Los datos personales que aparecen (correo, GitHub, LinkedIn) están solo en los
dos HTML; no se envían a ningún servidor.

## Decisiones de diseño

- **Sin degradados y sin emojis**, por pedido explícito. La única decoración es
  un campo de caracteres ASCII (` .:-=+*#%@`) generado con ruido de valor
  determinista y dibujado en `<canvas>`, con la opacidad máxima en `0.16` para
  no bajar el contraste del texto.
- **Sin emojis ni iconos decorativos**: los cuatro SVG (GitHub, LinkedIn, sobre,
  enlace externo) son funcionales y usan `currentColor`.
- **Tipografías del sistema**, así que no hay una sola petición de red para
  fuentes y el sitio arranca sin parpadeo de texto.
- **Los degradados están prohibidos también en la práctica**: la hoja no
  contiene la palabra `gradient` y las transiciones declaran propiedades
  concretas, nunca `transition: all`.
- **Contraste verificado por cálculo**, no a ojo. Sobre el fondo más claro que
  puede producir el campo ASCII, el texto terciario se queda en 4,7:1 y el
  secundario en 5,9:1, en los dos temas; el mínimo exigido es 4,5:1. Los
  colores están elegidos a partir de la luminancia relativa de la WCAG, no
  escogidos a ojo.
- **Accesibilidad**: enlace de salto al contenido, `aria-current` en la sección
  activa, `aria-pressed` en el conmutador de tema, región viva al copiar el
  correo, foco visible de 2 px y `prefers-reduced-motion` respetado.
- **Imprimible**: los estilos de `@media print` ocultan la decoración y el
  navegador añade la URL de cada enlace, así que `Ctrl+P` da un CV en papel
  decente sin necesidad de un PDF aparte.
- **Sin rastreo**: no hay analítica, ni cookies, ni peticiones a terceros. Lo
  único que se guarda en el navegador es el tema elegido, en `localStorage`.

## Estado del contenido

Los repositorios de InnovaMed AI y del pipeline PET/CT son privados, así que los
proyectos enlazan a la página del CIBLab y a `github.com/AlexSo11`. Cuando se
hagan públicos, basta con añadir el enlace en el bloque `.project__links` de
cada proyecto, en los dos idiomas.

### Antes de publicar: saca `markdowns/` del repositorio

Esta carpeta es la documentación de trabajo de los dos proyectos y **no debería
subirse al hosting**: un sitio estático sirve los `.md` como texto plano, así que
quedarían públicos el changelog, los planes de migración y sobre todo la sección
de seguridad de `README_DEPLOY_WEB.md`, que enumera los puntos pendientes del
visor (rutas de datos sin autenticación, traversal en subidas, ausencia de rate
limiting y la advertencia de que no es apto para uso clínico real).

Son notas honestas de trabajo en curso, pero no aportan nada al CV y sí publican
deuda técnica. Lo más simple es moverla fuera de la carpeta que se despliega:

```bash
mkdir -p ../HASQ-docs && mv markdowns ../HASQ-docs/
```

El sitio no depende de ella: el contenido de los proyectos ya está escrito en
los dos HTML.

