// main.js
// ============================================================
//  ChataPDF · Chat de WhatsApp → PDF (100% en el navegador)
//  Privacidad como diferenciador: tu chat NUNCA sale de tu PC.
// ============================================================
import './style.css';
import html2pdf from 'html2pdf.js';
import JSZip from 'jszip';
import { parsearChat } from './parser.js';
import PLANES from './planes.js';

// ============================================================
//  CONSTANTES Y ESTADO GLOBAL
// ============================================================
const DB_NOMBRE = 'chatapdf';
const DB_TIENDA = 'pdfs';
const PDF_CLAVE = 'pdf-actual';

const app = document.querySelector('#app');
if (!app) {
  throw new Error('No encuentro <div id="app"> en index.html');
}

// Estado de la aplicación (lo que la app "recuerda")
const estado = {
  mensajes: [],
  autores: [],
  yo: null,
  estilo: 'burbujas',
  medios: new Map(), // nombre de archivo (minúscula) -> URL local
  planElegido: null,
};

// Caché de elementos del DOM (evitamos document.querySelector repetido)
let elementosCache = {
  chat: null,
  modal: null,
  selectYo: null,
  selectEstilo: null,
};

// ============================================================
//  UTILIDADES: IndexedDB + Escape HTML
// ============================================================

function abrirDB() {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(DB_NOMBRE, 1);
    solicitud.onupgradeneeded = () => {
      if (!solicitud.result.objectStoreNames.contains(DB_TIENDA)) {
        solicitud.result.createObjectStore(DB_TIENDA);
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

async function guardarPDF(blob) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_TIENDA, 'readwrite');
    tx.objectStore(DB_TIENDA).put(blob, PDF_CLAVE);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function escapar(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

function liberarMedios() {
  estado.medios.forEach((url) => URL.revokeObjectURL(url));
  estado.medios.clear();
}

// ============================================================
//  DETECTORES DE CONTENIDO ESPECIAL
// ============================================================

function esMensajeSistema(texto) {
  if (!texto) return false;
  const t = String(texto)
    .replace(/[\u200e\u200f]/g, '')
    .trim()
    .toLowerCase();
  const patrones = [
    'cifrados de extremo a extremo',
    'cifrado de extremo a extremo',
    'están cifrados',
    'end-to-end encrypted',
    'messages and calls are end-to-end',
    'tu código de seguridad con',
    'your security code with',
    'cambió su número de teléfono',
    'changed their phone number',
    'se eliminó este grupo',
  ];
  return patrones.some((p) => t.includes(p));
}

function etiqueta(tipo, archivo = null) {
  const tabla = {
    imagen: { icono: '📷', etiqueta: 'Imagen' },
    audio: { icono: '🎵', etiqueta: 'Audio' },
    video: { icono: '🎥', etiqueta: 'Vídeo' },
    sticker: { icono: '🩷', etiqueta: 'Sticker' },
    gif: { icono: '🎬', etiqueta: 'GIF' },
    documento: { icono: '📄', etiqueta: 'Documento' },
    contacto: { icono: '👤', etiqueta: 'Contacto' },
    ubicacion: { icono: '📍', etiqueta: 'Ubicación' },
    multimedia: { icono: '📎', etiqueta: 'Multimedia' },
  };
  const base = tabla[tipo] || tabla.multimedia;
  return { tipo, icono: base.icono, etiqueta: base.etiqueta, archivo };
}

function clasificarPorExtension(ext) {
  const imagenes = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp'];
  const audios = ['opus', 'mp3', 'm4a', 'ogg', 'aac', 'wav'];
  const videos = ['mp4', 'mov', 'avi', '3gp', 'mkv'];
  const docs = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip'];

  if (ext === 'gif') return etiqueta('gif');
  if (imagenes.includes(ext)) return etiqueta('imagen');
  if (audios.includes(ext)) return etiqueta('audio');
  if (videos.includes(ext)) return etiqueta('video');
  if (ext === 'vcf') return etiqueta('contacto');
  if (docs.includes(ext)) return etiqueta('documento');
  return etiqueta('multimedia');
}

function detectarMultimedia(texto) {
  if (!texto) return null;

  const limpio = String(texto).replace(/[\u200e\u200f]/g, '').trim();
  const min = limpio.toLowerCase();

  if (min === '<multimedia omitido>' || min === '<media omitted>') {
    return { tipo: 'multimedia', icono: '📎', etiqueta: 'Multimedia', archivo: null };
  }

  const mArchivo = limpio.match(/^(.+?)\s*\((?:archivo adjunto|file attached)\)$/i);
  if (mArchivo) {
    const nombre = mArchivo[1].trim();
    const ext = (nombre.split('.').pop() || '').toLowerCase();
    const porExtension = clasificarPorExtension(ext);
    return { ...porExtension, archivo: nombre };
  }

  const mAdjuntoIos = limpio.match(/^<\s*(?:adjunto|attached)\s*:\s*(.+?)\s*>$/i);
  if (mAdjuntoIos) {
    const nombre = mAdjuntoIos[1].trim();
    const ext = (nombre.split('.').pop() || '').toLowerCase();
    const porExtension = clasificarPorExtension(ext);
    return { ...porExtension, archivo: nombre };
  }

  if (min.includes('imagen omitida')) return etiqueta('imagen');
  if (min.includes('audio omitido')) return etiqueta('audio');
  if (min.includes('video omitido') || min.includes('vídeo omitido')) return etiqueta('video');
  if (min.includes('sticker omitido')) return etiqueta('sticker');
  if (min.includes('gif omitido')) return etiqueta('gif');
  if (min.includes('documento omitido')) return etiqueta('documento');
  if (min.includes('contacto omitido') || min.startsWith('contacto:')) return etiqueta('contacto');
  if (min.startsWith('ubicación:') || min.startsWith('ubicacion:') || min.startsWith('location:')) {
    return etiqueta('ubicacion');
  }

  return null;
}

function detectarLlamada(texto) {
  if (!texto) return null;

  const limpio = String(texto).replace(/[\u200e\u200f]/g, '').trim();
  const min = limpio.toLowerCase();

  const esLlamada =
    /^(?:video\s?llamada|llamada)\b/.test(min) &&
    (min.includes('perdida') || min.includes('sin respuesta') || /\b\d+\s*(?:s|seg|min|h)\b/.test(min) || min === 'llamada' || min === 'videollamada');

  if (!esLlamada) return null;

  const esVideo = min.startsWith('video');
  return { icono: esVideo ? '📹' : '📞', etiqueta: limpio };
}

// ============================================================
//  PROCESAMIENTO DE ARCHIVOS
// ============================================================

function procesarArchivo(archivo) {
  const nombre = (archivo.name || '').toLowerCase();

  if (nombre.endsWith('.zip')) {
    leerZip(archivo);
  } else if (nombre.endsWith('.txt')) {
    leerTxt(archivo);
  } else {
    alert('Formato no reconocido. Sube el .zip o el .txt que exporta WhatsApp.');
  }
}

function leerTxt(archivo) {
  const lector = new FileReader();
  lector.onload = (e) => construirDesdeTexto(e.target.result);
  lector.onerror = () => {
    console.error('Error del FileReader:', lector.error);
    alert('No he podido abrir el archivo. Prueba a exportarlo de nuevo.');
  };
  lector.readAsText(archivo, 'utf-8');
}

async function leerZip(archivo) {
  liberarMedios();

  let zip;
  try {
    zip = await JSZip.loadAsync(archivo);
  } catch (err) {
    console.error('Error abriendo el ZIP:', err);
    alert('No he podido abrir el .zip. Asegúrate de subir el archivo tal cual lo exporta WhatsApp.');
    return;
  }

  let entradaTxt = null;
  zip.forEach((ruta, entrada) => {
    if (!entrada.dir && ruta.toLowerCase().endsWith('.txt') && !entradaTxt) {
      entradaTxt = entrada;
    }
  });

  if (!entradaTxt) {
    alert('El .zip no contiene el archivo de texto del chat. ¿Seguro que es la exportación de WhatsApp?');
    return;
  }

  const extImagen = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
  const tareas = [];

  zip.forEach((ruta, entrada) => {
    if (entrada.dir) return;
    const ext = (ruta.split('.').pop() || '').toLowerCase();
    if (!extImagen.includes(ext)) return;

    const nombreArchivo = (ruta.split('/').pop() || '').toLowerCase();
    const tarea = entrada.async('blob').then((blob) => {
      const url = URL.createObjectURL(blob);
      estado.medios.set(nombreArchivo, url);
    });
    tareas.push(tarea);
  });

  try {
    const texto = await entradaTxt.async('string');
    await Promise.all(tareas);
    construirDesdeTexto(texto);
  } catch (err) {
    console.error('Error leyendo el contenido del ZIP:', err);
    alert('Ha ocurrido un error leyendo el .zip. Revisa la consola (F12).');
  }
}

function construirDesdeTexto(texto) {
  let mensajes = [];
  try {
    mensajes = parsearChat(texto) || [];
  } catch (err) {
    console.error('Error en parsearChat:', err);
    alert('Ha ocurrido un error leyendo el chat. Revisa la consola (F12).');
    return;
  }

  // VALIDACIÓN: ¿hay mensajes?
  if (mensajes.length === 0) {
    alert('No he podido leer mensajes en ese archivo. Prueba a exportar el chat de nuevo.');
    return;
  }

  estado.mensajes = mensajes;
  estado.autores = [
    ...new Set(
      estado.mensajes
        .filter((m) => m.autor && !esMensajeSistema(m.texto))
        .map((m) => m.autor)
    ),
  ];
  estado.yo = estado.autores[0] || null;

  // VALIDACIÓN: ¿hay autores distintos del sistema?
  if (estado.autores.length === 0) {
    alert('No he encontrado participantes en el chat. ¿Es un archivo válido?');
    return;
  }

  pintarVistaChat();
}

// ============================================================
//  PANTALLA 1: PORTADA + ZONA DE SUBIDA
// ============================================================

function pintarPantallaInicial() {
  liberarMedios();
  estado.planElegido = null;

  app.innerHTML = `
    <header class="cabecera">
      <div class="marca">
        <span class="marca-icono">💬</span>
        <span class="marca-nombre">Chata<span class="marca-pdf">PDF</span></span>
      </div>
      <h1 class="hero-titulo">Convierte tu chat de WhatsApp en PDF,<br>sin que salga de tu ordenador</h1>
      <p class="hero-sub">Fotos incluidas · transcripción de notas de voz · procesado 100% en tu dispositivo.</p>

      <ul class="ventajas">
        <li>🔒 No subimos nada a ningún servidor</li>
        <li>📷 Las fotos salen de verdad en el PDF</li>
        <li>🎤 Transcribimos tus notas de voz (en tu propio equipo)</li>
      </ul>
    </header>

    <section id="zona-subida" class="zona-subida">
      <p class="zona-titulo">Arrastra aquí tu archivo <strong>.zip</strong> o <strong>.txt</strong> de WhatsApp</p>
      <p class="o">— o —</p>
      <button id="btn-elegir" class="btn-principal" type="button">Seleccionar archivo</button>
      <input id="input-archivo" type="file" accept=".zip,.txt" hidden />
      <p class="ayuda">🔒 Nada de esto se envía a internet: el chat se abre y se convierte dentro de tu navegador.</p>
    </section>

    <section class="guia">
      <h2>Cómo exportar tu chat (2 minutos)</h2>
      <ol class="pasos">
        <li><span class="paso-num">1</span> Abre el chat en WhatsApp y toca <strong>⋮ → Más → Exportar chat</strong>.</li>
        <li><span class="paso-num">2</span> Elige <strong>"Incluir archivos"</strong> para que salgan también las fotos y las notas de voz.</li>
        <li><span class="paso-num">3</span> Guarda el <strong>.zip</strong> en tu ordenador y súbelo aquí arriba. ¡Listo!</li>
      </ol>
    </section>

    <section class="planes">
      <h2>Elige tu plan</h2>
      <div class="planes-grid">
        ${PLANES.map(
          (p) => `
          <article class="plan ${p.destacado ? 'destacado' : ''}">
            ${p.destacado ? '<span class="plan-badge estrella">⭐ El más elegido</span>' : '<span class="plan-badge lanzamiento">Precio de lanzamiento</span>'}
            <h3>${escapar(p.nombre)}</h3>
            <p class="plan-precio">${escapar(p.precio)}</p>
            <p class="plan-pago-unico">Pago único por esta exportación</p>
            <ul>
              ${p.incluye.map((i) => `<li>${escapar(i)}</li>`).join('')}
            </ul>
          </article>
        `
        ).join('')}
      </div>
      <p class="planes-nota">
        <strong>Sin suscripciones ni cobros recurrentes.</strong> Pagas una sola vez por
        cada chat que conviertas, y solo cuando ya está procesado en tu equipo. Sin registros, sin sorpresas.
      </p>
    </section>
  `;

  quitarBarraFija();

  const zona = app.querySelector('#zona-subida');
  const input = app.querySelector('#input-archivo');
  const btn = app.querySelector('#btn-elegir');

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    if (e.target.files.length) procesarArchivo(e.target.files[0]);
  });

  zona.addEventListener('dragover', (e) => {
    e.preventDefault();
    zona.classList.add('arrastrando');
  });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastrando'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('arrastrando');
    if (e.dataTransfer.files.length) procesarArchivo(e.dataTransfer.files[0]);
  });
}

