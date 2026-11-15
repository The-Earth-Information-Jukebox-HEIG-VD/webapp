import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './HowToPage.css';

/** 24 x 24 line icons (stroke = currentColor). Decorative: the text next to them says the same. */
const ICONS = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  sounds: <path d="M4 20V10M9 20V4M14 20v-8M19 20V7" />,
  play: <path d="M8 5l11 7-11 7z" />,
  spots: (
    <>
      <circle cx="8" cy="9" r="3.5" />
      <circle cx="16.5" cy="7" r="1.8" />
      <circle cx="15" cy="16" r="2.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  timeline: (
    <>
      <path d="M3 12h18" />
      <circle cx="9" cy="12" r="2.5" />
    </>
  ),
  chart: <path d="M4 4v16h16M7 15l4-5 3 3 5-6" />,
  repeat: (
    <>
      <path d="M4 11V9a3 3 0 013-3h12l-3-3M20 13v2a3 3 0 01-3 3H5l3 3" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  record: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  note: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  theme: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 000 16z" />
    </>
  ),
  language: (
    <>
      <path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5.5 7M11 5c-.6 3.4-3 6.4-6.5 8" />
      <path d="M13 21l4-9 4 9M14.5 18h5" />
    </>
  ),
} as const;

type IconName = keyof typeof ICONS;

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="howto-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Small legend pictures for "Read the music" (decorative, the caption carries the meaning). */
const LEGENDS: Record<string, ReactNode> = {
  // Notes climbing
  pitch: (
    <>
      <circle className="howto-mark" cx="10" cy="34" r="4" />
      <circle className="howto-mark" cx="26" cy="26" r="4" />
      <circle className="howto-mark" cx="42" cy="18" r="4" />
      <circle className="howto-mark" cx="58" cy="10" r="4" />
    </>
  ),
  // Bars growing
  loud: (
    <>
      <rect className="howto-mark" x="6" y="30" width="8" height="10" rx="1" />
      <rect className="howto-mark" x="22" y="22" width="8" height="18" rx="1" />
      <rect className="howto-mark" x="38" y="14" width="8" height="26" rx="1" />
      <rect className="howto-mark" x="54" y="4" width="8" height="36" rx="1" />
    </>
  ),
  // Beats getting closer together
  tempo: (
    <>
      {[4, 22, 36, 47, 55, 61].map((x) => (
        <rect key={x} className="howto-mark" x={x} y="12" width="3" height="20" rx="1" />
      ))}
    </>
  ),
  // A rest: a gap in the line of notes
  silence: (
    <>
      <circle className="howto-mark" cx="8" cy="22" r="4" />
      <circle className="howto-mark" cx="22" cy="22" r="4" />
      <path className="howto-line howto-dash" d="M30 22h12" />
      <circle className="howto-mark" cx="50" cy="22" r="4" />
      <circle className="howto-mark" cx="62" cy="22" r="4" />
    </>
  ),
  // Spots of growing size
  spots: (
    <>
      <circle className="howto-mark" cx="8" cy="22" r="3" />
      <circle className="howto-mark" cx="24" cy="22" r="6" />
      <circle className="howto-mark" cx="48" cy="22" r="11" />
    </>
  ),
  // Filled vs ring
  ring: (
    <>
      <circle className="howto-warm" cx="18" cy="22" r="10" />
      <circle className="howto-cool" cx="50" cy="22" r="9" />
    </>
  ),
};

const QUICK: { key: string; icon: IconName }[] = [
  { key: 'zone', icon: 'globe' },
  { key: 'sounds', icon: 'sounds' },
  { key: 'play', icon: 'play' },
  { key: 'watch', icon: 'spots' },
];

const READ = ['pitch', 'loud', 'tempo', 'silence', 'spots', 'ring'] as const;

const EXPLORE: { key: string; icon: IconName }[] = [
  { key: 'date', icon: 'calendar' },
  { key: 'timeline', icon: 'timeline' },
  { key: 'graph', icon: 'chart' },
  { key: 'months', icon: 'repeat' },
  { key: 'events', icon: 'flag' },
];

