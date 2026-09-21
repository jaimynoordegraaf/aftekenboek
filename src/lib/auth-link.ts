/**
 * Wat er in een link uit een Supabase-mail zit.
 *
 * Een herstellink komt terug als
 *
 *     aftekenboek://wachtwoord#access_token=…&refresh_token=…&type=recovery
 *
 * met de sleutels achter de `#`, omdat dit project de "implicit" flow gebruikt.
 * Met de PKCE-flow zou er `?code=…` staan; die wordt ook herkend, zodat een
 * instellingswijziging bij Supabase dit niet stilletjes breekt. En een
 * verlopen of al gebruikte link komt terug met `error_description` in plaats
 * van sleutels — die moet in beeld, niet genegeerd.
 */

export type AuthLink = {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  /** 'recovery' voor wachtwoord vergeten, 'signup' voor een bevestiging. */
  type?: string;
  error?: string;
};

export function parseAuthLink(url: string): AuthLink {
  const params = new URLSearchParams();

  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');

  if (queryAt !== -1) {
    const end = hashAt > queryAt ? hashAt : url.length;
    new URLSearchParams(url.slice(queryAt + 1, end)).forEach((v, k) => params.set(k, v));
  }
  // De fragmentwaarden winnen: daar zet Supabase de sleutels neer.
  if (hashAt !== -1) {
    new URLSearchParams(url.slice(hashAt + 1)).forEach((v, k) => params.set(k, v));
  }

  const error = params.get('error_description') ?? params.get('error') ?? undefined;

  return {
    accessToken: params.get('access_token') ?? undefined,
    refreshToken: params.get('refresh_token') ?? undefined,
    code: params.get('code') ?? undefined,
    type: params.get('type') ?? undefined,
    // Supabase zet spaties als plustekens in de beschrijving.
    error: error ? error.replace(/\+/g, ' ') : undefined,
  };
}

/** Is dit een link waar de app iets mee moet? */
export function isAuthLink(link: AuthLink): boolean {
  return Boolean(link.error || link.code || (link.accessToken && link.refreshToken));
}
