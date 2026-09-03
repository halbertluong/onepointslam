-- All tenants share one platform Stripe account (STRIPE_SECRET_KEY). There is
-- no per-tenant Stripe Connect onboarding flow in this app, so this column was
-- always null and the admin UI's "No Stripe" badge was a false alarm for every
-- tenant. Money is reconciled per tenant/tournament/registrant via PaymentIntent
-- metadata instead (see src/lib/stripe.ts and the payments API routes).
alter table tenants drop column if exists stripe_connect_account_id;
