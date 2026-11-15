import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { instrumentKey, splitInstrumentName, translateInstrument } from './instrumentName';

/**
 * Every instrument name GET /api/instruments can send, all music styles included
 * (computed from sonification/music/orchestra.py, eras.py and soundscape.py).
 */
const BACKEND_NAMES = [
  'Alto sax', 'Baritone sax', 'Bass & lead synth', 'Bowed glass (melody)', 'Brass section',
  'Bright piano (off-beats)', 'Celesta', 'Chiff lead synth', 'City traffic', 'Clarinet',
  'Clavinet (funky stabs)', 'Clean electric guitar (eighth notes)', 'Contrabass', 'Crackling fire',
  'Crystal synth', 'Desert wind', 'Electric bass (eighth notes)', 'Electric bass (octaves)',
  'Electric piano (arpeggios)', 'Flute', 'Flute (melody)', 'French Horns (melody)',
  'Glockenspiel (melody)', 'Hammond organ', 'Harmonica', 'Heartbeat (faster when warmer)',
  'Honky-tonk piano (stride)', 'Jazz guitar (comping)', 'Kalimba', 'Melodic toms', 'Music box',
  'Muted trumpet', 'Overdriven guitar', 'Pan flute', 'Piano (chords)', 'Piccolo', 'Polysynth pad',
  'Polysynth pad (pad)', 'Rain sounds', 'Saw lead synth', 'Singing, creaking ice', 'Smouldering fire',
  'Snowy wind', 'Square lead synth', 'Street-lamp hum', 'Sweep pad', 'Synth bass (808)',
  'Synth bass (eighth notes)', 'Synth bass (off-beats)', 'Synth brass', 'Synth drum', 'Synth pad',
  'Tenor sax', 'Thunder', 'Timpani', 'Trombone', 'Trombones', 'Trumpet', 'Tuba (oom-pah)',
  'Upright bass (walking)', 'Vibraphone', 'Violins (melody)',
];

describe('instrument names', () => {
  it('splits the playing style off the instrument', () => {
    expect(splitInstrumentName('Upright bass (walking)')).toEqual(['Upright bass', 'walking']);
    expect(splitInstrumentName('Singing, creaking ice')).toEqual(['Singing, creaking ice', null]);
    expect(instrumentKey('Bass & lead synth')).toBe('bass_lead_synth');
    expect(instrumentKey('off-beats')).toBe('off_beats');
  });

  it.each(['en', 'fr', 'de'])('has a %s translation for every part the backend sends', (lang) => {
    const tr = i18n.getFixedT(lang);
    for (const name of BACKEND_NAMES) {
      const [base, style] = splitInstrumentName(name);
      expect(i18n.exists(`instruments.names.${instrumentKey(base)}`, { lng: lang }), base).toBe(true);
      if (style) expect(i18n.exists(`instruments.styles.${instrumentKey(style)}`, { lng: lang }), style).toBe(true);
      expect(translateInstrument(name, tr)).toBeTruthy();
    }
  });

  it('translates both parts and keeps English for unknown ones', () => {
    expect(translateInstrument('Upright bass (walking)', i18n.getFixedT('fr'))).toBe('Contrebasse jazz (walking bass)');
    expect(translateInstrument('Piano (chords)', i18n.getFixedT('de'))).toBe('Klavier (Akkorde)');
    expect(translateInstrument('Piano (chords)', i18n.getFixedT('en'))).toBe('Piano (chords)');
    expect(translateInstrument('Theremin (glissando)', i18n.getFixedT('fr'))).toBe('Theremin (glissando)');
  });

  it('translates the sea ice dataset', () => {
    expect(i18n.getFixedT('fr')('tracks.sea_ice')).toBe('Glace de mer');
    expect(i18n.getFixedT('de')('globeData.datasets.sea_ice')).toBe('Meereis');
  });
});
