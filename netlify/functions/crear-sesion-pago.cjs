// netlify/functions/crear-sesion-pago.js
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANES = {
  lifetime: { nombre: 'ConvertirChat · Acceso Completo', importe: 999 }, // €9.99
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  const baseUrl = process.env.URL || 'http://localhost:8888';

  try {
    const { planId, email } = JSON.parse(event.body || '{}');
    const plan = PLANES[planId];

    if (!plan) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Plan no válido' })
      };
    }

    const sesion = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
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
      success_url: `${baseUrl}/exito.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?pago=cancelado`,
      metadata: { planId, email },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sesion.url }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No se pudo crear la sesión de pago' })
    };
  }
};