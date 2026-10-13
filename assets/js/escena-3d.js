/*
 * Las escenas 3D del sitio.
 *
 * Tres usan Three.js, que se descarga del CDN **solo cuando hace falta** y una
 * sola vez para todas. La cuarta, la esfera de caracteres del contacto, va con
 * proyección propia en canvas 2D: hacerla con Three.js exigiría un atlas de
 * glifos y una textura por carácter, y el sitio ya tiene un motor de caracteres
 * propio del que reutiliza la rampa.
 *
 * Nada de esto es imprescindible: si el CDN no responde, las escenas no
 * aparecen y el resto de la página sigue igual.
 */
(function () {
  "use strict";

  /* Three.js se sirve desde el propio dominio. Antes venía de un CDN y era el
     único motivo por el que las escenas podían no aparecer: un bloqueador, una
     red sin salida o el CDN caído las dejaban en blanco sin decir nada.
     La ruta se resuelve desde este mismo archivo, porque el guion se sirve tanto
     en la raíz como en /en/ y una ruta relativa al documento se rompería en la
     segunda. */
  var propio = document.currentScript ? document.currentScript.src : "";
  var RUTA_THREE = propio
    ? new URL("three/three.module.min.js", propio).href
    : "assets/js/three/three.module.min.js";

  var lienzoGemelo = document.querySelector('[data-escena="gemelo"]');
  var lienzoPetct = document.querySelector('[data-escena="petct"]');
  var lienzoInnova = document.querySelector('[data-escena="innova"]');
  var lienzoContacto = document.querySelector('[data-escena="contacto"]');

  if (!lienzoGemelo && !lienzoPetct && !lienzoInnova && !lienzoContacto) {
    return;
  }

  var movimientoReducido = false;
  try {
    movimientoReducido = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  } catch (error) {
    movimientoReducido = false;
  }

  /* El 3D es cosa de pantallas anchas. En una columna no hay sitio, y el móvil
     no debe pagar la descarga. */
  var haySitio = function () {
    return window.innerWidth >= 1000;
  };

  /* Un fallo del visor ya no se queda en silencio: se marca la figura y se
     cambia el pie por el aviso, que viene del marcado para no duplicar idiomas. */
  function avisarDelFallo(canvas) {
    var figura = canvas.closest ? canvas.closest(".escena-figura") : null;
    if (!figura || figura.hasAttribute("data-error")) {
      return;
    }
    figura.setAttribute("data-error", "");
    var aviso = figura.getAttribute("data-fallo");
    var pie = figura.querySelector("figcaption");
    if (aviso && pie) {
      pie.textContent = aviso;
    }
  }

  function colorDe(nombre) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(nombre)
      .trim();
  }

  function colorAscii() {
    var rgb = colorDe("--ascii-rgb");
    return rgb ? "rgb(" + rgb + ")" : "#7fa6ce";
  }

  /* ------------------------------------------------------- carga diferida */

  var descarga = null;

  function cargarThree() {
    if (!descarga) {
      descarga = import(RUTA_THREE);
    }
    return descarga;
  }

  /* ------------------------------------------------------------ utilidades */

  function ajustar(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ancho = canvas.clientWidth || 1;
    var alto = canvas.clientHeight || 1;
    canvas.width = Math.floor(ancho * dpr);
    canvas.height = Math.floor(alto * dpr);
    return { ancho: ancho, alto: alto, dpr: dpr };
  }

  /* Un solo bucle por escena, que se detiene de verdad al salir de pantalla:
     dejar el requestAnimationFrame girando en vacío gasta batería para nada. */
  function bucle(dibujar) {
    var raf = 0;
    var vivo = false;
    var visible = false;

    function marco(t) {
      if (!vivo) {
        return;
      }
      if (visible && !document.hidden) {
        dibujar(t);
      }
      raf = window.requestAnimationFrame(marco);
    }

    var motor = {
      arrancar: function () {
        if (vivo) {
          return;
        }
        vivo = true;
        raf = window.requestAnimationFrame(marco);
      },
      parar: function () {
        vivo = false;
        window.cancelAnimationFrame(raf);
      },
      visitar: function (valor) {
        visible = valor;
        if (valor) {
          motor.arrancar();
        } else {
          motor.parar();
        }
      },
    };

    return motor;
  }

  function alEntrar(canvas, cuando) {
    if (!("IntersectionObserver" in window)) {
      cuando();
      return;
    }
    var observador = new IntersectionObserver(
      function (entradas) {
        if (entradas[0].isIntersecting) {
          observador.disconnect();
          cuando();
        }
      },
      { rootMargin: "100% 0px" }
    );
    observador.observe(canvas);
  }

  function seguirVisibilidad(canvas, motor) {
    if (!("IntersectionObserver" in window)) {
      return;
    }
    new IntersectionObserver(
      function (entradas) {
        motor.visitar(entradas[0].isIntersecting);
      },
      { threshold: 0 }
    ).observe(canvas);
  }

  /* El ancho se comprueba cuando toca arrancar cada escena, no al cargar el
     guion: un script `defer` corre antes del evento `load`, y en ese momento la
     ventana todavía no tiene su tamaño definitivo, así que `innerWidth` puede
     valer 0 y todas las escenas se descartarían solas. */
  function cuandoHayaSitio(tarea) {
    if (haySitio()) {
      tarea();
      return;
    }
    var alRedimensionar = function () {
      if (haySitio()) {
        window.removeEventListener("resize", alRedimensionar);
        tarea();
      }
    };
    window.addEventListener("resize", alRedimensionar, { passive: true });
  }

  function cuandoSePueda(tarea) {
    var arrancar = function () {
      cuandoHayaSitio(tarea);
    };
    if (document.readyState === "complete") {
      arrancar();
    } else {
      window.addEventListener("load", arrancar, { once: true });
    }
  }

  /* -------------------------------------------------- 1. Terreno del gemelo */

  /* El relieve del gemelo: un campo de altura de procedimiento muestreado como
     nube de puntos, que es como se ve un levantamiento real. El terreno está
     quieto y lo que corre es el agua: no hay ninguna lámina encima, el agua son
     los propios puntos cambiando de color. */

  /* Ruido de valor con interpolación suave: la base del relieve. */
  function ruidoDeValor(x, y) {
    var xi = Math.floor(x);
    var yi = Math.floor(y);
    var xf = x - xi;
    var yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var esquina = function (a, b) {
      var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    var a = esquina(xi, yi);
    var b = esquina(xi + 1, yi);
    var c = esquina(xi, yi + 1);
    var d = esquina(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /* Cuatro octavas: colinas grandes, laderas y detalle, menos un cauce por el
     que correría el agua. */
  function alturaDelTerreno(x, y) {
    var h = 0;
    var amplitud = 1;
    var frecuencia = 1;
    var total = 0;
    for (var o = 0; o < 4; o++) {
      h += ruidoDeValor(x * frecuencia, y * frecuencia) * amplitud;
      total += amplitud;
      amplitud *= 0.5;
      frecuencia *= 2.1;
    }
    h /= total;
    var cauce = Math.exp(-Math.pow((y - 0.22 * Math.sin(x * 1.7)) * 3.4, 2));
    return (h - 0.44) * 0.36 - cauce * 0.075;
  }

  var ANCHO_TERRENO = 2.6;
  var FONDO_TERRENO = 1.6;

  function terreno(canvas, THREE) {
    var escena = new THREE.Scene();
    var camara = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    /* El mundo va con la altura en z, así que «arriba» es z y no y. */
    camara.up.set(0, 0, 1);

    var render = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    });
    render.setClearAlpha(0);

    var total = 26000;
    var posiciones = new Float32Array(total * 3);
    var colores = new Float32Array(total * 3);
    var masBajo = 1e9;
    var masAlto = -1e9;
    var i;

    /* Una rejilla con temblor: así no se ven las filas y parece un muestreo. */
    var lado = Math.ceil(Math.sqrt(total));
    for (i = 0; i < total; i++) {
      var cx = i % lado;
      var cy = (i / lado) | 0;
      var x = (cx / (lado - 1) - 0.5) * ANCHO_TERRENO + (Math.random() - 0.5) * 0.012;
      var y = (cy / (lado - 1) - 0.5) * FONDO_TERRENO + (Math.random() - 0.5) * 0.012;
      var z = alturaDelTerreno(x * 2.1, y * 2.1) + (Math.random() - 0.5) * 0.004;
      posiciones[i * 3] = x;
      posiciones[i * 3 + 1] = y;
      posiciones[i * 3 + 2] = z;
      if (z < masBajo) masBajo = z;
      if (z > masAlto) masAlto = z;
    }

    var geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
    geometria.setAttribute("color", new THREE.BufferAttribute(colores, 3));
    geometria.computeBoundingSphere();

    var rango = Math.max(1e-6, masAlto - masBajo);
    var nivelBase = masBajo + rango * 0.34;

    var material = new THREE.PointsMaterial({
      /* Un poco más grandes que antes porque el lienzo también lo es: si no, la
         misma nube se vería más rala al repartirse sobre más píxeles. */
      size: 0.0105,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
    });

    var puntos = new THREE.Points(geometria, material);
    escena.add(puntos);

    var seco = new THREE.Color(colorDe("--accent") || "#e0b47c");
    var agua = new THREE.Color(colorAscii());

    /* Repinta el agua: los puntos por debajo del nivel toman el color del agua, y
       el borde no es una línea recta sino dos trenes de ondas que viajan, para
       que se lea como corriente y no como un corte. */
    var pintarAgua = function (segundos, nivel) {
      for (var k = 0; k < total; k++) {
        var px = posiciones[k * 3];
        var py = posiciones[k * 3 + 1];
        var pz = posiciones[k * 3 + 2];

        var onda =
          Math.sin(px * 16 + py * 9 - segundos * 1.5) * 0.014 +
          Math.sin(px * 6 - py * 21 + segundos) * 0.009;
        var m = (nivel + onda - pz) / 0.024;
        m = m < 0 ? 0 : m > 1 ? 1 : m;
        m = m * m * (3 - 2 * m);

        var t = (pz - masBajo) / rango;
        var mezcla = 0.25 + t * 0.75;
        var brillo = 1.05 + 0.4 * Math.sin(pz * 55 + segundos * 2);

        colores[k * 3] = agua.r * 0.5 * (1 - mezcla) + seco.r * mezcla;
        colores[k * 3 + 1] = agua.g * 0.5 * (1 - mezcla) + seco.g * mezcla;
        colores[k * 3 + 2] = agua.b * 0.5 * (1 - mezcla) + seco.b * mezcla;

        colores[k * 3] += (agua.r * brillo - colores[k * 3]) * m;
        colores[k * 3 + 1] += (agua.g * brillo - colores[k * 3 + 1]) * m;
        colores[k * 3 + 2] += (agua.b * brillo - colores[k * 3 + 2]) * m;
      }
      geometria.attributes.color.needsUpdate = true;
    };

    var empuje = 0;
    var ultimoPintado = -1e9;

    /* Un ángulo medio: ni a ras de suelo, que convierte el terreno en una franja,
       ni desde arriba, que lo deja ocupando solo el centro. */
    var encuadrar = function () {
      camara.aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
      var estrecho = Math.max(0.5, Math.min(1, camara.aspect));
      var escala = 1.42 / estrecho;
      camara.position.set(0, -1.2 * escala, 0.78 * escala);
      camara.lookAt(0, 0.06, 0);
      camara.updateProjectionMatrix();
    };

    var tam = ajustar(canvas);
    render.setPixelRatio(tam.dpr);
    render.setSize(tam.ancho, tam.alto, false);
    encuadrar();
    pintarAgua(0, nivelBase);

    /* El cursor sube el agua: es la interacción que cuenta el proyecto. */
    canvas.parentElement.addEventListener(
      "pointermove",
      function (evento) {
        var caja = canvas.getBoundingClientRect();
        empuje = -((evento.clientY - caja.top) / caja.height - 0.5) * 2;
      },
      { passive: true }
    );
    canvas.parentElement.addEventListener("pointerleave", function () {
      empuje = 0;
    });

    document.addEventListener("themechange", function () {
      seco.set(colorDe("--accent") || "#e0b47c");
      agua.set(colorAscii());
      ultimoPintado = -1e9;
    });

    var motor = bucle(function (t) {
      /* Una corriente lenta no necesita 60 repintados por segundo: subir 26 000
         colores a la GPU se hace unas veinte veces por segundo. */
      if (t - ultimoPintado > 45) {
        ultimoPintado = t;
        pintarAgua(t * 0.001, nivelBase + empuje * 0.09);
      }
      render.render(escena, camara);
    });

    window.addEventListener(
      "resize",
      function () {
        var n = ajustar(canvas);
        render.setPixelRatio(n.dpr);
        render.setSize(n.ancho, n.alto, false);
        encuadrar();
      },
      { passive: true }
    );

    if (movimientoReducido) {
      render.render(escena, camara);
      return;
    }

    motor.arrancar();
    seguirVisibilidad(canvas, motor);
  }

  /* ------------------------------------------- 2 y 3. Volúmenes segmentados */

  /* Caja torácica: una columna y una pila de arcos elípticos inclinados. No es
     el estudio de nadie, es una silueta generada, que es lo honesto: no puedo
     publicar el DICOM de un paciente. */
  function costillar() {
    var puntos = [];
    var costillas = 9;
    var porArco = 90;
    var c;
    var i;

    for (c = 0; c < costillas; c++) {
      var f = c / (costillas - 1);
      var alto = -0.62 + f * 1.15;
      var ancho = 0.34 + 0.3 * Math.sin(f * Math.PI);
      var caida = 0.34 * (1 - f);

      for (i = 0; i < porArco; i++) {
        var a = -Math.PI * 0.66 + (i / (porArco - 1)) * Math.PI * 1.32;
        puntos.push(
          Math.sin(a) * ancho,
          alto - Math.abs(Math.sin(a)) * caida,
          Math.cos(a) * ancho * 0.74
        );
      }
    }

    /* La columna, para que los arcos no floten sueltos. */
    for (var v = 0; v < 130; v++) {
      var y2 = -0.7 + (v / 129) * 1.3;
      var r2 = 0.075 * (1 - Math.abs(y2) * 0.4);
      var ang = v * 1.7;
      puntos.push(Math.cos(ang) * r2, y2, -0.2 + Math.sin(ang) * r2);
    }

    return new Float32Array(puntos);
  }

  /* Cráneo: un elipsoide vaciado por las órbitas, la fosa nasal y la base. Se
     muestrea la superficie y se descartan los puntos que caen en los huecos. */
  function craneo() {
    var puntos = [];
    var total = 16000;
    var oro = Math.PI * (3 - Math.sqrt(5));

    for (var i = 0; i < total; i++) {
      var u = 1 - (i / (total - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - u * u));
      var th = oro * i;
      var px = Math.cos(th) * r * 0.56;
      var py = u * 0.96 + 0.02;
      var pz = Math.sin(th) * r * 0.64;

      /* Órbitas: dos huecos a los lados de la cara. */
      var o1 =
        (px - 0.21) * (px - 0.21) +
        (py - 0.14) * (py - 0.14) +
        (pz - 0.45) * (pz - 0.45);
      var o2 =
        (px + 0.21) * (px + 0.21) +
        (py - 0.14) * (py - 0.14) +
        (pz - 0.45) * (pz - 0.45);
      if (o1 < 0.045 || o2 < 0.045) {
        continue;
      }

      /* Fosa nasal. */
      if (px * px + (py + 0.2) * (py + 0.2) + (pz - 0.55) * (pz - 0.55) < 0.012) {
        continue;
      }

      /* La base se recorta para que quede la bóveda craneal y la mandíbula. */
      if (py < -0.52 && Math.abs(px) < 0.3 && pz > -0.16) {
        continue;
      }

      puntos.push(px, py, pz);
    }

    return new Float32Array(puntos);
  }

  /* El mismo montaje para las dos: nube de puntos, giro lento y un plano de
     corte que sigue al puntero y va descubriendo el interior. */
  function volumetrico(canvas, THREE, generar) {
    var escena = new THREE.Scene();
    var camara = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camara.position.set(0, 0, 2.9);

    var render = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    });
    render.setClearAlpha(0);
    render.localClippingEnabled = true;

    var geometria = new THREE.BufferGeometry();
    geometria.setAttribute("position", new THREE.BufferAttribute(generar(), 3));
    geometria.computeBoundingBox();

    var corte = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.6);
    var material = new THREE.PointsMaterial({
      size: 0.022,
      color: new THREE.Color(colorAscii()),
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });
    material.clippingPlanes = [corte];

    var puntos = new THREE.Points(geometria, material);
    escena.add(puntos);

    /* Se encuadra con la caja **real** del volumen, no con una esfera que lo
       engloba: la esfera dejaba el modelo pequeño y flotando en el centro.
       En horizontal se toma el radio mayor, porque el volumen gira y su silueta
       cambia; así nunca se sale por los lados. */
    var caja = geometria.boundingBox;
    var altoVolumen = caja.max.y - caja.min.y;
    var radioHorizontal = 0;
    for (var v = 0; v < geometria.attributes.position.count; v++) {
      var vx = geometria.attributes.position.getX(v);
      var vz = geometria.attributes.position.getZ(v);
      var d = Math.sqrt(vx * vx + vz * vz);
      if (d > radioHorizontal) {
        radioHorizontal = d;
      }
    }
    var anchoVolumen = radioHorizontal * 2;

    /* La distancia que llena el canvas por el lado que antes se agote, más un
       seis por ciento de aire para que no toque los bordes. */
    var encuadrar = function () {
      camara.aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
      var medioFov = Math.tan((camara.fov * Math.PI) / 360);
      var porAlto = altoVolumen / (2 * medioFov);
      var porAncho = anchoVolumen / (2 * medioFov * camara.aspect);
      camara.position.set(0, 0, Math.max(porAlto, porAncho) * 1.06);
      camara.updateProjectionMatrix();
    };

    var tam = ajustar(canvas);
    render.setPixelRatio(tam.dpr);
    render.setSize(tam.ancho, tam.alto, false);
    encuadrar();

    var destino = { x: 0, y: 0 };
    var actual = { x: 0, y: 0 };

    canvas.parentElement.addEventListener(
      "pointermove",
      function (evento) {
        var caja = canvas.getBoundingClientRect();
        destino.x = ((evento.clientX - caja.left) / caja.width - 0.5) * 2;
        destino.y = ((evento.clientY - caja.top) / caja.height - 0.5) * 2;
      },
      { passive: true }
    );

    document.addEventListener("themechange", function () {
      material.color = new THREE.Color(colorAscii());
    });

    var motor = bucle(function (t) {
      actual.x += (destino.x - actual.x) * 0.06;
      actual.y += (destino.y - actual.y) * 0.06;
      /* El plano barre el volumen de un lado al otro. */
      corte.constant = 0.6 - actual.x * 0.5;
      puntos.rotation.y = t * 0.00016 + actual.x * 0.35;
      puntos.rotation.x = actual.y * 0.25;
      render.render(escena, camara);
    });

    window.addEventListener(
      "resize",
      function () {
        var n = ajustar(canvas);
        render.setPixelRatio(n.dpr);
        render.setSize(n.ancho, n.alto, false);
        encuadrar();
      },
      { passive: true }
    );

    if (movimientoReducido) {
      render.render(escena, camara);
      return;
    }

    motor.arrancar();
    seguirVisibilidad(canvas, motor);
  }

  /* ------------------------------------------------- 4. Esfera de caracteres */

  /* Proyección propia, sin librerías: los puntos de una esfera se reparten con
     la espiral de Fibonacci y cada uno se dibuja con un glifo de la rampa. Los
     de delante se ven más y los de detrás se apagan, que es lo que da volumen.
     El puntero los aparta y una fuerza de retorno los devuelve a su sitio. */
  function esferaAscii(canvas) {
    var RAMP = " .:-=+*#%@";
    var ctx = canvas.getContext("2d");
    var total = 900;
    var puntos = [];
    var oro = Math.PI * (3 - Math.sqrt(5));
    var RADIO_PUNTERO = 150;
    var TOPE_EMPUJE = 34;

    for (var i = 0; i < total; i++) {
      var y = 1 - (i / (total - 1)) * 2;
      var radio = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = oro * i;
      puntos.push({
        x: Math.cos(theta) * radio,
        y: y,
        z: Math.sin(theta) * radio,
        dx: 0,
        dy: 0,
      });
    }

    var tam = { ancho: 0, alto: 0, dpr: 1 };
    var tamanoFuente = 11;
    var puntero = { x: -1e3, y: -1e3 };
    var ultimo = 0;

    canvas.parentElement.addEventListener(
      "pointermove",
      function (evento) {
        var caja = canvas.getBoundingClientRect();
        puntero.x = evento.clientX - caja.left;
        puntero.y = evento.clientY - caja.top;
      },
      { passive: true }
    );
    canvas.parentElement.addEventListener("pointerleave", function () {
      puntero.x = -1e3;
      puntero.y = -1e3;
    });

    function medir() {
      tam = ajustar(canvas);
      tamanoFuente = Math.max(9, Math.round(canvas.clientWidth / 62));
    }

    function pintar(t) {
      var dt = ultimo ? Math.min(0.05, (t - ultimo) / 1000) : 1 / 60;
      ultimo = t;

      var ancho = tam.ancho;
      var alto = tam.alto;
      var giro = t * 0.00012;
      var retorno = Math.pow(0.93, dt * 60);

      ctx.setTransform(tam.dpr, 0, 0, tam.dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      ctx.font = tamanoFuente + "px " + (colorDe("--font-display") || "monospace");
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      var escala = Math.min(ancho, alto) * 0.3;
      var cx = ancho / 2;
      var cy = alto / 2;
      var rgb = colorDe("--ascii-rgb") || "127, 166, 206";

      for (var k = 0; k < puntos.length; k++) {
        var p = puntos[k];
        var x = p.x * Math.cos(giro) - p.z * Math.sin(giro);
        var z = p.x * Math.sin(giro) + p.z * Math.cos(giro);

        /* Perspectiva simple: lo que está más cerca se agranda y se separa. */
        var prof = 2.6 / (2.6 + z);
        var sx = cx + x * escala * prof;
        var sy = cy + p.y * escala * prof;

        /* El puntero empuja; el retorno trae de vuelta. */
        if (puntero.x > -1e2) {
          var ex = sx + p.dx - puntero.x;
          var ey = sy + p.dy - puntero.y;
          var d = Math.sqrt(ex * ex + ey * ey) || 1;
          if (d < RADIO_PUNTERO) {
            var fuerza = (1 - d / RADIO_PUNTERO) * 620 * dt;
            p.dx += (ex / d) * fuerza;
            p.dy += (ey / d) * fuerza;
          }
        }
        p.dx *= retorno;
        p.dy *= retorno;
        if (p.dx > TOPE_EMPUJE) {
          p.dx = TOPE_EMPUJE;
        } else if (p.dx < -TOPE_EMPUJE) {
          p.dx = -TOPE_EMPUJE;
        }
        if (p.dy > TOPE_EMPUJE) {
          p.dy = TOPE_EMPUJE;
        } else if (p.dy < -TOPE_EMPUJE) {
          p.dy = -TOPE_EMPUJE;
        }

        var cerca = (1 - z) / 2; // 1 delante, 0 detrás
        if (cerca < 0.12) {
          continue;
        }
        var nivel = Math.min(RAMP.length - 1, Math.floor(cerca * RAMP.length));
        var glifo = RAMP.charAt(nivel);
        if (glifo === " ") {
          continue;
        }
        ctx.fillStyle = "rgba(" + rgb + ", " + (0.06 + cerca * 0.3).toFixed(3) + ")";
        ctx.fillText(glifo, sx + p.dx, sy + p.dy);
      }
    }

    medir();
    window.addEventListener(
      "resize",
      function () {
        medir();
        if (movimientoReducido) {
          pintar(0);
        }
      },
      { passive: true }
    );

    if (movimientoReducido) {
      pintar(0);
      return;
    }

    var motor = bucle(pintar);
    motor.arrancar();
    seguirVisibilidad(canvas, motor);
  }

  /* -------------------------------------------------------------- arranque */

  /* La esfera no necesita Three.js, así que arranca en cuanto se acerca. */
  if (lienzoContacto) {
    alEntrar(lienzoContacto, function () {
      cuandoSePueda(function () {
        esferaAscii(lienzoContacto);
      });
    });
  }

  /* Las tres de Three.js comparten la descarga y esperan a que su tarjeta se
     acerque, así que a la primera pantalla no se baja nada. */
  var volumetricos = [
    [lienzoPetct, costillar],
    [lienzoInnova, craneo],
  ];

  if (lienzoGemelo || lienzoPetct || lienzoInnova) {
    var lanzar = function (canvas, montar) {
      cuandoSePueda(function () {
        cargarThree()
          .then(function (THREE) {
            montar(canvas, THREE);
          })
          .catch(function () {
            avisarDelFallo(canvas);
          });
      });
    };

    if (lienzoGemelo) {
      alEntrar(lienzoGemelo, function () {
        lanzar(lienzoGemelo, terreno);
      });
    }

    volumetricos.forEach(function (par) {
      var canvas = par[0];
      var generar = par[1];
      if (!canvas) {
        return;
      }
      alEntrar(canvas, function () {
        lanzar(canvas, function (c, THREE) {
          volumetrico(c, THREE, generar);
        });
      });
    });
  }
})();
