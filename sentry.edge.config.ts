// Sentry (edge/middleware). Inerte sin NEXT_PUBLIC_SENTRY_DSN. Ver F7.
import * as Sentry from "@sentry/nextjs";
import { COMMON_INIT } from "@/lib/observability/sentry-options";

Sentry.init({ ...COMMON_INIT });
