import Stripe from "stripe";

export const stripe = new Stripe(process.env.VAULT_STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export const PLAN_TO_PRICE_ID: Record<string, string> = {
  founding:    process.env.VAULT_STRIPE_PRICE_FOUNDING!,
  standard:    process.env.VAULT_STRIPE_PRICE_STANDARD!,
  multi_store: process.env.VAULT_STRIPE_PRICE_MULTI_STORE!,
};
