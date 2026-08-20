export const IMPERSONATOR_COOKIE = 'impersonator_session';

export type ImpersonatorPayload = {
  refresh_token: string;
  email: string | undefined;
};

export function decodeImpersonatorCookie(raw: string | undefined): ImpersonatorPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
