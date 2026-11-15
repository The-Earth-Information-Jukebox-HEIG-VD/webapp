import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './AboutPage.css';

/** Public technical documentation (MkDocs site of the `documentation` repository). */
export const DOCS_URL = 'https://the-earth-information-jukebox-heig-vd.github.io/documentation/';
const DOCS_TECH_URL = `${DOCS_URL}development/overview/`;

/** Datasets as played by the backend (sonification/music/orchestra.py ORCHESTRA). */
const INSTRUMENT_KEYS = ['temperature', 'co2', 'rain', 'snow', 'lightning', 'fires', 'nightLights'] as const;

/** Where each dataset comes from (datasets repository history and READMEs). */
const SOURCES: { key: string; name: string; href?: string }[] = [
  { key: 'gistemp', name: 'NASA GISTEMP v4', href: 'https://data.giss.nasa.gov/gistemp/' },
  { key: 'imerg', name: 'NASA GPM IMERG', href: 'https://gpm.nasa.gov/data/imerg' },
  { key: 'lis', name: 'ISS LIS (NASA SVS 5011)', href: 'https://svs.gsfc.nasa.gov/5011' },
  { key: 'modis', name: 'NASA MODIS active fires (FIRMS)', href: 'https://firms.modaps.eosdis.nasa.gov/' },
  { key: 'nightLights', name: 'NASA Earth at Night (SVS 5276)', href: 'https://svs.gsfc.nasa.gov/5276' },
  { key: 'co2', name: 'CO₂' },
  { key: 'naturalEarth', name: 'Natural Earth', href: 'https://www.naturalearthdata.com/' },
];

/** Link opening in a new tab, announced as such to screen reader users. */
function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> ({t('about.newTab')})</span>
    </a>
  );
}

/**
 * About page: what EarthChestra does, how data becomes music, where the data
 * comes from, a short technical overview with a link to the full
 * documentation, accessibility and team.
 *
 * Focus moves to the page heading on mount so keyboard and screen reader
 * users land at the start of the new content after navigating.
 */
export function AboutPage() {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <article className="about-page" aria-labelledby="about-title">
      <picture>
        <source srcSet="/logo-320.webp" type="image/webp" />
        <img className="about-logo" src="/logo-320.png" width={160} height={160} alt="" />
      </picture>
      <h1 id="about-title" className="about-title" ref={headingRef} tabIndex={-1}>
        {t('about.title')}
      </h1>
      <p className="about-lead">{t('about.intro')}</p>

      <section className="about-section" aria-labelledby="about-how">
        <h2 id="about-how">{t('about.howTitle')}</h2>
        <ol>
          <li>{t('about.howZone')}</li>
          <li>{t('about.howTracks')}</li>
          <li>{t('about.howPlay')}</li>
          <li>{t('about.howPitch')}</li>
          <li>{t('about.howLoudness')}</li>
          <li>{t('about.howGaps')}</li>
          <li>{t('about.howGlobe')}</li>
          <li>{t('about.howStyle')}</li>
          <li>{t('about.howVinyl')}</li>
        </ol>
      </section>

      <section className="about-section" aria-labelledby="about-orchestra">
        <h2 id="about-orchestra">{t('about.orchestraTitle')}</h2>
        <p>{t('about.orchestraText')}</p>
        <ul>
          {INSTRUMENT_KEYS.map((key) => (
            <li key={key}>{t(`about.instruments.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className="about-section" aria-labelledby="about-data">
        <h2 id="about-data">{t('about.dataTitle')}</h2>
        <p>{t('about.dataText')}</p>
        <ul>
          {SOURCES.map(({ key, name, href }) => (
            <li key={key}>
              {href ? <ExternalLink href={href}>{name}</ExternalLink> : <strong>{name}</strong>}
              {' — '}
              {t(`about.sources.${key}`)}
            </li>
          ))}
        </ul>
      </section>

      <section className="about-section" aria-labelledby="about-tech">
        <h2 id="about-tech">{t('about.techTitle')}</h2>
        <ul>
          <li>{t('about.techFrontend')}</li>
          <li>{t('about.techBackend')}</li>
          <li>{t('about.techData')}</li>
          <li>{t('about.techDeploy')}</li>
        </ul>
        <p>
          <ExternalLink href={DOCS_TECH_URL} className="about-doc-link">
            {t('about.docsLink')}
          </ExternalLink>
        </p>
      </section>

      <section className="about-section" aria-labelledby="about-a11y">
        <h2 id="about-a11y">{t('about.a11yTitle')}</h2>
        <p>{t('about.a11yText')}</p>
      </section>

      <section className="about-section" aria-labelledby="about-team">
        <h2 id="about-team">{t('about.teamTitle')}</h2>
        <p>{t('about.teamText')}</p>
        <p>{t('about.teamMembers')}</p>
      </section>

      <p>
        <a href="#home" className="about-back">
          {t('about.back')}
        </a>
      </p>
    </article>
  );
}

export default AboutPage;
