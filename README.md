# CV en línea · Hector Alejandro Solís Quiñones

Sitio personal estático. Sin build, sin dependencias y sin coste de servidor.

- **Español:** `index.html` · **Inglés:** `en/index.html`

## Estructura

| | |
| :--- | :--- |
| `assets/css/style.css` | Hoja única |
| `assets/js/` | Fondo ASCII, interfaz y escenas 3D |
| `assets/fonts/` · `assets/img/` | Tipografías (SIL OFL) y capturas |
| `src/worker.js` | Sirve los archivos y atiende el formulario |
| `wrangler.jsonc` | Configuración del Worker |
| `_headers` | Cabeceras de caché y seguridad |
| `markdowns/` | Notas de trabajo (no se publican) |

## Verlo en local

```bash
python3 -m http.server 8765     # http://127.0.0.1:8765/
npx wrangler dev                # con el formulario
```

## Publicar

Es un Worker con Assets, conectado a Git: cada push a `main` despliega. Si `name`
en `wrangler.jsonc` no coincide con tu Worker, wrangler crea otro:

```bash
npx wrangler deployments list
```

## El formulario de contacto

| Variable | Dónde |
| :--- | :--- |
| `CONTACT_FROM` · `CONTACT_TO` | `wrangler.jsonc` |
| `RESEND_API_KEY` · `TURNSTILE_SECRET` | Panel, tipo **Secret** |

Los secretos van en **Workers & Pages → tu Worker → Settings → Variables and
Secrets**, y hay que pulsar **Deploy** al terminar. La *site key* de Turnstile va
en el HTML, en `data-sitekey`, en los dos idiomas.
