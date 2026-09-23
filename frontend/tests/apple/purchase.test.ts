import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LICENSE_ALREADY_EXISTS, purchaseApp } from '../../src/apple/purchase';
import { appleRequest } from '../../src/apple/request';
import { buildPlist } from '../../src/apple/plist';
import type { Account, Software } from '../../src/types';

vi.mock('../../src/apple/request', () => ({ appleRequest: vi.fn() }));

const account = {
  email: 'test@example.com',
  password: 'secret',
  appleId: 'test@example.com',
  store: '143465',
  passwordToken: 'token',
  directoryServicesIdentifier: 'test-dsid',
  deviceIdentifier: 'test-device',
  pod: '6',
  cookies: [],
} as unknown as Account;

const app = { id: 989673964, name: 'Test App', price: 0 } as unknown as Software;

const response = (body: string, status = 200) => ({
  status,
  body,
  statusText: '',
  headers: {},
  rawHeaders: [] as [string, string][],
});

const sentBody = (call: number) =>
  String(vi.mocked(appleRequest).mock.calls[call][0].body ?? '');

beforeEach(() => {
  vi.mocked(appleRequest).mockReset();
});

describe('purchaseApp license outcomes', () => {
  // Apple answers an already-owned app with 5002 plus a generic message. It
  // used to surface as "An unknown error has occurred (5002)", which read as a
  // failure even though the account could already download the app.
  it('treats 5002 as an already-owned account rather than a failure', async () => {
    vi.mocked(appleRequest).mockResolvedValue(
      response(
        buildPlist({
          failureType: LICENSE_ALREADY_EXISTS,
          customerMessage: 'An unknown error has occurred.',
        }),
      ),
    );

    await expect(purchaseApp(account, app)).resolves.toMatchObject({
      alreadyOwned: true,
    });
    expect(appleRequest).toHaveBeenCalledTimes(1);
  });

  it('treats an empty HTTP 500 as the same already-owned condition', async () => {
    vi.mocked(appleRequest).mockResolvedValue(response('', 500));

    await expect(purchaseApp(account, app)).resolves.toMatchObject({
      alreadyOwned: true,
    });
  });

  it('does not swallow a real HTTP 500 that carries a body', async () => {
    vi.mocked(appleRequest).mockResolvedValue(response('<html>oops</html>', 500));

    await expect(purchaseApp(account, app)).rejects.toThrow(/HTTP 500/);
  });

  it('reports a fresh purchase as not already owned', async () => {
    vi.mocked(appleRequest).mockResolvedValue(
      response(buildPlist({ jingleDocType: 'purchaseSuccess', status: 0 })),
    );

    await expect(purchaseApp(account, app)).resolves.toMatchObject({
      alreadyOwned: false,
    });
  });
});

describe('purchaseApp failure mapping', () => {
  it.each(['2034', '2042', '2059'])(
    'still surfaces %s as a real failure with its code',
    async (failureType) => {
      vi.mocked(appleRequest).mockResolvedValue(
        response(buildPlist({ failureType })),
      );

      await expect(purchaseApp(account, app)).rejects.toMatchObject({
        code: failureType,
      });
    },
  );

  it('retries an unavailable item with the Arcade pricing parameter', async () => {
    vi.mocked(appleRequest)
      .mockResolvedValueOnce(response(buildPlist({ failureType: '2059' })))
      .mockResolvedValueOnce(
        response(buildPlist({ jingleDocType: 'purchaseSuccess', status: 0 })),
      );

    await expect(purchaseApp(account, app)).resolves.toMatchObject({
      alreadyOwned: false,
    });
    expect(sentBody(0)).toContain('STDQ');
    expect(sentBody(1)).toContain('GAME');
  });

  it('keeps the failure code in the message when Apple explains nothing', async () => {
    vi.mocked(appleRequest).mockResolvedValue(
      response(buildPlist({ failureType: '9610' })),
    );

    await expect(purchaseApp(account, app)).rejects.toThrow(/9610/);
  });

  it('prefers dialog.explanation over the generic customer message', async () => {
    vi.mocked(appleRequest).mockResolvedValue(
      response(
        buildPlist({
          failureType: '9610',
          customerMessage: 'An unknown error has occurred.',
          dialog: { explanation: 'Account needs verification.' },
        }),
      ),
    );

    await expect(purchaseApp(account, app)).rejects.toThrow(
      /Account needs verification\. \(9610\)/,
    );
  });
});
