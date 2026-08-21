// netlify/functions/crear-sesion-pago.js
// ============================================================
//  Crea una sesión de Stripe Checkout para ChataPDF.
//  - La clave SECRETA vive SOLO aquí (variable de entorno).
//  - Los precios se fijan en el SERVIDOR: el navegador solo
//    manda el "planId", jamás el importe. Así es imposible
//    manipular el precio desde el cliente.
// ============================================================
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Precios en CÉNTIMOS (fuente de verdad del importe).
const PLANES = {
  basico:   { nombre: 'ChataPDF · Básico',     importe: 299 },
  completo: { nombre: 'ChataPDF · Completo',   importe: 999 },
  legal:    { nombre: 'ChataPDF · Legal Pack', importe: 1799 },
};

exports.handler = async (event) => {
  // Solo aceptamos POST.
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  // La URL base del sitio (para volver tras el pago).
  const baseUrl = process.env.URL || 'http://localhost:8888';

  try {
    const { planId } = JSON.parse(event.body || '{}');
    const plan = PLANES[planId];

    if (!plan) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Plan no válido' }) };
    }

    const sesion = await stripe.checkout.sessions.create({
      mode: 'payment', // pago único, sin suscripción
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: plan.nombre },
            unit_amount: plan.importe,
          },
          quantity: 1,
        },
      ],
      // A dónde vuelve el usuario según el resultado.
      success_url: `${baseUrl}/exito.html?plan=${encodeURIComponent(planId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?pago=cancelado`,
      metadata: { planId },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sesion.url }),
    };
  } catch (error) {
    console.error('Error creando la sesión de pago:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No se pudo crear la sesión de pago' }),
    };
  }
};