// ============================================================
//  PANTALLA 2: VISTA DEL CHAT + PLANES + CHECKOUT
// ============================================================

function pintarVistaChat() {
  const opcionesAutor = estado.autores
    .map((a) => `<option value="${escapar(a)}" ${a === estado.yo ? 'selected' : ''}>${escapar(a)}</option>`)
    .join('');

  const tarjetasPlan = PLANES.map(
    (p) => `
    <button class="cplan ${p.destacado ? 'destacado' : ''}" data-plan="${p.id}" type="button">
      ${p.destacado ? '<span class="cplan-badge">⭐ El más elegido</span>' : ''}
      <span class="cplan-nombre">${escapar(p.nombre)}</span>
      <span class="cplan-precio">${escapar(p.precio)}</span>
      <span class="cplan-pago">pago único</span>
      <ul class="cplan-lista">${p.incluye.map((i) => `<li>${escapar(i)}</li>`).join('')}</ul>
      <span class="cplan-cta">Elegir ${escapar(p.nombre)}</span>
    </button>
  `
  ).join('');

  app.innerHTML = `
    <header class="cabecera">
      <div class="marca">
        <span class="marca-icono">💬</span>
        <span class="marca-nombre">Chata<span class="marca-pdf">PDF</span></span>
      </div>
      <h1 class="hero-titulo">Vista previa</h1>
      <p class="privacidad">🔒 100% privado: tu chat nunca sale de tu ordenador.</p>
    </header>

    <div class="controles">
      <label>¿Cuál eres tú?
        <select id="select-yo">${opcionesAutor}</select>
      </label>

      <label>Estilo del PDF:
        <select id="select-estilo">
          <option value="burbujas">Burbujas (estilo WhatsApp)</option>
          <option value="documento">Documento limpio (legal/impresión)</option>
          <option value="compacto">Compacto (monoespaciado)</option>
        </select>
      </label>

      <button id="btn-volver" class="btn-secundario" type="button">Cambiar archivo</button>
    </div>

    <div id="chat" class="chat estilo-burbujas"></div>

    <section class="checkout">
      <h2>Descarga tu PDF</h2>
      <p class="checkout-sub">Elige tu plan. <strong>Pago único</strong>, sin suscripciones ni cobros recurrentes.</p>

      <div class="checkout-planes">
        ${tarjetasPlan}
      </div>

      <button id="btn-preview" class="btn-preview" type="button">
        Descargar vista previa gratis (con marca de agua)
      </button>

      <p class="checkout-nota">🔒 Todo se procesa en tu dispositivo. Tu chat nunca se sube a internet.</p>
    </section>

    <p class="aviso-legal">
      ⚠️ Aviso: este PDF es una copia visual de la conversación y
      <strong>no constituye una prueba pericial certificada</strong>. Un archivo
      de texto puede editarse. Para uso legal ante un tribunal, consulta con un
      perito informático.
    </p>

    <div id="modal-pago" class="modal" aria-hidden="true">
      <div id="modal-fondo" class="modal-fondo"></div>
      <div class="modal-caja" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
        <button id="modal-cerrar" class="modal-cerrar" type="button" aria-label="Cerrar">✕</button>
        <h3 id="modal-titulo" class="modal-titulo">Confirma tu plan</h3>
        <p class="modal-plan-linea">
          <span class="modal-plan-nombre"></span>
          <span class="modal-plan-precio"></span>
        </p>
        <p class="modal-plan-pago">Pago único · sin suscripciones</p>
        <ul class="modal-plan-lista"></ul>
        <button id="btn-pagar" class="btn-principal btn-pagar" type="button">Ir a pagar</button>
        <p class="modal-seguro">🔒 Pago seguro. Al completarlo, tu PDF se descarga sin marca de agua.</p>
      </div>
    </div>
  `;

  // Caché de elementos para evitar queries repetidas
  elementosCache.chat = app.querySelector('#chat');
  elementosCache.modal = app.querySelector('#modal-pago');
  elementosCache.selectYo = app.querySelector('#select-yo');
  elementosCache.selectEstilo = app.querySelector('#select-estilo');

  // Event listeners
  elementosCache.selectYo.addEventListener('change', (e) => {
    estado.yo = e.target.value;
    renderMensajes();
  });

  elementosCache.selectEstilo.addEventListener('change', (e) => {
    estado.estilo = e.target.value;
    aplicarEstilo();
  });

  app.querySelector('#btn-volver').addEventListener('click', pintarPantallaInicial);
  app.querySelector('#btn-preview').addEventListener('click', descargarPreview);

  app.querySelectorAll('.cplan').forEach((boton) => {
    boton.addEventListener('click', () => iniciarPago(boton.dataset.plan));
  });

  app.querySelector('#modal-cerrar').addEventListener('click', cerrarModalPago);
  app.querySelector('#modal-fondo').addEventListener('click', cerrarModalPago);
  app.querySelector('#btn-pagar').addEventListener('click', pagarAhora);

  montarBarraFija();
  renderMensajes();
}

