// src/planes.js
// FUENTE ÚNICA DE VERDAD de los planes. Cambiar un precio o un texto aquí
// se refleja en toda la web y en el cobro. No dupliques estos datos en otro sitio.

const PLANES = [
  {
    id: 'basico',
    nombre: 'Básico',
    precio: '2,99€',
    precioCentimos: 299,
    destacado: false,
    incluye: [
      '✔️ PDF con texto y fotos',
      '✔️ Mensajes ilimitados',
      '✔️ 100% en tu dispositivo',
    ],
  },
  {
    id: 'completo',
    nombre: 'Completo',
    precio: '9,99€',
    precioCentimos: 999,
    destacado: true,
    incluye: [
      '✔️ Todo lo del Básico',
      '✔️ Transcripción de notas de voz',
      '✔️ Sin subir tus audios a la nube',
    ],
  },
  {
    id: 'legal',
    nombre: 'Legal Pack',
    precio: '17,99€',
    precioCentimos: 1799,
    destacado: false,
    incluye: [
      '✔️ Todo lo del Completo',
      '✔️ Hoja de metadatos y hash',
      '✔️ Guía para peritaje',
    ],
  },
];

// Devuelve un plan validando que exista. Evita que alguien pida un plan inventado.
export function obtenerPlan(idPlan) {
  return PLANES.find((p) => p.id === idPlan);
}

export default PLANES;