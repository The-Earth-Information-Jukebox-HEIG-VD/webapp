import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { KeyMoment, MomentDataset } from '../../types/keyMoments';
import type { MomentStatus } from '../../data/keyMoments';
import { trackColor, TRACK_COLORS_DARK } from '../../data/trackColors';
import { useContext } from 'react';
import ThemeContext from '../../contexts/ThemeContext';
import { getZoneDisplayName } from '../../utils/zoneName';
import './KeyMomentCard.css';

interface KeyMomentCardProps {
  moment: KeyMoment;
  status: MomentStatus;
  /** Show where the event happened (no zone selected yet) */
  showZone: boolean;
  onJump: () => void;
}

/** "YYYY-MM" -> UTC Date on the 15th (no time-zone edge effects) */
function periodDate(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15));
}

/** Localised "Aug – Oct 2015", or "Sep 2015" when start === end */
export function formatPeriodRange(start: string, end: string, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (start === end) return fmt.format(periodDate(start));
  try {
    return fmt.formatRange(periodDate(start), periodDate(end));
  } catch {
    return `${fmt.format(periodDate(start))} – ${fmt.format(periodDate(end))}`;
  }
}

const DATASET_ICONS: Record<MomentDataset, () => ReactNode> = {
  fires: FlameIcon,
  precipitation: DropIcon,
  snow: SnowflakeIcon,
  lightning: BoltIcon,
  temperature: ThermometerIcon,
};

/**
 * Card for one key event: photo, place, dates and a button that jumps the
 * timeline (and, with no zone selected, the globe) to it.
 */
export function KeyMomentCard({ moment, status, showZone, onJump }: KeyMomentCardProps) {
  const { t, i18n } = useTranslation();
  // Optional: renders (and tests) without a ThemeProvider fall back to dark
  const resolvedTheme = useContext(ThemeContext)?.resolvedTheme ?? 'dark';
  const key = `moments.${moment.i18nKey}`;
  const title = t(`${key}.title`);
  const zoneName = getZoneDisplayName(moment.zoneIds[0], t);
  const zoneNames = moment.zoneIds.map((id) => getZoneDisplayName(id, t)).join(', ');
  const peak = formatPeriodRange(moment.peakStart, moment.peakEnd, i18n.language);
  const listenRange = formatPeriodRange(moment.start, moment.end, i18n.language);
  const Icon = DATASET_ICONS[moment.dataset];
  const isActive = status === 'active';

  return (
    <li className={`key-moment-card ${status}`} aria-current={isActive ? 'true' : undefined}>
      {moment.image && (
        <img
          className="moment-image"
          src={moment.image}
          alt={t(`${key}.imageAlt`)}
          loading="lazy"
          decoding="async"
        />
      )}

      <div className="moment-body">
        <div className="moment-header">
          <span className="moment-dataset">
            <span
              className="moment-dataset-icon"
              style={{ color: moment.dataset in TRACK_COLORS_DARK ? trackColor(moment.dataset, resolvedTheme) : undefined }}
              aria-hidden="true"
            >
              <Icon />
            </span>
            {t(`tracks.${moment.dataset}`)}
          </span>
          {showZone && <span className="moment-zone">{zoneNames}</span>}
        </div>

        <h3 className="moment-title">{title}</h3>

        <dl className="moment-dates">
          <div>
            <dt>{t(moment.category === 'elNino' ? 'moments.peakInData' : 'moments.inData')}</dt>
            <dd>{peak}</dd>
          </div>
          <div>
            <dt>{t('moments.happened')}</dt>
            <dd>{t(`${key}.when`)}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="moment-jump-button"
          onClick={onJump}
          aria-label={
            showZone
              ? t('moments.jumpToZoneLabel', { title, range: listenRange, zone: zoneName })
              : t('moments.jumpToLabel', { title, range: listenRange })
          }
        >
          <JumpIcon />
          <span>{t('moments.jumpTo', { range: listenRange })}</span>
        </button>

        {isActive && (
          <div className="moment-active-indicator">
            <span className="playing-dot" aria-hidden="true" />
            <span className="playing-dot" aria-hidden="true" />
            <span className="playing-dot" aria-hidden="true" />
            <span className="sr-only">{t('moments.active')}</span>
          </div>
        )}
      </div>
    </li>
  );
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function FlameIcon() {
  return (
    <SvgIcon>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </SvgIcon>
  );
}

function DropIcon() {
  return (
    <SvgIcon>
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </SvgIcon>
  );
}

function SnowflakeIcon() {
  return (
    <SvgIcon>
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="m20 16-4-4 4-4" />
      <path d="m4 8 4 4-4 4" />
      <path d="m16 4-4 4-4-4" />
      <path d="m8 20 4-4 4 4" />
    </SvgIcon>
  );
}

function BoltIcon() {
  return (
    <SvgIcon>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </SvgIcon>
  );
}

function ThermometerIcon() {
  return (
    <SvgIcon>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </SvgIcon>
  );
}

function JumpIcon() {
  return (
    <SvgIcon>
      <polygon points="5 3 19 12 5 21 5 3" />
    </SvgIcon>
  );
}

export default KeyMomentCard;
