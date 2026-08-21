// src/stripe.js
// Este archivo se encarga de arrancar Stripe una sola vez en toda la web.
import { loadStripe } from "@stripe/stripe-js";

// Leemos la clave publicable desde el archivo .env (nunca la escribimos aquí a mano).
const clavePublicable = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Comprobación de seguridad: si falta la clave, avisamos claramente en la consola.
if (!clavePublicable) {
  console.error(
    "⚠️ Falta VITE_STRIPE_PUBLISHABLE_KEY en el archivo .env. " +
    "Revisa que el archivo .env existe y que reiniciaste el servidor."
  );
}

// loadStripe devuelve una "promesa": Stripe se prepara por detrás.
// Lo exportamos para poder usarlo desde el resto de la web.
export const stripePromise = loadStripe(clavePublicable);
