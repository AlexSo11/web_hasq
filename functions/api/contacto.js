/*
 * Formulario de contacto: valida, comprueba Turnstile y envía por Resend.
 *
 * Esta es la única pieza del sitio que no es estática. Es una Pages Function y
 * entra en el plan gratuito de Cloudflare: las peticiones cuentan contra las
 * 100.000 diarias de Workers y los archivos estáticos siguen siendo gratis.
 *
 * Variables de entorno que necesita (Pages → Settings → Environment variables):
 *   RESEND_API_KEY    secreto. Clave de https://resend.com/api-keys
 *   CONTACT_FROM      texto.   Remitente verificado, p. ej.
 *                              "Portafolio <contacto@tudominio.com>"
 *   CONTACT_TO        texto.   Destinatario, p. ej. ha.solis.q@gmail.com
 *   TURNSTILE_SECRET  secreto. Clave secreta del widget de Turnstile
 *
 * La clave de Resend nunca sale de aquí: el navegador no la ve en ningún
 * momento, que es justo el motivo de que esto sea una función y no una llamada
 * directa desde la página.
 */

const LIMITES = { nombre: 80, correo: 120, mensaje: 2000 };
const CUERPO_MAXIMO = 8192; // bytes; por encima de esto ni se parsea
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Limitador de mejor esfuerzo. Cada isolate tiene su propio mapa y hay muchos
 * isolates, así que esto frena a un bot torpe pero no es una garantía: quien de
 * verdad protege el cupo de 100 correos al día es Turnstile. */
const golpes = new Map();
const VENTANA = 10 * 60 * 1000;
const MAXIMO_POR_VENTANA = 5;

function limitado(ip) {
  const ahora = Date.now();
  const registro = golpes.get(ip);
  if (!registro || ahora - registro.desde > VENTANA) {
    golpes.set(ip, { desde: ahora, cuenta: 1 });
    return false;
  }
  registro.cuenta += 1;
  if (golpes.size > 500) {
    golpes.clear();
  }
  return registro.cuenta > MAXIMO_POR_VENTANA;
}

function json(cuerpo, estado) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function texto(valor, maximo) {
  return String(valor === null || valor === undefined ? "" : valor)
    .trim()
    .slice(0, maximo);
}

/* El formulario solo debe poder enviarse desde el propio sitio. */
function mismoOrigen(request) {
  const cabecera = request.headers.get("Origin") || request.headers.get("Referer");
  if (!cabecera) {
    return false;
  }
  try {
    return new URL(cabecera).host === new URL(request.url).host;
  } catch (error) {
    return false;
  }
}

export async function onRequestPost(contexto) {
  const { request, env } = contexto;

  if (!mismoOrigen(request)) {
    return json({ ok: false, codigo: "origen" }, 403);
  }

  const tipo = request.headers.get("Content-Type") || "";
  if (tipo.indexOf("application/json") < 0) {
    return json({ ok: false, codigo: "formato" }, 415);
  }

  /* El Content-Length es la salida barata, pero una petición enviada por trozos
     no lo trae: el tope de verdad se aplica sobre el texto ya leído. */
  const declarado = Number(request.headers.get("Content-Length") || 0);
  if (declarado > CUERPO_MAXIMO) {
    return json({ ok: false, codigo: "formato" }, 413);
  }

  let crudo;
  try {
    crudo = await request.text();
  } catch (error) {
    return json({ ok: false, codigo: "formato" }, 400);
  }
  if (crudo.length > CUERPO_MAXIMO) {
    return json({ ok: false, codigo: "formato" }, 413);
  }

  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch (error) {
    return json({ ok: false, codigo: "formato" }, 400);
  }

  /* Trampa: si viene rellena es un bot. Se responde que todo fue bien para no
   * darle la pista de que se le ha visto. */
  if (texto(datos.web, 200)) {
    return json({ ok: true }, 200);
  }

  const nombre = texto(datos.nombre, LIMITES.nombre);
  const correo = texto(datos.correo, LIMITES.correo);
  const mensaje = texto(datos.mensaje, LIMITES.mensaje);
  const token = texto(datos.token, 4000);

  if (!nombre || !correo || mensaje.length < 10) {
    return json({ ok: false, codigo: "campos" }, 400);
  }
  if (!CORREO.test(correo)) {
    return json({ ok: false, codigo: "correo" }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "desconocida";
  if (limitado(ip)) {
    return json({ ok: false, codigo: "limite" }, 429);
  }

  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET || !env.CONTACT_FROM || !env.CONTACT_TO) {
    return json({ ok: false, codigo: "sinconfigurar" }, 503);
  }

  if (!token) {
    return json({ ok: false, codigo: "turnstile" }, 400);
  }

  try {
    const verificacion = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: token,
          remoteip: ip === "desconocida" ? undefined : ip,
        }),
      }
    );
    const resultado = await verificacion.json();
    if (!resultado || !resultado.success) {
      return json({ ok: false, codigo: "turnstile" }, 400);
    }
  } catch (error) {
    return json({ ok: false, codigo: "turnstile" }, 502);
  }

  try {
    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: correo,
        subject: "Contacto desde el CV: " + nombre,
        text:
          "Nombre: " + nombre + "\n" +
          "Correo: " + correo + "\n\n" +
          mensaje + "\n",
      }),
    });

    if (!envio.ok) {
      /* El detalle se queda en los registros de Cloudflare, no en la respuesta:
       * un error de Resend puede llevar direcciones o partes de la clave. */
      console.error("Resend respondió", envio.status, await envio.text());
      return json({ ok: false, codigo: "envio" }, 502);
    }
  } catch (error) {
    console.error("Fallo al llamar a Resend", error);
    return json({ ok: false, codigo: "envio" }, 502);
  }

  return json({ ok: true }, 200);
}

export async function onRequest(contexto) {
  if (contexto.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "POST" } });
  }
  return json({ ok: false, codigo: "metodo" }, 405);
}
