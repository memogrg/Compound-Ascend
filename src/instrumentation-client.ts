// Sentry (navegador). Inerte sin NEXT_PUBLIC_SENTRY_DSN. Session replay solo
// cuando hay error (barato). Ver F7.
import * as Sentry from "@sentry/nextjs";
import { COMMON_INIT } from "@/lib/observability/sentry-options";

Sentry.init({
  ...COMMON_INIT,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