/** Key events, in the order you use them */
const EVENT_STEPS: { key: string; icon: IconName }[] = [
  { key: 'find', icon: 'flag' },
  { key: 'play', icon: 'play' },
  { key: 'listen', icon: 'sounds' },
];

/** What each key event card shows: [term key, its explanation] (KeyMomentCard.tsx) */
const EVENT_CARD = ['sound', 'place', 'data', 'when'] as const;

const CUSTOM: { key: string; icon: IconName }[] = [
  { key: 'style', icon: 'note' },
  { key: 'view', icon: 'list' },
  { key: 'theme', icon: 'theme' },
  { key: 'language', icon: 'language' },
];

/** Shortcuts as handled by AudioPlayerEnhanced.tsx (zones), usePlayerShortcuts.ts (vinyl), GlobeView.tsx (Escape) and Timeline.tsx. */
const KEYS: { keys: string[][]; label: string }[] = [
  { keys: [['Space']], label: 'space' },
  { keys: [['←'], ['→']], label: 'arrows' },
  { keys: [['Home'], ['End']], label: 'homeEnd' },
  { keys: [['M']], label: 'm' },
  { keys: [['Esc']], label: 'escape' },
  { keys: [['Shift', '←'], ['Shift', '→']], label: 'shiftArrows' },
  { keys: [['Page Up'], ['Page Down']], label: 'pageUpDown' },
];

/** Translation keys of the spoken names of the arrow glyphs (Home, Esc… are printed on keyboards as is). */
const ARROW_NAMES: Record<string, string> = { '←': 'keys.left', '→': 'keys.right' };

/**
 * "How to use" page: a short visual tutorial of every feature, what to do and
 * what it shows. Focus moves to the heading on mount, as on the About page.
 */
