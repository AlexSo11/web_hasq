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
├── functions/api/contacto.js      Pages Function del formulario (Resend + Turnstile)
├── assets/
│   ├── css/style.css              Hoja única: tokens, componentes, movimiento e impresión
│   ├── js/ascii-field.js          Fondo ASCII en <canvas>, con un modo por sección
│   ├── js/main.js                 Tema, escenario de scroll, formulario y selector
│   ├── fonts/                     Departure Mono + IBM Plex Mono (SIL OFL) y su licencia
│   └── img/                       Favicon y las dos capturas (WebP)
└── markdowns/                     Documentación de trabajo (ignorada por git, no se publica)
```

No hay `package.json`, ni `node_modules`, ni paso de compilación: lo que se edita
es lo que se publica. La única pieza que no es un archivo estático es la Pages
Function del formulario, y Cloudflare la despliega sola desde `functions/`.

## Ver el sitio en local

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

Conviene servirlo por HTTP y no abrir el archivo con `file://`: los navegadores
restringen la carga de fuentes desde `file://`, así que se vería la tipografía de
reserva.

### Detalles que no se ven

- **Trampa para bots**: un campo oculto y fuera del orden de tabulación. Si llega
  relleno, la función responde que todo fue bien y no envía nada, para no darle la
  pista de que se le ha visto.
- **Origen**: solo se acepta la petición si el `Origin` o el `Referer` coinciden
  con el dominio.
- **Tamaño**: el cuerpo se corta a 8 kB. El `Content-Length` es la salida barata,
  pero el tope de verdad se aplica sobre el texto ya leído, porque una petición
  enviada por trozos no trae esa cabecera.
- **Límite**: cinco envíos por IP cada diez minutos. Es de mejor esfuerzo (cada
  isolate tiene su propio mapa y hay muchos); quien de verdad protege el cupo de
  100 correos al día es Turnstile.
- La función responde con un **código**, no con un texto, y el cliente lo traduce:
  así el mensaje sale en el idioma de quien lee y no en el del servidor.
- El detalle de un fallo de Resend se queda en los registros de Cloudflare, nunca
  en la respuesta: un error suyo puede llevar direcciones o partes de la clave.
