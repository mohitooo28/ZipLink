import "server-only";
import { getServerConfig } from "./config";
import { SessionService } from "./session-service";
import { SignalHub } from "./signal-hub";

interface ZipLinkRuntime {
  hub: SignalHub;
  sessions: SessionService;
}

// Kept on globalThis so dev-mode module reloads share one instance.
const globalForRuntime = globalThis as typeof globalThis & { __ziplinkRuntime?: ZipLinkRuntime };

export function getRuntime(): ZipLinkRuntime {
  if (!globalForRuntime.__ziplinkRuntime) {
    const hub = new SignalHub();
    globalForRuntime.__ziplinkRuntime = {
      hub,
      sessions: new SessionService({ config: getServerConfig(), hub }),
    };
  }
  return globalForRuntime.__ziplinkRuntime;
}
