import { useEffect, useState } from 'react';
import type { SectionKey, SectionPayload } from '../types';
import { fetchSection, getCachedSection } from '../api';

export function useSection(key: SectionKey, refreshMs = 60_000) {
  // Seed from module cache synchronously so navigation is instant.
  const seed = getCachedSection(key);
  const [data, setData] = useState<SectionPayload | null>(seed?.data ?? null);
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    const cached = getCachedSection(key);
    if (cached) setData(cached.data);
    // Only show loading if we have no data at all. Otherwise revalidate silently.
    const showLoader = !cached;

    // When the user clicks refresh, reloadKey increments — that should force
    // the server cache to drop too, not just re-fetch the same cached payload.
    const force = reloadKey > 0;

    const load = async () => {
      if (showLoader) setLoading(true);
      try {
        const payload = await fetchSection(key, force);
        if (!live) return;
        setData(payload);
        setError(null);
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    };

    // If cache is fresh AND the user didn't click refresh, skip the revalidate.
    if (cached?.fresh && !force) {
      setLoading(false);
    } else {
      load();
    }

    const id = setInterval(() => {
      // Periodic background refresh doesn't need to bust the cache.
      fetchSection(key).then(p => live && setData(p)).catch(() => void 0);
    }, refreshMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [key, refreshMs, reloadKey]);

  return {
    data,
    loading,
    error,
    refresh: () => setReloadKey(k => k + 1),
  };
}
