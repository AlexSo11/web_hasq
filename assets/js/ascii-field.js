/*
 * Campo ASCII de fondo.
 *
 * Rejilla de caracteres sobre ruido de valor determinista. El puntero ilumina
 * una vecindad; no hay animación autónoma, así que el coste es cero mientras
 * nadie mueve el ratón.
 *
 * Sin dependencias. Se dibuja en <canvas> para poder repintar solo la zona
 * afectada por el puntero en lugar de rehacer la rejilla completa.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("ascii-field");
  if (!canvas || !canvas.getContext) {
    return;
  }

  var ctx = canvas.getContext("2d");

  var RAMP = " .:-=+*#%@"; // 10 niveles, solo ASCII
  var LEVELS = 6; // niveles de opacidad
  var FONT_SIZE = 14;
  var FOCUS_CELLS = 9; // radio del foco del puntero, en celdas
  var MAX_CELLS = 42000;
  var MIN_INTENSITY = 0.07; // por debajo, la celda queda vacía

  var mono =
    'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';

  var cols = 0;
  var rows = 0;
  var cellW = 13;
  var cellH = 19;
  var offX = 0;
  var base = null; // Float32Array con la intensidad de fondo
  var styles = []; // fillStyle cacheado por nivel

  var rgb = "240, 180, 41";
  var maxAlpha = 0.16;

  var pointerCol = -1e6;
  var pointerRow = -1e6;
  var lastCol = -1e6;
  var lastRow = -1e6;
  var frame = 0;

  /* ---------------------------------------------------------------- ruido */

  function hash2(ix, iy) {
    // Math.imul, no `*`: el producto de dos enteros de 32 bits supera 2^53 y
    // con multiplicación normal el resultado pierde precisión y el ruido se
    // queda sesgado hacia abajo (el campo salía prácticamente vacío).
    var h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function valueNoise(x, y) {
    var ix = Math.floor(x);
    var iy = Math.floor(y);
    var fx = x - ix;
    var fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx);
    var uy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy);
    var b = hash2(ix + 1, iy);
    var c = hash2(ix, iy + 1);
    var d = hash2(ix + 1, iy + 1);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
  }

  function fbm(x, y) {
    var v = 0;
    var amp = 0.5;
    var f = 1;
    for (var o = 0; o < 3; o++) {
      v += amp * valueNoise(x * f, y * f);
      f *= 2.07;
      amp *= 0.5;
    }
    return v / 0.875; // normalizado a 0..1
  }

  /* ------------------------------------------------------------ geometría */

  function measureCell() {
    ctx.font = FONT_SIZE + "px " + mono;
    ctx.textBaseline = "top";
    // El glifo ocupa menos que la celda: el margen es lo que convierte la
    // rejilla en textura de fondo en lugar de un muro de caracteres.
    return Math.max(6, Math.ceil(ctx.measureText("M").width) + 4);
  }

  function buildGrid() {
    var w = document.documentElement.clientWidth;
    var h = document.documentElement.clientHeight;

    cellW = measureCell();
    cellH = Math.round(FONT_SIZE * 1.35);

    cols = Math.ceil(w / cellW);
    rows = Math.ceil(h / cellH);

    var total = cols * rows;
    if (total > MAX_CELLS) {
      var factor = Math.sqrt(total / MAX_CELLS);
      cellW = Math.ceil(cellW * factor);
      cellH = Math.round(cellH * factor);
      cols = Math.ceil(w / cellW);
      rows = Math.ceil(h / cellH);
    }

    offX = Math.round((w - cols * cellW) / 2);
    base = new Float32Array(cols * rows);

    var c;
    var r;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        // El ruido se concentra alrededor de 0.5, así que se estira y se le
        // aplica un suavizado: sin esto casi todas las celdas caen en el nivel
        // de opacidad más bajo y el campo no se ve.
        var v = (fbm(c * 0.06, r * 0.11) - 0.47) / 0.28;
        if (v <= 0) {
          base[r * cols + c] = 0;
        } else {
          if (v > 1) {
            v = 1;
          }
          base[r * cols + c] = v * v * (3 - 2 * v);
        }
      }
    }

    lastCol = -1e6;
    lastRow = -1e6;
  }

  /* ------------------------------------------------------------- pintado */

  function intensityAt(index, c, r) {
    var t = base[index];

    if (pointerCol > -1e5) {
      var dx = (c - pointerCol) * cellW;
      var dy = (r - pointerRow) * cellH;
      var d = Math.sqrt(dx * dx + dy * dy);
      var radius = FOCUS_CELLS * cellW;
      if (d < radius) {
        var f = 1 - d / radius;
        t += f * f * 0.8;
      }
    }

    return t > 1 ? 1 : t;
  }

  function drawCell(c, r) {
    var index = r * cols + c;
    var t = intensityAt(index, c, r);
    if (t < MIN_INTENSITY) {
      return;
    }

    var charIndex = Math.floor(t * (RAMP.length - 1));
    var ch = RAMP.charAt(charIndex);
    if (ch === " ") {
      return;
    }

    var level = Math.min(LEVELS - 1, Math.floor(t * LEVELS));
    if (level < 1) {
      return;
    }

    ctx.fillStyle = styles[level];
    ctx.fillText(ch, offX + c * cellW, r * cellH);
  }

  function paint(c0, r0, c1, r1, clear) {
    c0 = Math.max(0, c0);
    r0 = Math.max(0, r0);
    c1 = Math.min(cols - 1, c1);
    r1 = Math.min(rows - 1, r1);
    if (c1 < c0 || r1 < r0) {
      return;
    }

    if (clear) {
      // Rectángulo exacto: cada glifo vive dentro de su celda, así que ampliar
      // el borrado recortaría los caracteres de las celdas vecinas.
      ctx.clearRect(
        offX + c0 * cellW,
        r0 * cellH,
        (c1 - c0 + 1) * cellW,
        (r1 - r0 + 1) * cellH
      );
    }

    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        drawCell(c, r);
      }
    }
  }

  function paintAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(0, 0, cols - 1, rows - 1, false);
  }

  /* ---------------------------------------------------------------- foco */

  function queuePointer() {
    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(function () {
      frame = 0;

      if (lastCol < -1e5) {
        lastCol = pointerCol;
        lastRow = pointerRow;
      }

      if (pointerCol === lastCol && pointerRow === lastRow) {
        return;
      }

      var c0 = Math.min(pointerCol, lastCol) - FOCUS_CELLS - 1;
      var c1 = Math.max(pointerCol, lastCol) + FOCUS_CELLS + 1;
      var r0 = Math.min(pointerRow, lastRow) - FOCUS_CELLS - 1;
      var r1 = Math.max(pointerRow, lastRow) + FOCUS_CELLS + 1;

      // Con un salto grande el rectángulo deja de compensar: rehacer todo.
      if ((c1 - c0) * (r1 - r0) > 9000) {
        lastCol = pointerCol;
        lastRow = pointerRow;
        paintAll();
        return;
      }

      paint(c0, r0, c1, r1, true);
      lastCol = pointerCol;
      lastRow = pointerRow;
    });
  }

  /* -------------------------------------------------------------- tamaño */

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    // clientWidth/Height: el ancho visible. innerWidth incluye la barra de
    // desplazamiento y dejaba el lienzo más ancho que la ventana.
    var w = document.documentElement.clientWidth;
    var h = document.documentElement.clientHeight;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildGrid();
    paintAll();
  }

  /* ----------------------------------------------------------------- tema */

  function readTheme() {
    var cs = window.getComputedStyle(document.documentElement);
    var value = cs.getPropertyValue("--ascii-rgb").trim();
    if (value) {
      rgb = value;
    }
    var alpha = parseFloat(cs.getPropertyValue("--ascii-max"));
    if (!isNaN(alpha) && alpha > 0) {
      maxAlpha = alpha;
    }
    styles = [""];
    for (var i = 1; i < LEVELS; i++) {
      var a = maxAlpha * (i / (LEVELS - 1));
      styles[i] = "rgba(" + rgb + ", " + a.toFixed(3) + ")";
    }
  }

  /* -------------------------------------------------------------- eventos */

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 160);
  });

  window.addEventListener(
    "pointermove",
    function (event) {
      pointerCol = Math.floor((event.clientX - offX) / cellW);
      pointerRow = Math.floor(event.clientY / cellH);
      queuePointer();
    },
    { passive: true }
  );

  window.addEventListener("pointerleave", function () {
    pointerCol = -1e6;
    pointerRow = -1e6;
    queuePointer();
  });

  document.addEventListener("themechange", function () {
    readTheme();
    paintAll();
  });

  /* ------------------------------------------------------------- arranque */

  readTheme();
  resize();
})();
