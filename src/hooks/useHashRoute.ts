import { useEffect, useState } from 'react';

export type Route = 'home' | 'howto' | 'about';

function routeFromHash(hash: string): Route {
  if (hash === '#about') return 'about';
  if (hash === '#how-to-use') return 'howto';
  return 'home';
}

/**
 * Minimal hash-based router for the single-page app.
 *
 * `#about` shows the About page, `#how-to-use` the tutorial; any other hash (including `#home`, the bare `#`
 * used by the skip link and Home link) shows the main jukebox view.
 * Hash routing keeps browser Back/Forward working without a router dependency.
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

export default useHashRoute;
