// Verifica en el servidor si una sesión de Stripe Checkout está realmente pagada.
// Solo devuelve un booleano: nunca datos del cliente, del importe ni de la tarjeta.

const CLAVE_SECRETA = process.env.STRIPE_SECRET_KEY;

const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  // Impide que el navegador o un proxy cachee un "pagado: true" y lo reutilice.
  'Cache-Control': 'no-store'
};

/** Construye una respuesta JSON con las cabeceras correctas. */
function respuesta(codigo, cuerpo) {
  return {
    statusCode: codigo,
    headers: CABECERAS,
    body: JSON.stringify(cuerpo)
  };
}

exports.handler = async (event) => {
  // 1. Solo lectura: cualquier otro método se rechaza.
  if (event.httpMethod !== 'GET') {
    return respuesta(405, { pagado: false, error: 'Método no permitido' });
  }

  // 2. Sin clave no se puede consultar nada. Se comprueba aquí (y no al cargar
  //    el módulo) para que un despliegue mal configurado devuelva un error
  //    legible en vez de tumbar la función entera.
  if (!CLAVE_SECRETA) {
    console.error('Falta STRIPE_SECRET_KEY en las variables de entorno');
    return respuesta(500, { pagado: false, error: 'Configuración incompleta del servidor' });
  }

  // 3. Validación del identificador antes de llamar a Stripe.
  //    Las sesiones de Checkout siempre empiezan por "cs_".
  const sessionId = event.queryStringParameters?.session_id?.trim();
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return respuesta(400, { pagado: false, error: 'Identificador de sesión no válido' });
  }

  try {
    const stripe = require('stripe')(CLAVE_SECRETA);
    const sesion = await stripe.checkout.sessions.retrieve(sessionId);

    // 4. Doble condición: la sesión se completó Y el cobro se hizo efectivo.
    const pagado = sesion.status === 'complete' && sesion.payment_status === 'paid';

        return respuesta(200, {
      pagado,
      // El nombre debe coincidir con metadata: { planId } de crear-sesion-pago.cjs
      planId: pagado ? (sesion.metadata?.planId ?? null) : null
    });
  } catch (error) {
    // Sesión inexistente o de otra cuenta: no es un fallo nuestro.
    if (error?.type === 'StripeInvalidRequestError') {
      return respuesta(404, { pagado: false, error: 'Sesión no encontrada' });
    }
    console.error('Error al verificar el pago:', error);
    return respuesta(502, { pagado: false, error: 'No se pudo verificar el pago' });
  }
};