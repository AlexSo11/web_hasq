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

  var enContacto = false;
  var etapaActual = "";
  var refrescarEscenario = null;

  function fijarEtapa(nueva) {
    if (etapaActual === nueva) {
      return;
    }
    etapaActual = nueva;
    root.setAttribute("data-stage", nueva);
    document.dispatchEvent(
      new CustomEvent("stagechange", { detail: { stage: nueva } })
    );
  }

  (function escenario() {
    if (!canvas && !terminalLag) {
      return;
    }

    var SUAVIZADO = 0.18;
    var UMBRAL = { ascii: 0.002, lag: 0.5, tilt: 0.002 };
    var actual = { ascii: 0, lag: 0, tilt: 0 };
    var objetivo = { ascii: 0, lag: 0, tilt: 0 };
    var aplicado = { ascii: -1, lag: -1, tilt: -1 };
    var corriendo = false;
    var topeLag = 0;
    var inicioRango = 0;
    var finRango = 0;

    function rampa(x, desde, hasta) {
      if (hasta <= desde) {
        return 0;
      }
      if (x <= desde) {
        return 0;
      }
      if (x >= hasta) {
        return 1;
      }
      return (x - desde) / (hasta - desde);
    }

    /* Los topes se miden, no se escriben a mano: así un cambio de tipografía,
       de ancho de ventana o de contenido no deja el terminal a medio camino. */
    function medir() {
      if (terminalLag) {
        var perfil = document.getElementById("perfil");
        if (perfil) {
          var cajaTerminal = terminalLag.getBoundingClientRect();
          var yTerminal = cajaTerminal.top + window.scrollY;
          var cajaPerfil = perfil.getBoundingClientRect();
          var yPerfil = cajaPerfil.top + window.scrollY;
          topeLag = Math.max(0, yPerfil - yTerminal - 16);
        }
      }

      var stack = document.getElementById("stack");
      var experiencia = document.getElementById("experiencia");
      if (stack && experiencia) {
        var cajaStack = stack.getBoundingClientRect();
        inicioRango = cajaStack.top + window.scrollY;
        var cajaExp = experiencia.getBoundingClientRect();
        finRango = cajaExp.top + window.scrollY + cajaExp.height;
      }
    }

    function calcular() {
      var y = window.scrollY || window.pageYOffset || 0;
      var altoHero = hero ? hero.offsetHeight : window.innerHeight;
      var recorrido = Math.max(1, altoHero * 0.9);

      objetivo.ascii = Math.min(1, Math.max(0, y / recorrido));

      /* El terminal baja más despacio que la página y se detiene al llegar a
         Perfil. A partir de ahí se queda donde está, así que Stack y
         Experiencia lo dejan atrás. */
      objetivo.lag = topeLag * objetivo.ascii;

      var centro = y + window.innerHeight * 0.5;
      var tramo = finRango - inicioRango;
      var borde = tramo * 0.2;
      objetivo.tilt =
        tramo > 0
          ? Math.min(
              rampa(centro, inicioRango, inicioRango + borde),
              1 - rampa(centro, finRango - borde, finRango)
            )
          : 0;

      fijarEtapa(
        enContacto ? "contacto" : objetivo.ascii < 0.75 ? "hero" : "lectura"
      );
    }

    function aplicar() {
      if (canvas) {
        if (movimientoReducido) {
          if (aplicado.ascii !== 1) {
            canvas.style.opacity = "1";
            aplicado.ascii = 1;
          }
        } else if (Math.abs(actual.ascii - aplicado.ascii) > UMBRAL.ascii) {
          canvas.style.opacity = String(actual.ascii.toFixed(3));
          aplicado.ascii = actual.ascii;
        }

        var quiereTilt = !movimientoReducido && actual.tilt > 0.002;
        var tieneTilt = aplicado.tilt > 0;
        if (quiereTilt) {
          if (Math.abs(actual.tilt - aplicado.tilt) > UMBRAL.tilt) {
            canvas.style.transform =
              "perspective(900px) rotateX(" +
              (actual.tilt * 24).toFixed(2) +
              "deg) scale(" +
              (1 + actual.tilt * 0.22).toFixed(3) +
              ")";
            aplicado.tilt = actual.tilt;
          }
        } else if (tieneTilt) {
          canvas.style.transform = "";
          aplicado.tilt = 0;
        }
      }

      if (terminalLag) {
        var quiereLag = !movimientoReducido && actual.lag > 0.5;
        if (quiereLag) {
          if (Math.abs(actual.lag - aplicado.lag) > UMBRAL.lag) {
            terminalLag.style.transform =
              "translate3d(0, " + actual.lag.toFixed(1) + "px, 0)";
            aplicado.lag = actual.lag;
          }
        } else if (aplicado.lag !== 0) {
          terminalLag.style.transform = "";
          aplicado.lag = 0;
        }
      }
    }

    /* Suavizado: el scroll marca el objetivo y el valor real lo persigue. Sin
       esto el paralaje se ve a tirones cuando la rueda avanza a saltos. */
    function animar() {
      var sigue = false;
      var claves = ["ascii", "lag", "tilt"];
      for (var i = 0; i < claves.length; i++) {
        var clave = claves[i];
        var diferencia = objetivo[clave] - actual[clave];
        if (Math.abs(diferencia) > UMBRAL[clave]) {
          sigue = true;
        }
        actual[clave] += diferencia * SUAVIZADO;
      }
      aplicar();
      corriendo = sigue;
      if (sigue) {
        window.requestAnimationFrame(animar);
      }
    }

    function alScroll() {
      calcular();
      if (!corriendo) {
        corriendo = true;
        window.requestAnimationFrame(animar);
      }
    }

    function reiniciar() {
      medir();
      calcular();
      actual.ascii = objetivo.ascii;
      actual.lag = objetivo.lag;
      actual.tilt = objetivo.tilt;
      aplicado.ascii = -1;
      aplicado.lag = -1;
      aplicado.tilt = -1;
      aplicar();
    }

    var temporizador = 0;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(temporizador);
        temporizador = window.setTimeout(reiniciar, 160);
      },
      { passive: true }
    );

    window.addEventListener("scroll", alScroll, { passive: true });

    refrescarEscenario = alScroll;
    reiniciar();

    // Con la fuente de píxeles cargada el hero cambia de alto: hay que volver a
    // medir o el tope del parallaje se queda corto.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(reiniciar);
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
        var y = (ultimoY / window.innerHeight - 0.5) * 2;
        terminal.style.setProperty("--pt-y", (x * 3).toFixed(2) + "deg");
        terminal.style.setProperty("--pt-x", (-y * 3).toFixed(2) + "deg");
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

  /* El contacto decide la etapa: mientras está en el centro de la pantalla, el
     fondo cambia de modo. */
  if (contacto && "IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entradas) {
        enContacto = entradas[0].isIntersecting;
        if (refrescarEscenario) {
          refrescarEscenario();
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    ).observe(contacto);
  }

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
