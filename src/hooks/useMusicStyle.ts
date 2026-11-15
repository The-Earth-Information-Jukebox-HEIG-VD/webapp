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
 * undefined and no style is sent.
 */
export function useMusicStyle() {
  const [saved, save] = useLocalStorageString(MUSIC_STYLE_STORAGE_KEY);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [defaultId, setDefaultId] = useState(FALLBACK_GENRE);

  useEffect(() => {
    const controller = new AbortController();
    fetchGenres(controller.signal)
      .then((res) => {
        setGenres(res.genres ?? []);
        if (res.default) setDefaultId(res.default);
      })
      .catch((err) => {
        if (!isAbortError(err)) setGenres([]);
      });
    return () => controller.abort();
  }, []);

  const known = genres.length > 0;
  const genre: string | undefined = !known
    ? undefined
    : saved && genres.some((g) => g.id === saved)
      ? saved
      : genres.some((g) => g.id === defaultId)
        ? defaultId
        : genres[0].id;

  const setGenre = useCallback((id: string) => save(id), [save]);

  return { genres, genre, setGenre };
}

export default useMusicStyle;
