import { useState, useCallback, useMemo, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ZoneFeature, ZoneViewType, GridPoint } from '../../types/zones';
import {
  getZoneFeatures,
  getCountriesByContinent,
  getOceans,
  getSeasByOcean,
  getInlandSeas,
  continentsGeoJSON,
} from '../../data/zones';
import { getPointsInFeature, DEFAULT_IMAGE_DIMENSIONS } from '../../utils/geometry';
import './ListView.css';

// Default image dimensions for NASA SVS data

// Tree-state id for the non-selectable "Inland seas" group
const INLAND_GROUP_ID = 'inlandSeas';

interface ListViewProps {
  selectedZone: string | null;
  onZoneSelect: (zoneId: string, points: GridPoint[]) => void;
  zoneViewType: ZoneViewType;
  currentYear?: number;
}

/**
 * Accessible list view of climate zones
 *
 * Provides a fully keyboard-navigable and screen-reader-friendly
 * alternative to the globe visualization with hierarchical display.
 */
export function ListView({
  selectedZone,
  onZoneSelect,
  zoneViewType,
  currentYear,
}: ListViewProps) {
  const { t } = useTranslation();
  const waterHintId = useId();
  const [expandedContinents, setExpandedContinents] = useState<Set<string>>(
    new Set()
  );

  // Get zone features based on view type
  const zoneFeatures = useMemo(() => {
    return getZoneFeatures(zoneViewType);
  }, [zoneViewType]);

  const handleZoneSelect = useCallback(
    (feature: ZoneFeature) => {
      const points = getPointsInFeature(feature, DEFAULT_IMAGE_DIMENSIONS);
      onZoneSelect(feature.properties.id, points);
    },
    [onZoneSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, feature: ZoneFeature) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleZoneSelect(feature);
      }
    },
    [handleZoneSelect]
  );

  const toggleContinent = useCallback((continentId: string) => {
    setExpandedContinents((prev) => {
      const next = new Set(prev);
      if (next.has(continentId)) {
        next.delete(continentId);
      } else {
        next.add(continentId);
      }
      return next;
    });
  }, []);

  const handleContinentKeyDown = useCallback(
    (e: React.KeyboardEvent, continentId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleContinent(continentId);
      } else if (e.key === 'ArrowRight' && !expandedContinents.has(continentId)) {
        e.preventDefault();
        setExpandedContinents((prev) => new Set(prev).add(continentId));
      } else if (e.key === 'ArrowLeft' && expandedContinents.has(continentId)) {
        e.preventDefault();
        setExpandedContinents((prev) => {
          const next = new Set(prev);
          next.delete(continentId);
          return next;
        });
      }
    },
    [expandedContinents, toggleContinent]
  );

  const expandKeys = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'ArrowRight' && !expandedContinents.has(id)) {
        e.preventDefault();
        setExpandedContinents((prev) => new Set(prev).add(id));
        return true;
      }
      if (e.key === 'ArrowLeft' && expandedContinents.has(id)) {
        e.preventDefault();
        setExpandedContinents((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return true;
      }
      return false;
    },
    [expandedContinents]
  );

  // Oceans are zones themselves: Enter/Space selects, Right/Left expand/collapse.
  const handleOceanKeyDown = useCallback(
    (e: React.KeyboardEvent, ocean: ZoneFeature) => {
      if (expandKeys(e, ocean.properties.id)) return;
      handleKeyDown(e, ocean);
    },
    [expandKeys, handleKeyDown]
  );

  // The "Inland seas" group is not a zone: Enter/Space/arrows only expand/collapse.
  const handleGroupKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleContinent(id);
      } else {
        expandKeys(e, id);
      }
    },
    [expandKeys, toggleContinent]
  );

  const renderSeaRows = (seas: ZoneFeature[]) => (
    <div className="tree-countries" role="group">
      {seas.map((sea) => {
        const isSeaSelected = sea.properties.id === selectedZone;
        return (
          <div
            key={sea.properties.id}
            className={`tree-country ${isSeaSelected ? 'selected' : ''}`}
            role="treeitem"
            aria-level={2}
            aria-selected={isSeaSelected}
            tabIndex={0}
            onClick={() => handleZoneSelect(sea)}
            onKeyDown={(e) => handleKeyDown(e, sea)}
          >
            <span className="country-name">{t(sea.properties.nameKey)}</span>
            <span className="country-status">
              {isSeaSelected && (
                <span className="selected-indicator">
                  <CheckIcon />
                  <span className="sr-only">{t('zones.selected', { zone: t(sea.properties.nameKey) })}</span>
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );

  // Hierarchical tree for oceans & seas
  const renderWaterTree = () => {
    const inlandSeas = getInlandSeas();
    const inlandExpanded = expandedContinents.has(INLAND_GROUP_ID);

    return (
      <div className="zones-tree" role="tree" aria-label={t('zones.waterTree')}>
        <span id={waterHintId} className="sr-only">
          {t('zones.oceanItemHint')}
        </span>
        {getOceans().map((ocean) => {
          const oceanId = ocean.properties.id;
          const seas = getSeasByOcean(oceanId);
          const isExpanded = expandedContinents.has(oceanId);
          const isSelected = oceanId === selectedZone;

          return (
            <div key={oceanId} className="tree-continent">
              <div
                className={`tree-continent-header ${isSelected ? 'selected' : ''}`}
                role="treeitem"
                aria-level={1}
                aria-expanded={seas.length > 0 ? isExpanded : undefined}
                aria-selected={isSelected}
                aria-describedby={waterHintId}
                tabIndex={0}
                onClick={() => handleZoneSelect(ocean)}
                onKeyDown={(e) => handleOceanKeyDown(e, ocean)}
              >
                {/* Mouse-only affordance: keyboard users expand with Right/Left
                    Arrow on the treeitem, so the button is hidden from AT to keep
                    "Expand" out of the treeitem's accessible name. */}
                <button
                  type="button"
                  className="expand-button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleContinent(oceanId);
                  }}
                >
                  <ChevronIcon expanded={isExpanded} />
                </button>
                <span className="continent-name">{t(ocean.properties.nameKey)}</span>
                <span className="country-count">
                  ({seas.length} {t('zones.seas')})
                </span>
                <span className="country-status">
                  {isSelected && (
                    <span className="selected-indicator">
                      <CheckIcon />
                      <span className="sr-only">{t('zones.selected', { zone: t(ocean.properties.nameKey) })}</span>
                    </span>
                  )}
                </span>
              </div>
              {isExpanded && seas.length > 0 && renderSeaRows(seas)}
            </div>
          );
        })}

        {inlandSeas.length > 0 && (
          <div className="tree-continent">
            <div
              className="tree-continent-header"
              role="treeitem"
              aria-level={1}
              aria-expanded={inlandExpanded}
              aria-selected={false}
              tabIndex={0}
              onClick={() => toggleContinent(INLAND_GROUP_ID)}
              onKeyDown={(e) => handleGroupKeyDown(e, INLAND_GROUP_ID)}
            >
              <button
                type="button"
                className="expand-button"
                aria-hidden="true"
                tabIndex={-1}
              >
                <ChevronIcon expanded={inlandExpanded} />
              </button>
              <span className="continent-name">{t('zones.inlandSeas')}</span>
              <span className="country-count">
                ({inlandSeas.length} {t('zones.seas')})
              </span>
              <span className="country-status" aria-hidden="true" />
            </div>
            {inlandExpanded && renderSeaRows(inlandSeas)}
          </div>
        )}
      </div>
    );
  };

  // Render flat list for continent view
  const renderContinentList = () => (
    <table className="zones-table" role="grid">
      <thead>
        <tr>
          <th scope="col">{t('zones.zone')}</th>
          <th scope="col">{t('zones.status')}</th>
        </tr>
      </thead>
      <tbody>
        {zoneFeatures.map((feature) => {
          const isSelected = feature.properties.id === selectedZone;

          return (
            <tr
              key={feature.properties.id}
              className={`zone-row ${isSelected ? 'selected' : ''}`}
              role="row"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => handleZoneSelect(feature)}
              onKeyDown={(e) => handleKeyDown(e, feature)}
            >
              <td className="zone-name">
                <span className="zone-name-content">
                  <span
                    className="zone-marker continent-marker"
                    aria-hidden="true"
                  />
                  {t(feature.properties.nameKey)}
                </span>
              </td>
              <td className="zone-status">
                {isSelected ? (
                  <span className="status-selected">
                    <CheckIcon />
                    <span className="sr-only">{t('zones.selected')}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="select-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleZoneSelect(feature);
                    }}
                    aria-label={t('zones.selectZone', {
                      zone: t(feature.properties.nameKey),
                    })}
                  >
                    {t('zones.select')}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // Render hierarchical tree for country view
  const renderCountryTree = () => (
    <div className="zones-tree" role="tree" aria-label={t('zones.countryTree')}>
      {continentsGeoJSON.features.map((continent) => {
        const continentId = continent.properties.id;
        const isExpanded = expandedContinents.has(continentId);
        const countries = getCountriesByContinent(continentId);
        const isSelected = continentId === selectedZone;

        return (
          <div key={continentId} className="tree-continent">
            <div
              className={`tree-continent-header ${isSelected ? 'selected' : ''}`}
              role="treeitem"
              aria-expanded={isExpanded}
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => toggleContinent(continentId)}
              onKeyDown={(e) => handleContinentKeyDown(e, continentId)}
            >
              <button
                type="button"
                className="expand-button"
                aria-label={isExpanded ? t('zones.collapse') : t('zones.expand')}
                tabIndex={-1}
              >
                <ChevronIcon expanded={isExpanded} />
              </button>
              <span className="continent-name">
                {t(continent.properties.nameKey)}
              </span>
              <span className="country-count">
                ({countries.length} {t('zones.countries')})
              </span>
            </div>

            {isExpanded && countries.length > 0 && (
              <div className="tree-countries" role="group">
                {countries.map((country) => {
                  const isCountrySelected = country.properties.id === selectedZone;

                  return (
                    <div
                      key={country.properties.id}
                      className={`tree-country ${isCountrySelected ? 'selected' : ''}`}
                      role="treeitem"
                      aria-selected={isCountrySelected}
                      tabIndex={0}
                      onClick={() => handleZoneSelect(country)}
                      onKeyDown={(e) => handleKeyDown(e, country)}
                    >
                      <span className="country-name">
                        {t(country.properties.nameKey)}
                      </span>
                      {/* Always rendered so every row has the same height and
                          the check marks line up in one column. */}
                      <span className="country-status">
                        {isCountrySelected && (
                          <span className="selected-indicator">
                            <CheckIcon />
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="list-view"
      role="region"
      aria-label={t('viewMode.listDescription')}
    >
      {currentYear && (
        <div className="list-view-header">
          <h3 className="list-view-year">
            <span className="year-label">{t('dateTime.year')}: </span>
            <span className="year-value">{currentYear}</span>
          </h3>
          <span className="view-type-badge">
            {t(`zones.${zoneViewType}View`)}
          </span>
        </div>
      )}

      {zoneViewType === 'continent'
        ? renderContinentList()
        : zoneViewType === 'water'
          ? renderWaterTree()
          : renderCountryTree()}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="check-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`chevron-icon ${expanded ? 'expanded' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default ListView;
