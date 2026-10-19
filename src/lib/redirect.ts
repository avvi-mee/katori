// Where to go once sign-in (and the profile load) finishes: invite links and the /coach sign-up start
// signed out. Per-device convenience only, so localStorage is fine and failures are ignored.
const KEY = 'katori-after-auth';

export function setAfterAuth(href: string) {
  try {
    globalThis.localStorage?.setItem(KEY, href);
  } catch {
    /* storage blocked */
  }
}

export function takeAfterAuth(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY) ?? null;
    if (v) globalThis.localStorage?.removeItem(KEY);
    // Only our own routes.
    return v && /^\/((join|r|c)\/[A-Z0-9]{8}|coach)$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
