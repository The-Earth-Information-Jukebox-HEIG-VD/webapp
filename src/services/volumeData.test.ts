import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchMonthRows, listDatasets } from './volumeData';

// Real header of a volume map (720 x 1440, float16)
const header = new Uint8Array(
  readFileSync(resolve(process.cwd(), 'src/test/fixtures/temperature_anomaly_2024_07_row174.npy'))
).slice(0, 128);

describe('volume discovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('holds a yearly map (night lights) for the 12 months of its year', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/data/') {
        return Response.json([{ name: 'nightlights_2012_2023', type: 'directory' }]);
      }
      if (url === '/data/nightlights_2012_2023/') {
        return Response.json([
          { name: 'nightlights_2012.npy', type: 'file' },
          { name: 'nightlights_2013.npy', type: 'file' },
        ]);
      }
      // Header request, then the rows: answer with the header + one zero row
      return new Response(new Uint8Array([...header, ...new Uint8Array(1440 * 2)]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [ds] = await listDatasets();
    expect(ds.info.id).toBe('nightlights');
    expect(ds.info.trackIds).toContain('night_lights');
    expect(ds.months).toHaveLength(24);
    expect(ds.months[0]).toBe('2012_01');
    expect(ds.months[23]).toBe('2013_12');

    await fetchMonthRows(ds, '2013_07', 0, 0);
    // July 2013 is read from the 2013 map; one float16 row = 1440 * 2 bytes after the 128-byte header
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/data/nightlights_2012_2023/nightlights_2013.npy',
      expect.objectContaining({ headers: { Range: 'bytes=128-3007' } })
    );
  });
});