export function HowToPage() {
  const { t } = useTranslation('howto');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  const shows = (text: string) => (
    <p className="howto-shows">
      <span className="howto-shows-label">{t('showsLabel')}</span> {text}
    </p>
  );

  return (
    <article className="howto-page" aria-labelledby="howto-title">
      <h1 id="howto-title" className="howto-title" ref={headingRef} tabIndex={-1}>
        {t('title')}
      </h1>
      <p className="howto-lead">{t('lead')}</p>

      <section className="howto-section" aria-labelledby="howto-quick">
        <h2 id="howto-quick">{t('quick.title')}</h2>
        <ol className="howto-grid howto-steps">
          {QUICK.map(({ key, icon }, i) => (
            <li key={key} className="howto-card">
              <div className="howto-card-head">
                <span className="howto-step-number" aria-hidden="true">{i + 1}</span>
                <Icon name={icon} />
              </div>
              <h3>{t(`quick.${key}.title`)}</h3>
              <p>{t(`quick.${key}.text`)}</p>
              {shows(t(`quick.${key}.shows`))}
            </li>
          ))}
        </ol>
      </section>

      <section className="howto-section" aria-labelledby="howto-read">
        <h2 id="howto-read">{t('read.title')}</h2>
        <ul className="howto-grid howto-legend">
          {READ.map((key) => (
            <li key={key} className="howto-legend-item">
              <svg className="howto-legend-art" viewBox="0 0 68 44" width="68" height="44" aria-hidden="true" focusable="false">
                {LEGENDS[key]}
              </svg>
              <div>
                <h3>{t(`read.${key}.title`)}</h3>
                <p>{t(`read.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="howto-section" aria-labelledby="howto-explore">
        <h2 id="howto-explore">{t('explore.title')}</h2>
        <p className="howto-note">{t('explore.note')}</p>
        <ul className="howto-grid howto-explore">
          {EXPLORE.map(({ key, icon }) => (
            <li key={key} className="howto-card">
              <div className="howto-card-head">
                <Icon name={icon} />
                <h3>{t(`explore.${key}.title`)}</h3>
              </div>
              <p>{t(`explore.${key}.text`)}</p>
              {shows(t(`explore.${key}.shows`))}
            </li>
          ))}
        </ul>
      </section>

      <section className="howto-section" aria-labelledby="howto-events">
        <h2 id="howto-events">{t('events.title')}</h2>
        <p className="howto-note">{t('events.note')}</p>
        <ol className="howto-grid howto-steps">
          {EVENT_STEPS.map(({ key, icon }, i) => (
            <li key={key} className="howto-card">
              <div className="howto-card-head">
                <span className="howto-step-number" aria-hidden="true">{i + 1}</span>
                <Icon name={icon} />
              </div>
              <h3>{t(`events.${key}.title`)}</h3>
              <p>{t(`events.${key}.text`)}</p>
              {shows(t(`events.${key}.shows`))}
            </li>
          ))}
        </ol>

        <h3 className="howto-subheading">{t('events.cardTitle')}</h3>
        <dl className="howto-travel howto-event-card">
          {EVENT_CARD.map((k) => (
            <div key={k}>
              <dt>{t(`events.card.${k}`)}</dt>
              <dd>{t(`events.card.${k}Text`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="howto-section" aria-labelledby="howto-modes">
        <h2 id="howto-modes">{t('modes.title')}</h2>
        <ul className="howto-grid howto-modes">
          <li className="howto-card">
            <div className="howto-card-head">
              <Icon name="globe" />
              <h3>{t('modes.zones.title')}</h3>
            </div>
            <p className="howto-tagline">{t('modes.zones.tagline')}</p>
            <p>{t('modes.zones.text')}</p>
          </li>
          <li className="howto-card">
            <div className="howto-card-head">
              <Icon name="record" />
              <h3>{t('modes.vinyl.title')}</h3>
            </div>
            <p className="howto-tagline">{t('modes.vinyl.tagline')}</p>
            <p>{t('modes.vinyl.text')}</p>
            <p className="howto-travel-label">{t('modes.vinyl.travelLabel')}</p>
            <dl className="howto-travel">
              {(['space', 'time', 'both'] as const).map((k) => (
                <div key={k}>
                  <dt>{t(`common:vinyl.travel${k[0].toUpperCase()}${k.slice(1)}`)}</dt>
                  <dd>{t(`modes.vinyl.${k}`)}</dd>
                </div>
              ))}
            </dl>
          </li>
        </ul>
      </section>

      <section className="howto-section" aria-labelledby="howto-custom">
        <h2 id="howto-custom">{t('custom.title')}</h2>
        <ul className="howto-grid howto-compact">
          {CUSTOM.map(({ key, icon }) => (
            <li key={key} className="howto-compact-item">
              <Icon name={icon} />
              <div>
                <h3>{t(`custom.${key}.title`)}</h3>
                <p>{t(`custom.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="howto-section" aria-labelledby="howto-keys">
        <h2 id="howto-keys">{t('keys.title')}</h2>
        <dl className="howto-keys">
          {KEYS.map(({ keys, label }) => (
            <div key={label} className="howto-key-row">
              <dt>
                {keys.map((combo, i) => (
                  <span key={i} className="howto-combo">
                    {i > 0 && <span aria-hidden="true"> / </span>}
                    {combo.map((k, j) => (
                      <span key={k}>
                        {j > 0 && ' + '}
                        <kbd>
                          {ARROW_NAMES[k] ? (
                            <>
                              <span aria-hidden="true">{k}</span>
                              <span className="sr-only">{t(ARROW_NAMES[k])}</span>
                            </>
                          ) : (
                            k
                          )}
                        </kbd>
                      </span>
                    ))}
                  </span>
                ))}
              </dt>
              <dd>{t(`keys.${label}`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="howto-actions">
        <a href="#home" className="howto-start">
          <Icon name="play" />
          {t('start')}
        </a>
        <a href="#about" className="howto-about">
          {t('about')}
        </a>
      </div>
    </article>
  );
}

export default HowToPage;
