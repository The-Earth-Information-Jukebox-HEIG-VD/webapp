import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './AboutPage.css';

/**
 * About page explaining the project, the sonification mapping and data sources.
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
      <h1 id="about-title" className="about-title" ref={headingRef} tabIndex={-1}>
        {t('about.title')}
      </h1>
      <p className="about-lead">{t('about.intro')}</p>

      <section className="about-section" aria-labelledby="about-how">
        <h2 id="about-how">{t('about.howTitle')}</h2>
        <p>{t('about.howText')}</p>
        <ul>
          <li>{t('about.howWarmer')}</li>
          <li>{t('about.howCooler')}</li>
          <li>{t('about.howTracks')}</li>
        </ul>
      </section>

      <section className="about-section" aria-labelledby="about-data">
        <h2 id="about-data">{t('about.dataTitle')}</h2>
        <p>{t('about.dataText')}</p>
        <ul>
          <li>
            <a href="https://data.giss.nasa.gov/gistemp/" target="_blank" rel="noopener noreferrer">
              NASA GISTEMP
            </a>{' '}
            — {t('about.dataGistemp')}
          </li>
          <li>
            <a href="https://svs.gsfc.nasa.gov/" target="_blank" rel="noopener noreferrer">
              NASA Scientific Visualization Studio (SVS)
            </a>{' '}
            — {t('about.dataSvs')}
          </li>
          <li>
            <a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener noreferrer">
              NASA POWER
            </a>{' '}
            — {t('about.dataPower')}
          </li>
        </ul>
      </section>

      <section className="about-section" aria-labelledby="about-a11y">
        <h2 id="about-a11y">{t('about.a11yTitle')}</h2>
        <p>{t('about.a11yText')}</p>
      </section>

      <section className="about-section" aria-labelledby="about-team">
        <h2 id="about-team">{t('about.teamTitle')}</h2>
        <p>{t('about.teamText')}</p>
      </section>

      <p>
        <a href="#main-content" className="about-back">
          {t('about.back')}
        </a>
      </p>
    </article>
  );
}

export default AboutPage;
