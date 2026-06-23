/**
 * msg91BridgeMock — fakes the admin-service MSG91 OTP bridge that the buyer-app
 * auth store calls over HTTP:
 *
 *   POST {API}/api/admin/auth/otp/send    → { success, code? }
 *   POST {API}/api/admin/auth/otp/verify  → { success, data:{ session, userId }, code? }
 *
 * Installs a `global.fetch` implementation that routes by URL + path and returns
 * the configured outcome. NO real OTP/SMS ever fires. Mirrors the live response
 * shapes the store branches on (OTP_INVALID, RATE_LIMITED, OTP_NOT_CONFIGURED).
 */

export interface BridgeConfig {
  // OTP send outcome
  send?: { success: boolean; code?: string; error?: string };
  // OTP verify outcome
  verify?:
    | {
        success: true;
        data: {
          session: { access_token: string; refresh_token: string };
          userId: string;
        };
      }
    | { success: false; code?: string; error?: string };
}

const DEFAULTS: Required<Pick<BridgeConfig, 'send' | 'verify'>> = {
  send: { success: true },
  verify: {
    success: true,
    data: {
      session: { access_token: 'access-tok-123', refresh_token: 'refresh-tok-456' },
      userId: 'user-test-id',
    },
  },
};

/** Track every call so tests can assert phone/otp payloads were sent correctly. */
export const bridgeCalls: { url: string; body: any }[] = [];

export function installMsg91BridgeMock(config: BridgeConfig = {}) {
  bridgeCalls.length = 0;
  const send = config.send ?? DEFAULTS.send;
  const verify = config.verify ?? DEFAULTS.verify;

  (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    bridgeCalls.push({ url, body });

    if (url.endsWith('/api/admin/auth/otp/send')) {
      return jsonResponse(send);
    }
    if (url.endsWith('/api/admin/auth/otp/verify')) {
      return jsonResponse(verify);
    }
    throw new Error(`[TEST GUARD] Unexpected fetch to ${url}`);
  });
}

function jsonResponse(payload: any) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}
