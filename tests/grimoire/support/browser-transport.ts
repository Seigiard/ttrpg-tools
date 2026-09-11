import type { Page as BrowserPage } from '@playwright/test';

const TRANSPORT_KEY = '__grimoireTest';

interface MountFailure {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

type BrowserTransportState<Surface> =
  | { readonly status: 'mounting'; readonly sessionId: string }
  | { readonly status: 'ready'; readonly sessionId: string; readonly surface: Surface }
  | { readonly status: 'failed'; readonly sessionId: string; readonly error: MountFailure };

type TransportWindow<Surface> = Window & {
  [TRANSPORT_KEY]?: BrowserTransportState<Surface>;
};

type OperationInput<Operation> = Operation extends (input: infer Input) => unknown ? Input : never;
type OperationResult<Operation> = Operation extends (...args: never[]) => infer Result
  ? Awaited<Result>
  : never;

function serializeError(error: unknown): MountFailure {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return { name: 'Error', message: String(error) };
}

export function mountBrowserTransport<Surface>(mount: () => Surface | Promise<Surface>): void {
  const hostWindow = window as TransportWindow<Surface>;
  const sessionId = crypto.randomUUID();
  hostWindow[TRANSPORT_KEY] = { status: 'mounting', sessionId };

  void Promise.resolve()
    .then(mount)
    .then(
      (surface) => {
        hostWindow[TRANSPORT_KEY] = { status: 'ready', sessionId, surface };
      },
      (error: unknown) => {
        hostWindow[TRANSPORT_KEY] = {
          status: 'failed',
          sessionId,
          error: serializeError(error),
        };
      },
    );
}

export interface BrowserTransport<Surface> {
  call<Name extends keyof Surface & string>(
    operation: Name,
    input: OperationInput<Surface[Name]>,
  ): Promise<OperationResult<Surface[Name]>>;
}

export async function connectBrowserTransport<Surface>(
  browserPage: BrowserPage,
  hostUrl: string,
): Promise<BrowserTransport<Surface>> {
  await browserPage.goto(hostUrl);
  await browserPage.waitForFunction((key) => {
    const state = (window as TransportWindow<unknown>)[key as typeof TRANSPORT_KEY];
    return state?.status === 'ready' || state?.status === 'failed';
  }, TRANSPORT_KEY);

  const handshake = await browserPage.evaluate((key) => {
    const state = (window as TransportWindow<unknown>)[key as typeof TRANSPORT_KEY];
    if (state?.status === 'failed') return { sessionId: state.sessionId, error: state.error };
    if (state?.status === 'ready') return { sessionId: state.sessionId };
    throw new Error(`Browser test surface is ${state?.status ?? 'missing'}`);
  }, TRANSPORT_KEY);

  if (handshake.error !== undefined) {
    const error = new Error(handshake.error.message);
    error.name = handshake.error.name;
    if (handshake.error.stack !== undefined) error.stack = handshake.error.stack;
    throw error;
  }

  return {
    async call(operation, input) {
      return browserPage.evaluate(
        async ({ key, sessionId, operation, input }) => {
          type RuntimeSurface = Record<string, (input: unknown) => unknown>;
          const state = (window as TransportWindow<RuntimeSurface>)[key as typeof TRANSPORT_KEY];

          if (state?.status !== 'ready') {
            throw new Error(`Browser test surface is ${state?.status ?? 'missing'}`);
          }
          if (state.sessionId !== sessionId) {
            throw new Error('Browser test session expired after navigation');
          }

          const implementation = state.surface[operation];
          if (implementation === undefined)
            throw new Error(`Unknown browser test operation: ${operation}`);
          return implementation(input);
        },
        { key: TRANSPORT_KEY, sessionId: handshake.sessionId, operation, input },
      ) as Promise<OperationResult<Surface[typeof operation]>>;
    },
  };
}
