# CV en línea · Hector Alejandro Solís Quiñones

Sitio personal estático: perfil, stack, experiencia y siete proyectos (dos en
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
├── functions/api/contacto.js      Pages Function del formulario (Resend + Turnstile)
├── assets/
│   ├── css/style.css              Hoja única: tokens, componentes y movimiento
│   ├── js/ascii-field.js          Fondo ASCII en <canvas>
│   ├── js/main.js                 Tema, escenario de scroll, formulario y selector
│   ├── fonts/                     Departure Mono + IBM Plex Mono (SIL OFL)
│   └── img/                       Favicon y las dos capturas (WebP)
└── markdowns/                     Documentación de trabajo (ignorada por git)
```

No hay `package.json`, ni `node_modules`, ni paso de compilación: lo que se edita
es lo que se publica. La única pieza que no es un archivo estático es la Pages
Function del formulario.

## Verlo en local

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

Conviene servirlo por HTTP y no abrir el archivo con `file://`: los navegadores
restringen la carga de fuentes desde `file://`.

## Publicar

Está conectado a Git: cada push a `main` despliega. Sin build command, con `/`
como directorio de salida.

## El formulario de contacto

Necesita cuatro variables en **Workers & Pages → tu proyecto → Settings →
Variables and Secrets**:

| Variable | Qué es |
| :--- | :--- |
| `RESEND_API_KEY` | Clave de Resend (secreto) |
| `TURNSTILE_SECRET` | Secreto del widget de Turnstile (secreto) |
| `CONTACT_FROM` | Remitente, de tu dominio verificado en Resend |
| `CONTACT_TO` | Dónde llegan los mensajes |

La *site key* de Turnstile va en el HTML, en `data-sitekey`, **en los dos
idiomas**. Mientras falte algo, el formulario se oculta y quedan el correo
directo y los perfiles, que funcionan solos.

El paso a paso, con los registros DNS y las trampas de cada panel, está en
[ACTIVAR-FORMULARIO.md](ACTIVAR-FORMULARIO.md).

## Historial

Los cambios y el porqué de cada decisión están en los commits:

```bash
git log --oneline
```
