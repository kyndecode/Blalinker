type GoogleCredentialResponse = {
  credential?: string;
};

type PromptMomentNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  prompt: (listener?: (notification: PromptMomentNotification) => void) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let loadScriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In non disponible côté serveur'));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (loadScriptPromise) return loadScriptPromise;

  loadScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Chargement Google Sign-In impossible')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Chargement Google Sign-In impossible'));
    document.head.appendChild(script);
  });

  return loadScriptPromise;
}

export async function requestGoogleIdToken(clientId: string, timeoutMs = 15_000): Promise<string> {
  await loadGoogleScript();

  const googleAccounts = window.google?.accounts?.id;
  if (!googleAccounts) {
    throw new Error('Google Sign-In indisponible');
  }

  return new Promise((resolve, reject) => {
    let completed = false;

    const finish = (error: Error | null, token?: string) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // no-op
      }
      if (error) reject(error);
      else if (token) resolve(token);
      else reject(new Error('Google token manquant'));
    };

    const timeout = window.setTimeout(() => {
      finish(new Error('Délai dépassé pour Google Sign-In'));
    }, timeoutMs);

    googleAccounts.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (!response.credential) {
          finish(new Error('Aucun identifiant Google reçu'));
          return;
        }
        finish(null, response.credential);
      },
    });

    googleAccounts.prompt((notification) => {
      if (notification.isNotDisplayed?.()) {
        finish(new Error(`Google Sign-In indisponible (${notification.getNotDisplayedReason?.() || 'unknown'})`));
        return;
      }
      if (notification.isSkippedMoment?.()) {
        finish(new Error(`Google Sign-In annulé (${notification.getSkippedReason?.() || 'skipped'})`));
      }
    });
  });
}