function renderMensajes() {
  if (!elementosCache.chat) return;

  elementosCache.chat.innerHTML = estado.mensajes
    .map((m) => {
      if (!m.autor || esMensajeSistema(m.texto)) {
        return `<div class="sistema"><span>${escapar(m.texto)}</span></div>`;
      }

      const esMio = m.autor === estado.yo;
      const lado = esMio ? 'mio' : 'otro';
      const autorHtml = `<span class="autor">${escapar(m.autor)}</span>`;

      const llamada = detectarLlamada(m.texto);
      if (llamada) {
        return `
          <div class="mensaje ${lado} es-llamada" style="page-break-inside: avoid; break-inside: avoid;">
            ${autorHtml}
            <span class="media">
              <span class="media-icono">${llamada.icono}</span>
              <span class="media-texto">${escapar(llamada.etiqueta)}</span>
            </span>
            <span class="hora">${m.hora || ''}</span>
          </div>`;
      }

      const media = detectarMultimedia(m.texto);
      let cuerpo;

      if (media) {
        const clave = media.archivo ? media.archivo.toLowerCase() : null;
        const url = clave ? estado.medios.get(clave) : null;

        if (media.tipo === 'imagen' && url) {
          cuerpo = `<img class="media-imagen" src="${url}" alt="Imagen adjunta" />`;
        } else {
          cuerpo = `
            <span class="media">
              <span class="media-icono">${media.icono}</span>
              <span class="media-texto">${escapar(media.etiqueta)}</span>
            </span>`;
        }
      } else {
        cuerpo = `<span class="texto">${escapar(m.texto).replace(/\n/g, '<br>')}</span>`;
      }

      return `
        <div class="mensaje ${lado}" style="page-break-inside: avoid; break-inside: avoid;">
          ${autorHtml}
          ${cuerpo}
          <span class="hora">${m.hora || ''}</span>
        </div>`;
    })
    .join('');
}

