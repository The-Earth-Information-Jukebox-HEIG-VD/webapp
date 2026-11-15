import { useCallback, useEffect, useState } from 'react';
import { fetchGenres, isAbortError, type Genre } from '../services/sonificationApi';
import { useLocalStorageString } from './useLocalStorageString';

export const MUSIC_STYLE_STORAGE_KEY = 'earth-jukebox-music-style';
export const FALLBACK_GENRE = 'orchestra';

/**
 * The chosen music style (GET /api/genres), shared by zone and vinyl mode and
 * remembered between visits. The saved id is validated against the server's list;
 * an unknown one falls back to the server's default. While the list is not
 * known (or when the server has no /api/genres, an older backend) `genre` is
 * undefined and no style is sent. reload() fetches the list again (App calls it
 * when the track list loads after a failure, so a backend that came up late, or a
 * Retry, brings the selector back without reloading the page).
 */
export function useMusicStyle() {
  const [saved, save] = useLocalStorageString(MUSIC_STYLE_STORAGE_KEY);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [defaultId, setDefaultId] = useState(FALLBACK_GENRE);
  const [attempt, setAttempt] = useState(0);
  /** The last GET /api/genres failed (not just "still loading") */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchGenres(controller.signal)
      .then((res) => {
        setGenres(res.genres ?? []);
        setFailed(false);
        if (res.default) setDefaultId(res.default);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setGenres([]);
        setFailed(true);
        if (import.meta.env.DEV) {
          // The selector hides itself without a list: say why (e.g. an old backend image without /api/genres)
          console.warn('Music style selector hidden: GET /api/genres failed', err);
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const known = genres.length > 0;
  const genre: string | undefined = !known
    ? undefined
    : saved && genres.some((g) => g.id === saved)
      ? saved
      : genres.some((g) => g.id === defaultId)
        ? defaultId
        : genres[0].id;

  const setGenre = useCallback((id: string) => save(id), [save]);

  return { genres, genre, setGenre, failed, reload };
}

export default useMusicStyle;
