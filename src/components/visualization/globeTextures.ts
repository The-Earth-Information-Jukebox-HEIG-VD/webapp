/**
 * Globe textures, served from `public/textures/` (no CDN at runtime).
 * Both are NASA imagery from GIBS; sources and processing are documented in
 * `documentation/docs/appendix/image-sources.md` ("Globe textures").
 */

/** NASA Blue Marble Next Generation, true colour, 4096 x 2048 equirectangular. */
export const GLOBE_IMAGE_URL = '/textures/earth-blue-marble-ng.jpg';

/** Grayscale elevation (bump map) from NASA/METI ASTER GDEM, 2048 x 1024, ocean = 0. */
export const GLOBE_BUMP_URL = '/textures/earth-elevation-aster.png';
