import { AsyncLocalStorage } from 'async_hooks';

/**
 * Contexte de la requête en cours (identifiant de corrélation), propagé à travers les
 * appels asynchrones : chaque ligne de journal émise pendant la requête porte le même
 * `requestId`, renvoyé aussi au client dans l'en-tête X-Request-Id.
 */
interface RequestContext { requestId: string }

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