function aplicarEstilo() {
  if (!elementosCache.chat) return;
  elementosCache.chat.className = 'chat estilo-' + estado.estilo;
}

// ============================================================
//  MODAL DE PAGO
// ============================================================

function iniciarPago(idPlan) {
  const plan = PLANES.find((p) => p.id === idPlan);
  if (!plan) return;
  estado.planElegido = plan;
  abrirModalPago(plan);
}

function abrirModalPago(plan) {
  if (!elementosCache.modal) return;
  elementosCache.modal.querySelector('.modal-plan-nombre').textContent = plan.nombre;
  elementosCache.modal.querySelector('.modal-plan-precio').textContent = plan.precio;
  elementosCache.modal.querySelector('.modal-plan-lista').innerHTML = plan.incluye
    .map((i) => `<li>${escapar(i)}</li>`)
    .join('');
  elementosCache.modal.classList.add('abierto');
  elementosCache.modal.setAttribute('aria-hidden', 'false');
}

function cerrarModalPago() {
  if (!elementosCache.modal) return;
  elementosCache.modal.classList.remove('abierto');
  elementosCache.modal.setAttribute('aria-hidden', 'true');
}

// ============================================================
//  PAGO CON STRIPE
// ============================================================

async function pagarAhora() {
  const plan = estado.planElegido;
  if (!plan) return;

  const boton = app.querySelector('#btn-pagar');
  const textoOriginal = boton.textContent;
  boton.disabled = true;

  try {
    boton.textContent = 'Preparando tu PDF…';
    const blobPDF = await generarPDFBlob();
    
    // Convertir blob a Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      localStorage.setItem('chatapdf-pdf-pendiente', base64);
      
      try {
        boton.textContent = 'Conectando con el pago…';
        const respuesta = await fetch('/.netlify/functions/crear-sesion-pago', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan.id }),
        });

        if (!respuesta.ok) {
          throw new Error('El servidor respondió ' + respuesta.status);
        }

        const datos = await respuesta.json();
        if (datos && datos.url) {
          window.location.href = datos.url;
        } else {
          throw new Error('No he recibido la URL de pago.');
        }
      } catch (errorPago) {
        console.error('Error al conectar con el pago:', errorPago);
        alert('No he podido preparar el pago. Inténtalo de nuevo en un momento.');
        localStorage.removeItem('chatapdf-pdf-pendiente');
        boton.disabled = false;
        boton.textContent = textoOriginal;
      }
    };
    reader.onerror = () => {
      throw new Error('No he podido leer el PDF.');
    };
    reader.readAsDataURL(blobPDF);
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    alert('No he podido preparar el PDF. Inténtalo de nuevo en un momento.');
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

