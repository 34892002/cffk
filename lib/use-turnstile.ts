import { computed, nextTick, ref } from "vue";

type TurnstileConfig = { enabled: boolean; siteKey: string | null };
type TurnstileApi = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let configPromise: Promise<TurnstileConfig> | null = null;
let scriptPromise: Promise<void> | null = null;

function loadConfig() {
  if (!configPromise) {
    configPromise = fetch("/api/security/turnstile")
      .then((response) => response.json() as Promise<TurnstileConfig>)
      .catch((cause: unknown) => {
        configPromise = null;
        throw cause;
      });
  }
  return configPromise;
}

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = window.document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error("TURNSTILE_LOAD_FAILED"));
      };
      window.document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Shared Cloudflare Turnstile widget state. The site key endpoint and the
 * external script are cached per page load so multiple forms stay cheap.
 * When Turnstile is not configured the widget renders nothing and `enabled`
 * stays false, so callers can skip the token requirement.
 */
export function useTurnstile() {
  const element = ref<HTMLElement | null>(null);
  const siteKey = ref<string | null>(null);
  const token = ref("");
  const widgetId = ref<string | null>(null);
  const enabled = computed(() => Boolean(siteKey.value));
  let loadPromise: Promise<void> | null = null;

  async function render() {
    const config = await loadConfig();
    if (!config.enabled || !config.siteKey) return;
    siteKey.value = config.siteKey;
    await loadScript();
    await nextTick();
    if (!element.value || widgetId.value) return;
    widgetId.value = window.turnstile?.render(element.value, {
      sitekey: config.siteKey,
      callback: (value) => { token.value = value; },
      "expired-callback": () => { token.value = ""; },
    }) ?? null;
  }

  function load() {
    loadPromise ??= render().catch((cause: unknown) => {
      loadPromise = null;
      throw cause;
    });
    return loadPromise;
  }

  function reset() {
    token.value = "";
    if (widgetId.value) window.turnstile?.reset(widgetId.value);
  }

  function headers(): Record<string, string> {
    return token.value ? { "x-captcha-response": token.value } : {};
  }

  return { element, siteKey, token, enabled, load, reset, headers };
}