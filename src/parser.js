// src/parser.js
// Responsabilidad única: recibir el texto crudo de un chat exportado de
// WhatsApp y devolver una lista ordenada de mensajes { fecha, hora, autor, texto }.

// Regex más estricto: REQUIERE fecha completa (día/mes/año)
const REGEX_MENSAJE = new RegExp(
  "^\\s*" +
  "\\[?" +
  "(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{2,4})" + // Fecha obligatoria
  "[,.]?\\s+" +
  "(\\d{1,2}):(\\d{2})(?::(\\d{2}))?" + // Hora obligatoria
  "\\s*" +
  "([ap]\\.?\\s?m\\.?)?" + // AM/PM opcional
  "\\]?" +
  "\\s*[-–]?\\s*" +
  "([^:]+?):\\s" + // Autor obligatorio
  "([\\s\\S]*)$", // Texto (puede ser multilínea)
  "i"
);

function construirFecha(dia, mes, anio, hora, minuto, segundo, meridiano) {
  let d = parseInt(dia, 10);
  let m = parseInt(mes, 10);
  let a = parseInt(anio, 10);
  let h = parseInt(hora, 10);
  let min = parseInt(minuto, 10);
  let seg = segundo ? parseInt(segundo, 10) : 0;

  // Validar rangos básicos
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  // Normalizar año de 2 cifras
  if (a < 100) a += 2000;

  // Convertir formato de 12 horas a 24
  const esPM = meridiano && meridiano.toLowerCase()[0] === 'p';
  if (esPM && h < 12) h += 12;
  if (!esPM && h === 12) h = 0;

  try {
    const fecha = new Date(a, m - 1, d, h, min, seg);
    // Validar que la fecha sea válida (Date no lanza error, pero puede ser Invalid)
    if (isNaN(fecha.getTime())) return null;
    return fecha;
  } catch {
    return null;
  }
}

function limpiarLinea(linea) {
  return linea
    .replace(/[\u200e\u200f\ufeff]/g, '') // Caracteres de control árabe/hebreo
    .replace(/^\s+/, ''); // Espacios al inicio
}

export function parsearChat(textoCrudo) {
  if (!textoCrudo) return [];

  const lineas = textoCrudo.split(/\r?\n/);
  const mensajes = [];

  for (let i = 0; i < lineas.length; i++) {
    const lineaOriginal = lineas[i];
    const linea = limpiarLinea(lineaOriginal);

    if (!linea) continue; // Salta líneas vacías

    const match = linea.match(REGEX_MENSAJE);

    if (match) {
      // Es el inicio de un mensaje nuevo (tiene fecha + hora + autor)
      const [, dia, mes, anio, hora, minuto, segundo, meridiano, autor, texto] = match;

      // Validar fecha
      const fecha = construirFecha(dia, mes, anio, hora, minuto, segundo, meridiano);
      if (!fecha) continue; // Si la fecha no es válida, salta esta línea

      const horaFormato = `${String(parseInt(hora, 10)).padStart(2, '0')}:${minuto}`;

      mensajes.push({
        fecha,
        hora: horaFormato,
        autor: autor.trim(),
        texto: texto || '',
      });
    } else if (mensajes.length > 0 && linea.trim()) {
      // Es la continuación del último mensaje (mensaje de varias líneas)
      // PERO: validamos que NO sea una línea que parece una fecha
      const parece_solo_hora = /^\d{1,2}:\d{2}/.test(linea.trim());
      if (!parece_solo_hora) {
        mensajes[mensajes.length - 1].texto += '\n' + linea;
      }
      // Si parece una hora suelta, la ignoramos (no la añadimos al último mensaje)
    }
    // Si no hay mensajes aún y la línea no encaja, la ignoramos
  }

  return mensajes;
}