// ============================================================
//  GENERACIÓN DE PDF
// ============================================================

function descargarPreview() {
  if (!elementosCache.chat) return;

  mostrarLoader(true);

  const opciones = {
    margin: 10,
    filename: 'chat-whatsapp-VISTA-PREVIA.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.mensaje', '.media', '.sistema'] },
  };

  html2pdf()
    .set(opciones)
    .from(elementosCache.chat)
    .toPdf()
    .get('pdf')
    .then((pdf) => ponerMarcaAgua(pdf))
    .save()
    .finally(() => mostrarLoader(false));
}

function generarPDFBlob() {
  return new Promise((resolve, reject) => {
    if (!elementosCache.chat) {
      reject(new Error('No hay chat para generar'));
      return;
    }

    const opciones = {
      margin: 10,
      filename: 'chat-whatsapp.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.mensaje', '.media', '.sistema'] },
    };

    html2pdf()
      .set(opciones)
      .from(elementosCache.chat)
      .outputPdf('blob')
      .then((blob) => resolve(blob))
      .catch((err) => reject(err));
  });
}

function ponerMarcaAgua(pdf) {
  const total = pdf.internal.getNumberOfPages();
  const ancho = pdf.internal.pageSize.getWidth();
  const alto = pdf.internal.pageSize.getHeight();
  const texto = 'VISTA PREVIA · ChataPDF';

  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setTextColor(205);
    pdf.setFontSize(22);

    for (let y = 18; y < alto + 30; y += 42) {
      for (let x = -20; x < ancho; x += 85) {
        pdf.text(texto, x, y, { angle: 30 });
      }
    }
  }
  return pdf;
}

