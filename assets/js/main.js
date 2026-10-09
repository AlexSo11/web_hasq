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
})();
