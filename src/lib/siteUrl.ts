/**
 * Absolute origin for links and callbacks that must resolve outside a
 * browser -- server-side fetches to our own API, email links, auth
 * redirects. NEXT_PUBLIC_SITE_URL isn't reliably configured in every
 * environment, and falling back to an empty string produces a relative
 * URL: harmless in a browser (resolves against the current page), but a
 * server-side fetch has no origin to resolve it against and throws
 * immediately -- which silently drops anything wrapped in a fire-and-forget
 * `.catch(() => {})`, as it did for the registration confirmation email.
 *
 * Mirrors the fallback already in layout.tsx's metadataBase, so every
 * absolute-URL callsite agrees on the same origin.
 */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://onepointbowl.com')
  );
}