// ============================================================
//  BARRA FIJA DE DESCARGA
// ============================================================

function montarBarraFija() {
  if (app.querySelector('#barra-fija')) return;

  const barra = document.createElement('div');
  barra.id = 'barra-fija';
  barra.className = 'barra-fija';
  barra.innerHTML = `
    <div class="barra-fija-info">
      <span class="barra-fija-icono">⬇️</span>
      <div class="barra-fija-texto">
        <strong>Descarga tu PDF</strong>
        <span>Pago único · desde 2,99€</span>
      </div>
    </div>
    <button id="barra-fija-btn" class="btn-principal barra-fija-btn" type="button">
      Elegir plan
    </button>
  `;
  document.body.appendChild(barra);

  barra.querySelector('#barra-fija-btn').addEventListener('click', irACheckout);
}

function quitarBarraFija() {
  const barra = document.querySelector('#barra-fija');
  if (barra) barra.remove();
}

function irACheckout() {
  const checkout = app.querySelector('.checkout');
  if (!checkout) return;

  const margenArriba = 90;
  const inicio = window.pageYOffset;
  const destino = checkout.getBoundingClientRect().top + inicio - margenArriba;
  const distancia = destino - inicio;

  const duracion = Math.min(1400, Math.max(600, Math.abs(distancia) * 0.6));
  let inicioTiempo = null;

  const suavizar = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function paso(ahora) {
    if (inicioTiempo === null) inicioTiempo = ahora;
    const transcurrido = ahora - inicioTiempo;
    const progreso = Math.min(1, transcurrido / duracion);

    window.scrollTo(0, inicio + distancia * suavizar(progreso));

    if (progreso < 1) {
      requestAnimationFrame(paso);
    } else {
      checkout.classList.add('checkout-destacar');
      setTimeout(() => checkout.classList.remove('checkout-destacar'), 1400);
    }
  }

  requestAnimationFrame(paso);
}

// ============================================================
//  LOADER VISUAL
// ============================================================

function mostrarLoader(mostrar) {
  let loader = document.querySelector('#pdf-loader');

  if (mostrar) {
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'pdf-loader';
      loader.className = 'pdf-loader';
      loader.innerHTML = `
        <div class="loader-contenido">
          <div class="loader-spinner"></div>
          <p>Generando tu PDF...</p>
        </div>
      `;
      document.body.appendChild(loader);
    }
    loader.classList.add('visible');
  } else {
    if (loader) {
      loader.classList.remove('visible');
    }
  }
}

// ============================================================
//  INICIO
// ============================================================

pintarPantallaInicial();