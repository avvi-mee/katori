import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from './api';
import { captureError } from './sentry';

import { idbStorage } from './storage';

const WEEK = 7 * 24 * 3600_000;

// Designed error codes (quota, bad photo, offline…) are expected; anything else goes to Sentry.
const report = (e: unknown) => {
  if (!(e instanceof ApiError) || e.code === 'INTERNAL') captureError(e);
};

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2, gcTime: WEEK } },
  queryCache: new QueryCache({ onError: report }),
  mutationCache: new MutationCache({ onError: report }),
});

/** Today's meals, targets and the dish table survive reloads and offline launches (IndexedDB). */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (k: string) => (await idbStorage.getItem(k)) as string | null,
    setItem: async (k: string, v: string) => void (await idbStorage.setItem(k, v)),
    removeItem: async (k: string) => void (await idbStorage.removeItem(k)),
  },
  key: 'katori-query-cache',
  throttleTime: 1000,
});

export const persistOptions = {
  persister,
  maxAge: WEEK,
  buster: 'v1',
  dehydrateOptions: {
    // Billing state is always read fresh; only successful queries are persisted.
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === 'success' && q.queryKey[0] !== 'subscription',
  },
};
