/*
 * Campo ASCII de fondo.
 *
 * Rejilla de caracteres sobre ruido de valor determinista, repartida por
 * percentil para que cubra todo el viewport y no se concentre en el centro.
 *
 * Dos zonas: en la columna de contenido el alfa está topado para que el texto
 * terciario no baje de 4,5:1 sobre el glifo más claro; en los márgenes, donde
 * no hay nada encima, sube y se permite la rampa completa de caracteres.
 *
 * El puntero levanta un campo de calor que se enfría solo, así que la estela
 * se anima mientras hay algo vivo y se detiene por completo en reposo. Con
 * `prefers-reduced-motion` el foco es directo, sin estela ni bucle.
 *
 * Sin dependencias. Se dibuja en <canvas> para repintar solo las celdas que
 * cambian en lugar de rehacer la rejilla entera.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("ascii-field");
  if (!canvas || !canvas.getContext) {
    return;
  }

  var ctx = canvas.getContext("2d");

  var RAMP = " .:-=+*#%@"; // 10 niveles, solo ASCII
  var QUIET_RAMP = 5; // en la columna de contenido la rampa llega hasta '+'
  var LEVELS = 6; // niveles de opacidad
  var ZONE_BUCKETS = 7; // escalones de mezcla entre las dos zonas
  var MAX_CELLS = 42000;
  var INK_FLOOR = 0.26; // intensidad mínima: ningún rincón se queda sin tinta
  var INK_MAX = 0.92; // fracción de celdas entintadas en la zona más densa

  /* Matriz de Bayer 8x8: tramado ordenado. La fracción de celdas entintadas en
     cualquier zona es exactamente la intensidad media de esa zona, así que el
     reparto es uniforme por construcción en lugar de depender de dónde caigan
     las manchas del ruido. */
  var BAYER = new Float32Array(64);

  var FOCUS_PX = 170; // radio del foco del puntero
  var EDGE_FADE = 80; // px de transición entre columna y margen
  var HEAT_DECAY = 0.95; // por tic; media vida de unos 450 ms
  var HEAT_EPSILON = 0.02;
  var TICK_MS = 33; // 30 fps bastan para un resplandor

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  var heatEnabled = !reduceMotion;

  var cols = 0;
  var rows = 0;
  var cellW = 11;
  var cellH = 16;
  var offX = 0;
  var focusCells = 15;

  var base = null; // Float32Array: intensidad de fondo ya normalizada
  var heat = null; // Float32Array: calor del puntero por celda
  var hotFlags = null;
  var dirtyFlags = null;
  var hot = [];
  var dirty = [];
  var colBucket = null;
  var colMaxIdx = null;
  var styles = null;

  var rgb = "127, 166, 206";
  var maxAlpha = 0.22;
  var marginMax = 0.6;
  var fontSize = 11;
  var fontStack = 'ui-monospace, "SFMono-Regular", Menlo, monospace';

  var pointerCol = -1e6;
  var pointerRow = -1e6;
  var lastCol = -1e6;
  var lastRow = -1e6;
  var frame = 0;
  var pending = false;
  var lastTick = 0;

  /* ----------------------------------------------------------- arranque de
     la matriz de tramado */

  (function initBayer() {
    var m = [
      0, 32, 8, 40, 2, 34, 10, 42,
      48, 16, 56, 24, 50, 18, 58, 26,
      12, 44, 4, 36, 14, 46, 6, 38,
      60, 28, 52, 20, 62, 30, 54, 22,
      3, 35, 11, 43, 1, 33, 9, 41,
      51, 19, 59, 27, 49, 17, 57, 25,
      15, 47, 7, 39, 13, 45, 5, 37,
      63, 31, 55, 23, 61, 29, 53, 21
    ];
    for (var i = 0; i < 64; i++) {
      BAYER[i] = (m[i] + 0.5) / 64;
    }
  })();

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
    return v / 0.875;
  }

  /* ------------------------------------------------------------ geometría */

  function smoothstep(t) {
    if (t <= 0) {
      return 0;
    }
    if (t >= 1) {
      return 1;
    }
    return t * t * (3 - 2 * t);
  }

  function measureCell() {
    ctx.font = fontSize + "px " + fontStack;
    ctx.textBaseline = "top";
    // El glifo ocupa menos que la celda: el margen es lo que convierte la
    // rejilla en textura de fondo en lugar de un muro de caracteres.
    return Math.max(6, Math.ceil(ctx.measureText("M").width) + 4);
  }

  function buildGrid() {
    var w = document.documentElement.clientWidth;
    var h = document.documentElement.clientHeight;

    ctx.font = fontSize + "px " + fontStack;
    ctx.textBaseline = "top";
    cellW = measureCell();
    cellH = Math.round(fontSize * 1.45);
    focusCells = Math.max(6, Math.round(FOCUS_PX / cellW));

    cols = Math.ceil(w / cellW);
    rows = Math.ceil(h / cellH);

    var total = cols * rows;
    if (total > MAX_CELLS) {
      var factor = Math.sqrt(total / MAX_CELLS);
      cellW = Math.ceil(cellW * factor);
      cellH = Math.round(cellH * factor);
      focusCells = Math.max(6, Math.round(FOCUS_PX / cellW));
      cols = Math.ceil(w / cellW);
      rows = Math.ceil(h / cellH);
    }

    offX = Math.round((w - cols * cellW) / 2);
    base = new Float32Array(cols * rows);
    heat = new Float32Array(cols * rows);
    hotFlags = new Uint8Array(cols * rows);
    dirtyFlags = new Uint8Array(cols * rows);
    hot.length = 0;
    dirty.length = 0;

    /* Zonas: la columna de contenido se lee del propio contenedor, así que si
       cambia el ancho máximo de la página el campo se ajusta solo. */
    var left = -1;
    var right = -1;
    var wrap = document.querySelector(".wrap");
    if (wrap) {
      var rect = wrap.getBoundingClientRect();
      left = rect.left;
      right = rect.right;
    }

    colBucket = new Uint8Array(cols);
    colMaxIdx = new Float32Array(cols);

    var c;
    var r;
    for (c = 0; c < cols; c++) {
      var x = offX + c * cellW + cellW / 2;
      var zone = 0;
      if (left >= 0) {
        zone = Math.max(
          smoothstep((left - x) / EDGE_FADE),
          smoothstep((x - right) / EDGE_FADE)
        );
      }
      colBucket[c] = Math.round(zone * (ZONE_BUCKETS - 1));
      colMaxIdx[c] = QUIET_RAMP + zone * (RAMP.length - 1 - QUIET_RAMP);
    }

    /* Tramado ordenado. Un percentil global garantizaba el reparto total de
       tinta pero no el local: una mancha grande y oscura dejaba un tercio
       entero de la pantalla limpio. Con Bayer, la densidad sigue dibujando las
       nubes y el suelo de intensidad garantiza que no haya huecos. */
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var raw = fbm(c * 0.13, r * 0.19);
        var v = (raw - 0.36) / 0.3;
        v = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
        v = INK_FLOOR + (1 - INK_FLOOR) * v;
        var index = r * cols + c;
        base[index] =
          v * INK_MAX > BAYER[(r & 7) * 8 + (c & 7)] ? v : 0;
      }
    }

    lastCol = -1e6;
    lastRow = -1e6;
  }

  /* ------------------------------------------------------------- pintado */

  function intensityAt(index) {
    var t = base[index];
    if (heatEnabled) {
      t += heat[index];
    } else if (pointerCol > -1e5) {
      var c = index % cols;
      var r = (index / cols) | 0;
      var dx = (c - pointerCol) * cellW;
      var dy = (r - pointerRow) * cellH;
      var d2 = dx * dx + dy * dy;
      var radius = focusCells * cellW;
      if (d2 < radius * radius) {
        var f = 1 - Math.sqrt(d2) / radius;
        t += f * f * (3 - 2 * f) * 0.8;
      }
    }
    return t > 1 ? 1 : t;
  }

  function drawCell(index) {
    var t = intensityAt(index);
    if (t <= 0) {
      return;
    }

    var level = Math.min(LEVELS - 1, Math.floor(t * LEVELS));
    if (level < 1) {
      return;
    }

    var c = index % cols;
    var r = (index / cols) | 0;
    var maxIdx = colMaxIdx[c];
    var charIdx = Math.round(t * maxIdx);
    var ch = RAMP.charAt(charIdx > maxIdx ? (maxIdx | 0) : charIdx);
    if (ch === " ") {
      return;
    }

    ctx.fillStyle = styles[colBucket[c]][level];
    ctx.fillText(ch, offX + c * cellW, r * cellH);
  }

  function paintAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var total = cols * rows;
    for (var i = 0; i < total; i++) {
      if (base[i] > 0 || heat[i] > 0) {
        drawCell(i);
      }
    }
  }

  function flushDirty() {
    for (var k = 0; k < dirty.length; k++) {
      var i = dirty[k];
      var c = i % cols;
      var r = (i / cols) | 0;
      // Cada glifo vive dentro de su celda, así que borrar celda a celda no
      // recorta los caracteres vecinos.
      ctx.clearRect(offX + c * cellW, r * cellH, cellW, cellH);
      drawCell(i);
      dirtyFlags[i] = 0;
    }
    dirty.length = 0;
  }

  function markDirty(i) {
    if (!dirtyFlags[i]) {
      dirtyFlags[i] = 1;
      dirty.push(i);
    }
  }

  /* --------------------------------------------------------------- calor */

  function addHeat(col, row) {
    var radius = focusCells * cellW;
    var r0 = Math.max(0, row - focusCells);
    var r1 = Math.min(rows - 1, row + focusCells);
    var c0 = Math.max(0, col - focusCells);
    var c1 = Math.min(cols - 1, col + focusCells);

    for (var r = r0; r <= r1; r++) {
      var dy = (r - row) * cellH;
      for (var c = c0; c <= c1; c++) {
        var dx = (c - col) * cellW;
        var d2 = dx * dx + dy * dy;
        if (d2 >= radius * radius) {
          continue;
        }
        var f = 1 - Math.sqrt(d2) / radius;
        var i = r * cols + c;
        var next = heat[i] + f * f * (3 - 2 * f) * 0.9;
        heat[i] = next > 1 ? 1 : next;
        if (!hotFlags[i]) {
          hotFlags[i] = 1;
          hot.push(i);
        }
      }
    }
  }

  function tick(now) {
    frame = 0;

    if (now - lastTick < TICK_MS) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    lastTick = now;

    for (var k = hot.length - 1; k >= 0; k--) {
      var i = hot[k];
      heat[i] *= HEAT_DECAY;
      if (heat[i] < HEAT_EPSILON) {
        heat[i] = 0;
        hotFlags[i] = 0;
        hot.splice(k, 1);
      }
      markDirty(i);
    }

    flushDirty();

    if (hot.length) {
      frame = window.requestAnimationFrame(tick);
    }
  }

  function wake() {
    if (frame) {
      return;
    }
    lastTick = 0;
    frame = window.requestAnimationFrame(tick);
  }

  /* -------------------------------------------------- foco sin movimiento */

  function queueStaticFocus() {
    if (pending) {
      return;
    }
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;

      if (lastCol < -1e5) {
        lastCol = pointerCol;
        lastRow = pointerRow;
      }
      if (pointerCol === lastCol && pointerRow === lastRow) {
        return;
      }

      var c0 = Math.min(pointerCol, lastCol) - focusCells - 1;
      var c1 = Math.max(pointerCol, lastCol) + focusCells + 1;
      var r0 = Math.min(pointerRow, lastRow) - focusCells - 1;
      var r1 = Math.max(pointerRow, lastRow) + focusCells + 1;

      if ((c1 - c0) * (r1 - r0) > 9000) {
        lastCol = pointerCol;
        lastRow = pointerRow;
        paintAll();
        return;
      }

      var r;
      var c;
      for (r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
        for (c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
          ctx.clearRect(offX + c * cellW, r * cellH, cellW, cellH);
          drawCell(r * cols + c);
        }
      }

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

    var margin = parseFloat(cs.getPropertyValue("--ascii-margin-max"));
    if (!isNaN(margin) && margin > 0) {
      marginMax = margin;
    }

    var size = parseFloat(cs.getPropertyValue("--ascii-font-size"));
    if (!isNaN(size) && size >= 8) {
      fontSize = Math.round(size);
    }

    var font = cs.getPropertyValue("--font-display").trim();
    if (font) {
      fontStack = font;
    }

    styles = [];
    for (var b = 0; b < ZONE_BUCKETS; b++) {
      var ceiling = maxAlpha + (marginMax - maxAlpha) * (b / (ZONE_BUCKETS - 1));
      var row = [""];
      for (var l = 1; l < LEVELS; l++) {
        var a = ceiling * (l / (LEVELS - 1));
        row[l] = "rgba(" + rgb + ", " + a.toFixed(3) + ")";
      }
      styles[b] = row;
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
      var col = Math.floor((event.clientX - offX) / cellW);
      var row = Math.floor(event.clientY / cellH);

      if (heatEnabled) {
        if (col === pointerCol && row === pointerRow) {
          return;
        }
        pointerCol = col;
        pointerRow = row;
        addHeat(col, row);
        wake();
      } else {
        pointerCol = col;
        pointerRow = row;
        queueStaticFocus();
      }
    },
    { passive: true }
  );

  window.addEventListener("pointerleave", function () {
    pointerCol = -1e6;
    pointerRow = -1e6;
    if (heatEnabled) {
      // El calor se apaga solo; no hay nada que forzar aquí.
      return;
    }
    queueStaticFocus();
  });

  document.addEventListener("themechange", function () {
    readTheme();
    paintAll();
  });

  /* ------------------------------------------------------------- arranque */

  readTheme();
  resize();

  // La primera medida puede caer en la fuente de reserva. Al terminar de
  // cargar la pixel font hay que rehacer la rejilla o queda desalineada.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      readTheme();
      resize();
    });
  }
})();
