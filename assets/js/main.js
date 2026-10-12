/*
 * Comportamiento del sitio: tema claro/oscuro, entradas por scroll, sección
 * activa en la nav, copiar el correo y año del pie.
 *
 * Sin dependencias. Todo degrada bien sin JavaScript: el tema arranca desde
 * `prefers-color-scheme` con el script en línea del <head> y el resto de la
 * página es HTML navegable.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var STORE = "hasq-theme";
  var STAGGER = 60; // ms entre elementos de un mismo grupo
  var toggle = document.getElementById("theme-toggle");

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function syncToggle(theme) {
    if (!toggle) {
      return;
    }
    toggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    toggle.setAttribute("aria-label", toggle.getAttribute("data-label-" + theme) || "");
    toggle.setAttribute("title", toggle.getAttribute("data-label-" + theme) || "");
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(STORE, next);
      } catch (error) {
        /* modo privado: el tema simplemente no se recuerda */
      }
      syncToggle(next);

      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute("content", next === "light" ? "#edf0f5" : "#141414");
      }

      document.dispatchEvent(
        new CustomEvent("themechange", { detail: { theme: next } })
      );
    });

    syncToggle(currentTheme());
  }

  /* ------------------------------------------------ sección activa en la nav */

  var links = Array.prototype.slice.call(
    document.querySelectorAll('.nav a[href^="#"]')
  );

  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (link) {
      byId[link.getAttribute("href").slice(1)] = link;
    });

    var visible = {};

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.id] = entry.isIntersecting;
        });

        var active = null;
        for (var id in byId) {
          if (visible[id]) {
            active = id;
            break;
          }
        }

        links.forEach(function (link) {
          if (active && link === byId[active]) {
            link.setAttribute("aria-current", "true");
          } else {
            link.removeAttribute("aria-current");
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );

    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) {
        observer.observe(section);
      }
    });
  }

  /* -------------------------------------------------------------- entradas */

  /* El script en línea del <head> marca el documento como .js antes del primer
     pintado, así que el CSS puede reservar la posición de lo que va a entrar
     sin que se vea un parpadeo. Si no hay IntersectionObserver no se anima
     nada: se retira la marca y la página aparece entera de golpe. */

  var groups = Array.prototype.slice.call(
    document.querySelectorAll("[data-reveal-group]")
  );

  if (groups.length) {
    if (!("IntersectionObserver" in window)) {
      root.classList.remove("js");
    } else {
      // Red de seguridad: un [data-reveal] que se quede fuera de todo grupo se
      // muestra ya, para que un despiste en el marcado no oculte contenido.
      Array.prototype.forEach.call(
        document.querySelectorAll("[data-reveal]"),
        function (item) {
          if (!item.closest("[data-reveal-group]")) {
            item.classList.add("is-visible");
          }
        }
      );

      var reveal = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }
            var items = entry.target.querySelectorAll("[data-reveal]");
            Array.prototype.forEach.call(items, function (item, index) {
              item.style.setProperty("--reveal-delay", index * STAGGER + "ms");
              item.classList.add("is-visible");
            });
            reveal.unobserve(entry.target);
          });
        },
        { threshold: 0, rootMargin: "0px 0px -10% 0px" }
      );

      groups.forEach(function (group) {
        reveal.observe(group);
      });
    }
  }

  /* ------------------------------------------------------ copiar el correo */

  var copyBtn = document.getElementById("copy-email");
  if (copyBtn) {
    var status = document.getElementById("copy-status");
    var text = copyBtn.getAttribute("data-email") || "";
    var done = copyBtn.getAttribute("data-copied") || "Copiado";
    var failed = copyBtn.getAttribute("data-failed") || "No se pudo copiar";
    var timer = 0;

    var announce = function (message) {
      if (status) {
        status.textContent = message;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        if (status) {
          status.textContent = "";
        }
      }, 3000);
    };

    copyBtn.addEventListener("click", function () {
      var write =
        window.navigator.clipboard && window.navigator.clipboard.writeText
          ? window.navigator.clipboard.writeText(text)
          : Promise.reject(new Error("sin portapapeles"));

      write.then(
        function () {
          copyBtn.classList.add("is-done");
          announce(done);
          window.setTimeout(function () {
            copyBtn.classList.remove("is-done");
          }, 1600);
        },
        function () {
          // Reserva: selecciona el correo para que se pueda copiar a mano.
          var field = document.createElement("textarea");
          field.value = text;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.top = "-1000px";
          document.body.appendChild(field);
          field.select();
          var ok = false;
          try {
            ok = document.execCommand("copy");
          } catch (error) {
            ok = false;
          }
          document.body.removeChild(field);
          announce(ok ? done : failed);
        }
      );
    });
  }

  /* ------------------------------------------------------------ pie de página */

  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
  /* ------------------------------------------------- escenario de scroll */

  /* Un solo oyente de scroll alimenta todo el movimiento de la página. Escribe
     el resultado en los elementos concretos (el canvas, el terminal) y no en
     :root: cambiar una variable en la raíz obliga a recalcular el estilo de
     todo el documento, y esto corre en cada fotograma. */

  var movimientoReducido = false;
  var punteroFino = false;
  try {
    movimientoReducido = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    punteroFino = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch (error) {
    movimientoReducido = false;
    punteroFino = false;
  }

  var canvas = document.getElementById("ascii-field");
  var terminalLag = document.querySelector("[data-terminal]");
  var terminal = terminalLag ? terminalLag.querySelector(".terminal") : null;
  var hero = document.querySelector(".hero");
  var perfil = document.getElementById("perfil");
  var contacto = document.getElementById("contacto");

  /* El tecleo se resuelve con `steps()`, así que necesita saber cuántas letras
     tiene cada línea: los cortes tienen que caer en la rejilla de glifos. */
  Array.prototype.forEach.call(
    document.querySelectorAll(".terminal__body .tl"),
    function (linea, indice) {
      var largo = (linea.textContent || "").length;
      linea.style.setProperty("--chars", String(largo > 0 ? largo : 1));
      linea.style.setProperty("--i", String(indice));
    }
  );

  var etapaActual = "";
  var contactoActual = -1;

  function avisarFondo(nuevaEtapa, nuevoContacto) {
    if (
      nuevaEtapa === etapaActual &&
      Math.abs(nuevoContacto - contactoActual) < 0.04
    ) {
      return;
    }
    etapaActual = nuevaEtapa;
    contactoActual = nuevoContacto;
    root.setAttribute("data-stage", nuevaEtapa);
    document.dispatchEvent(
      new CustomEvent("stagechange", {
        detail: { stage: nuevaEtapa, contacto: nuevoContacto },
      })
    );
  }

  (function escenario() {
    if (!canvas && !terminalLag) {
      return;
    }

    var TAU_DERIVA = 0.12; // s: suavizado del empuje del fondo
    var TOPE_DERIVA = 18; // px: cuánto puede adelantarse o quedarse el fondo
    var ACLARADO = 0.35; // cuánto se apaga el fondo al llegar al contacto

    var y = window.scrollY;
    var anteriorY = y;

    var ascii = 0;
    var asciiAplicado = -1;
    var lag = 0;
    var lagAplicado = -999;
    var topeLag = 0;

    var empuje = 0;
    var empujeAplicado = -999;
    var velocidad = 0;

    var progresoContacto = 0;
    var ultimo = 0;
    var corriendo = false;

    function tope() {
      return Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
    }

    /* Los topes se miden, no se escriben a mano. La medición no se ve afectada
       por el movimiento porque el único transform de la página vive en el
       lienzo, que está fuera del flujo. */
    function medir() {
      if (!terminalLag || !perfil) {
        return;
      }
      var cajaTerminal = terminalLag.getBoundingClientRect();
      var yTerminal = cajaTerminal.top + window.scrollY;
      var cajaPerfil = perfil.getBoundingClientRect();
      var yPerfil = cajaPerfil.top + window.scrollY;
      var prosa = perfil.querySelector(".prose");

      if (window.innerWidth >= 960 && prosa) {
        /* En pantalla ancha Perfil reserva la columna derecha, así que el
           terminal aterriza justo a la altura del texto: baja por su carril y
           las palabras no se le echan encima. */
        var yProsa = prosa.getBoundingClientRect().top + window.scrollY;
        topeLag = Math.max(0, yProsa - yTerminal - 20);
      } else {
        /* En una columna no hay carril: se queda dentro de la portada, encima
           de la sección. */
        topeLag = Math.max(0, yPerfil - yTerminal - cajaTerminal.height - 16);
      }
    }

    function calcular() {
      var altoHero = hero ? hero.offsetHeight : window.innerHeight;
      var recorrido = Math.max(1, altoHero * 0.9);
      var entrada = Math.min(1, Math.max(0, y / recorrido));

      if (contacto) {
        var vh = window.innerHeight;
        var caja = contacto.getBoundingClientRect();
        progresoContacto = Math.min(
          1,
          Math.max(0, (vh - caja.top) / (vh * 0.5))
        );
      } else {
        progresoContacto = 0;
      }

      /* El fondo se apaga al llegar al contacto, y lo hace con la opacidad del
         lienzo: cambiarla no cuesta ni un repintado, así que la mezcla es
         continua de verdad y no por escalones. */
      ascii = entrada * (1 - ACLARADO * progresoContacto);
      lag = topeLag * entrada;

      avisarFondo(
        progresoContacto > 0.5 ? "contacto" : entrada < 0.75 ? "hero" : "lectura",
        progresoContacto
      );
    }

    function aplicar(dt, ahora) {
      /* Deriva direccional: al bajar, el fondo se queda atrás y las letras
         caen; al subir, al revés. Depende de la velocidad del scroll, no de su
         posición, así que vuelve sola al sitio en cuanto te detienes. */
      var delta = y - anteriorY;
      anteriorY = y;
      var paso = Math.max(dt, 1 / 240);
      velocidad += (delta / paso - velocidad) * (1 - Math.exp(-dt / 0.09));

      var objetivo = velocidad * 0.012;
      if (objetivo > TOPE_DERIVA) {
        objetivo = TOPE_DERIVA;
      } else if (objetivo < -TOPE_DERIVA) {
        objetivo = -TOPE_DERIVA;
      }

      /* En contacto, además, una respiración lenta para que el campo no se
         quede del todo quieto. */
      if (progresoContacto > 0.01) {
        objetivo += Math.sin(ahora * 0.0004) * 7 * progresoContacto;
      }

      empuje += (objetivo - empuje) * (1 - Math.exp(-dt / TAU_DERIVA));

      if (canvas) {
        if (movimientoReducido) {
          if (asciiAplicado !== 1) {
            canvas.style.opacity = "1";
            asciiAplicado = 1;
          }
        } else if (Math.abs(ascii - asciiAplicado) > 0.002) {
          canvas.style.opacity = String(ascii.toFixed(3));
          asciiAplicado = ascii;
        }

        if (!movimientoReducido && Math.abs(empuje - empujeAplicado) > 0.08) {
          canvas.style.transform =
            "translate3d(0, " + empuje.toFixed(2) + "px, 0)";
          empujeAplicado = empuje;
        }
      }

      if (terminalLag && Math.abs(lag - lagAplicado) > 0.5) {
        terminalLag.style.transform = movimientoReducido
          ? ""
          : "translate3d(0, " + lag.toFixed(1) + "px, 0)";
        lagAplicado = lag;
      }

      return Math.abs(empuje - objetivo) > 0.15 || Math.abs(velocidad) > 4;
    }

    /* Los valores se calculan al ritmo de los eventos de scroll, pero se
       escriben una sola vez por fotograma: así no hay micro-tirones por recibir
       tres eventos seguidos ni un fotograma sin ninguno, y no se añade retardo
       alguno, que es lo que hacía la inercia. */
    function marco(ahora) {
      var dt = ultimo ? Math.min(0.05, (ahora - ultimo) / 1000) : 1 / 60;
      ultimo = ahora;

      var sigue = aplicar(dt, ahora);
      if (sigue || progresoContacto > 0.01) {
        window.requestAnimationFrame(marco);
      } else {
        corriendo = false;
        ultimo = 0;
      }
    }

    function arrancar() {
      if (corriendo) {
        return;
      }
      corriendo = true;
      ultimo = 0;
      window.requestAnimationFrame(marco);
    }

    window.addEventListener(
      "scroll",
      function () {
        y = window.scrollY;
        calcular();
        arrancar();
      },
      { passive: true }
    );

    var temporizador = 0;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(temporizador);
        temporizador = window.setTimeout(function () {
          medir();
          calcular();
          arrancar();
        }, 160);
      },
      { passive: true }
    );

    medir();
    calcular();
    aplicar(1 / 60, 0);

    // Con la fuente de píxeles cargada la portada cambia de alto: hay que
    // volver a medir o el tope del recorrido del terminal se queda corto.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        medir();
        calcular();
        arrancar();
      });
    }

    /* El paralaje del puntero del terminal solo donde hay ratón de verdad: en
       táctil un hover falso movería la caja al tocar. */
    if (terminal && punteroFino && !movimientoReducido) {
      var pendiente = false;
      var ultimoX = 0;
      var ultimoY = 0;

      var pintarPuntero = function () {
        pendiente = false;
        var x = (ultimoX / window.innerWidth - 0.5) * 2;
        var y2 = (ultimoY / window.innerHeight - 0.5) * 2;
        terminal.style.setProperty("--pt-y", (x * 3).toFixed(2) + "deg");
        terminal.style.setProperty("--pt-x", (-y2 * 3).toFixed(2) + "deg");
      };

      window.addEventListener(
        "pointermove",
        function (evento) {
          ultimoX = evento.clientX;
          ultimoY = evento.clientY;
          if (!pendiente) {
            pendiente = true;
            window.requestAnimationFrame(pintarPuntero);
          }
        },
        { passive: true }
      );
    }
  })();

  /* ------------------------------------------------ formulario de contacto */

  var formulario = document.getElementById("contacto-form");

  /* Turnstile se carga solo cuando el contacto está a una pantalla de
     distancia. Así quien no baja hasta aquí no hace ninguna petición a
     terceros, que es lo que el sitio presume de no hacer. */
  if (formulario && contacto && "IntersectionObserver" in window) {
    var cargadoTurnstile = false;
    new IntersectionObserver(
      function (entradas, observador) {
        if (!entradas[0].isIntersecting || cargadoTurnstile) {
          return;
        }
        cargadoTurnstile = true;
        var script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
        observador.disconnect();
      },
      { rootMargin: "100% 0px" }
    ).observe(contacto);
  }

  if (formulario) {
    var botonEnviar = document.getElementById("contacto-enviar");
    var lineaEstado = document.getElementById("contacto-estado");
    var esIngles = (root.getAttribute("lang") || "es").slice(0, 2) === "en";
    /* La función responde con un código, no con texto: así el mensaje sale en
       el idioma de quien está leyendo y no en el del servidor. */
    var MSG = esIngles
      ? {
          faltan: "Fill in your name, email and a message of at least 10 characters.",
          correo: "That email address does not look right.",
          verificando: "One moment, still checking that you are a person.",
          enviando: "Sending",
          ok: "Message sent. Thank you, I will reply soon.",
          error: "It could not be sent. You can write to ha.solis.q@gmail.com.",
          codigos: {
            campos: "Check the fields: something is missing or the message is too short.",
            correo: "That email address does not look right.",
            turnstile: "You could not be verified as a person. Reload and try again.",
            limite: "You have sent several messages in a row. Wait a few minutes.",
            sinconfigurar: "The form is not configured yet. Write to ha.solis.q@gmail.com.",
            envio: "It could not be sent. Write to ha.solis.q@gmail.com.",
          },
        }
      : {
          faltan:
            "Rellena tu nombre, tu correo y un mensaje de al menos 10 caracteres.",
          correo: "Esa dirección de correo no parece correcta.",
          verificando: "Un momento, todavía se está comprobando que eres una persona.",
          enviando: "Enviando",
          ok: "Mensaje enviado. Gracias, te contesto pronto.",
          error: "No se pudo enviar. Puedes escribir a ha.solis.q@gmail.com.",
          codigos: {
            campos: "Revisa los campos: falta algún dato o el mensaje es muy corto.",
            correo: "Esa dirección de correo no parece correcta.",
            turnstile:
              "No se pudo comprobar que eres una persona. Recarga e inténtalo otra vez.",
            limite: "Has enviado varios mensajes seguidos. Espera unos minutos.",
            sinconfigurar:
              "El formulario todavía no está configurado. Escribe a ha.solis.q@gmail.com.",
            envio: "No se pudo enviar. Escribe a ha.solis.q@gmail.com.",
          },
        };

    var decir = function (texto, tipo) {
      if (!lineaEstado) {
        return;
      }
      lineaEstado.textContent = texto;
      if (tipo) {
        lineaEstado.setAttribute("data-estado", tipo);
      } else {
        lineaEstado.removeAttribute("data-estado");
      }
    };

    var enVuelo = false;

    formulario.addEventListener("submit", function (evento) {
      evento.preventDefault();
      if (enVuelo) {
        return;
      }

      var nombre = formulario.elements.nombre.value.trim();
      var correo = formulario.elements.correo.value.trim();
      var mensaje = formulario.elements.mensaje.value.trim();
      var trampa = formulario.elements.web ? formulario.elements.web.value : "";
      var campoToken = formulario.querySelector('[name="cf-turnstile-response"]');
      var token = campoToken ? campoToken.value : "";

      if (!nombre || !correo || mensaje.length < 10) {
        decir(MSG.faltan, "error");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
        decir(MSG.correo, "error");
        return;
      }
      if (!token) {
        decir(MSG.verificando, "error");
        return;
      }

      enVuelo = true;
      if (botonEnviar) {
        botonEnviar.disabled = true;
      }
      decir(MSG.enviando);

      /* Tope de tiempo: si la red se queda colgada, el formulario no se puede
         quedar diciendo «enviando» para siempre. */
      var control = typeof AbortController === "function" ? new AbortController() : null;
      var reloj = window.setTimeout(function () {
        if (control) {
          control.abort();
        }
      }, 15000);

      window
        .fetch("/api/contacto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: nombre,
            correo: correo,
            mensaje: mensaje,
            web: trampa,
            token: token,
          }),
          signal: control ? control.signal : undefined,
        })
        .then(function (respuesta) {
          return respuesta
            .json()
            .catch(function () {
              return {};
            })
            .then(function (datos) {
              return { ok: respuesta.ok, datos: datos };
            });
        })
        .then(function (resultado) {
          if (resultado.ok && resultado.datos && resultado.datos.ok) {
            formulario.reset();
            if (window.turnstile && window.turnstile.reset) {
              window.turnstile.reset();
            }
            decir(MSG.ok, "ok");
            return;
          }
          var codigo = resultado.datos && resultado.datos.codigo;
          decir((codigo && MSG.codigos[codigo]) || MSG.error, "error");
        })
        .catch(function () {
          decir(MSG.error, "error");
        })
        .then(function () {
          window.clearTimeout(reloj);
          enVuelo = false;
          if (botonEnviar) {
            botonEnviar.disabled = false;
          }
        });
    });
  }

  /* ------------------------------------------------- selector de contacto */

  var selector = document.querySelector("[data-selector]");

  if (selector && punteroFino && !movimientoReducido) {
    Array.prototype.forEach.call(
      selector.querySelectorAll(".selector__item"),
      function (tarjeta) {
        tarjeta.addEventListener(
          "pointermove",
          function (evento) {
            var caja = tarjeta.getBoundingClientRect();
            var x = (evento.clientX - caja.left) / caja.width - 0.5;
            var y = (evento.clientY - caja.top) / caja.height - 0.5;
            tarjeta.style.setProperty("--sel-y", (x * 6).toFixed(2) + "deg");
            tarjeta.style.setProperty("--sel-x", (-y * 6).toFixed(2) + "deg");
          },
          { passive: true }
        );

        tarjeta.addEventListener("pointerleave", function () {
          tarjeta.style.removeProperty("--sel-y");
          tarjeta.style.removeProperty("--sel-x");
        });
      }
    );
  }

})();
