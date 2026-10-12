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
├── _headers                       Cabeceras de caché y seguridad
├── .assetsignore                  Lo que no debe publicarse como estático
├── wrangler.jsonc                 Configuración del Worker y de los assets
├── src/worker.js                  Sirve los archivos y atiende el formulario
├── assets/
│   ├── css/style.css              Hoja única: tokens, componentes y movimiento
│   ├── js/ascii-field.js          Fondo ASCII en <canvas>
│   ├── js/main.js                 Tema, escenario de scroll, formulario y selector
│   ├── fonts/                     Departure Mono + IBM Plex Mono (SIL OFL)
│   └── img/                       Favicon y las dos capturas (WebP)
└── markdowns/                     Documentación de trabajo (ignorada por git)
```

No hay `package.json`, ni `node_modules`, ni paso de compilación: lo que se edita
es lo que se publica.

## Verlo en local

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

Conviene servirlo por HTTP y no abrir el archivo con `file://`: los navegadores
restringen la carga de fuentes desde `file://`.

## Publicar

Es un **Worker con Assets**, no un proyecto de Pages: eso importa, porque en un
Worker la carpeta `functions/` se ignora y el enrutado lo decide `src/worker.js`.
Está conectado a Git, así que cada push a `main` despliega.

Antes de desplegar, comprueba que el `name` de `wrangler.jsonc` es el de tu
Worker actual:

```bash
npx wrangler deployments list
```

Si no coincide, wrangler crea otro Worker y tu dominio sigue apuntando al viejo,
así que no verías ningún cambio.

## El formulario de contacto

Necesita cuatro variables en **Workers & Pages → tu Worker → Settings → Variables
and Secrets**:

| Variable | Qué es |
| :--- | :--- |
| `RESEND_API_KEY` | Clave de Resend (secreto) |
| `TURNSTILE_SECRET` | Secreto del widget de Turnstile (secreto) |
| `CONTACT_FROM` | Remitente, de tu dominio verificado en Resend |
| `CONTACT_TO` | Dónde llegan los mensajes |

De dónde sale cada valor:

- `RESEND_API_KEY`: en Resend, tras **verificar el dominio** con los registros
  DNS que te dé. Sin dominio verificado no se puede enviar.
- `TURNSTILE_SECRET`: el secreto del widget, en **Turnstile** dentro de
  Cloudflare. La *site key* de ese mismo widget va en el HTML, en `data-sitekey`,
  **en los dos idiomas**.
- `CONTACT_FROM`: cualquier dirección de tu dominio verificado, por ejemplo
  `Portafolio <contacto@hasq.dev>`. La dirección no tiene que existir.
- `CONTACT_TO`: dónde quieres recibir los mensajes.

Mientras falte algo, la ruta responde `503` y el formulario lo dice y ofrece el
correo directo.

## Verlo en local con el formulario

`python3 -m http.server` sirve la página pero no el Worker, así que el formulario
daría 404. Para probarlo entero hace falta wrangler, que lee `.dev.vars` para las
variables:

```bash
npx wrangler dev
```

## Historial

Los cambios y el porqué de cada decisión están en los commits:

```bash
git log --oneline
```
