/**
 * Reads the datasets of the jukebox-data Docker volume, served read-only by
 * the webapp at `/data/` (nginx `autoindex_format json` in production, a Vite
 * middleware in development; both return the same JSON listing).
 *
 * Only the rows covering the selected zone are downloaded, with HTTP Range
 * requests on the uncompressed `.npy` files.
 */

import { parseNpyHeader, decodeNpyData, type NpyHeader } from '../utils/npy';
import { datasetForFolder, GRID_COLS, GRID_ROWS, type DatasetInfo } from '../data/datasetRegistry';

export const DATA_BASE_URL: string = (import.meta.env.VITE_DATA_URL as string | undefined) ?? '/data';

interface ListingEntry {
  name: string;
  type: 'file' | 'directory' | string;
}

export interface VolumeDataset {
  info: DatasetInfo;
  /** Available months, sorted, as 'YYYY_MM'. */
  months: string[];
  monthSet: Set<string>;
  /** File holding each month (a yearly map covers its 12 months). Defaults to `<prefix>_YYYY_MM.npy`. */
  fileByMonth?: Map<string, string>;
}

/** Month key used throughout: 'YYYY_MM'. */
export function monthKey(year: number, month: number): string {
  return `${year}_${String(month).padStart(2, '0')}`;
}

async function fetchListing(path: string, signal?: AbortSignal): Promise<ListingEntry[]> {
  const res = await fetch(`${DATA_BASE_URL}/${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Cannot list ${DATA_BASE_URL}/${path} (HTTP ${res.status})`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`Unexpected listing for ${DATA_BASE_URL}/${path}`);
  return json as ListingEntry[];
}

let datasetsPromise: Promise<VolumeDataset[]> | null = null;

/**
 * Discover the dataset folders of the volume and the months each one covers.
 * Cached for the session.
 */
export function listDatasets(): Promise<VolumeDataset[]> {
  if (!datasetsPromise) {
    datasetsPromise = discover().catch((err) => {
      datasetsPromise = null; // allow retry
      throw err;
    });
  }
  return datasetsPromise;
}

const MONTH_FILE = /^(.+)_(\d{4})_(\d{2})\.npy$/;
/** Yearly maps (e.g. night lights): the value is held for the 12 months, as the backend plays it. */
const YEAR_FILE = /^(.+)_(\d{4})\.npy$/;

async function discover(): Promise<VolumeDataset[]> {
  const root = await fetchListing('');
  const folders = root.filter((e) => e.type === 'directory').map((e) => e.name).sort();
  const result = await Promise.all(
    folders.map(async (folder, index): Promise<VolumeDataset | null> => {
      const files = await fetchListing(`${encodeURIComponent(folder)}/`);
      let prefix = '';
      const fileByMonth = new Map<string, string>();
      for (const f of files) {
        if (f.type !== 'file') continue;
        const m = MONTH_FILE.exec(f.name);
        if (m) {
          prefix = m[1];
          fileByMonth.set(`${m[2]}_${m[3]}`, f.name);
          continue;
        }
        const y = YEAR_FILE.exec(f.name);
        if (y) {
          prefix = y[1];
          for (let month = 1; month <= 12; month++) {
            const key = monthKey(Number(y[2]), month);
            if (!fileByMonth.has(key)) fileByMonth.set(key, f.name);
          }
        }
      }
      if (!fileByMonth.size) return null;
      const months = [...fileByMonth.keys()].sort();
      return { info: datasetForFolder(folder, prefix, index), months, monthSet: new Set(months), fileByMonth };
    })
  );
  return result.filter((d): d is VolumeDataset => d !== null);
}

function fileUrl(ds: VolumeDataset, month: string): string {
  const name = ds.fileByMonth?.get(month) ?? `${ds.info.prefix}_${month}.npy`;
  return `${DATA_BASE_URL}/${encodeURIComponent(ds.info.folder)}/${name}`;
}

/** Header per dataset folder: all monthly files of a folder share the same header. */
const headerCache = new Map<string, Promise<NpyHeader>>();

async function getHeader(ds: VolumeDataset, month: string, signal?: AbortSignal): Promise<NpyHeader> {
  let p = headerCache.get(ds.info.folder);
  if (!p) {
    p = (async () => {
      const res = await fetch(fileUrl(ds, month), { headers: { Range: 'bytes=0-1023' }, signal });
      if (!res.ok) throw new Error(`Cannot read header of ${fileUrl(ds, month)} (HTTP ${res.status})`);
      // A server without Range support answers 200 with the whole file: still fine.
      const header = parseNpyHeader(new Uint8Array(await res.arrayBuffer()));
      if (header.fortranOrder || header.shape.length !== 2 || header.shape[0] !== GRID_ROWS || header.shape[1] !== GRID_COLS) {
        throw new Error(`Unexpected array layout in ${ds.info.folder}: shape (${header.shape.join(', ')})`);
      }
      return header;
    })();
    p.catch(() => headerCache.delete(ds.info.folder));
    headerCache.set(ds.info.folder, p);
  }
  return p;
}

/**
 * Fetch rows `rMin..rMax` (inclusive, full width) of one month of a dataset.
 * Returns the stored values, row-major, length (rMax - rMin + 1) * GRID_COLS.
 */
export async function fetchMonthRows(
  ds: VolumeDataset,
  month: string,
  rMin: number,
  rMax: number,
  signal?: AbortSignal
): Promise<Float32Array> {
  const header = await getHeader(ds, month, signal);
  const rowBytes = GRID_COLS * header.itemSize;
  const start = header.dataOffset + rMin * rowBytes;
  const end = header.dataOffset + (rMax + 1) * rowBytes - 1;
  const res = await fetch(fileUrl(ds, month), { headers: { Range: `bytes=${start}-${end}` }, signal });
  if (!res.ok) throw new Error(`Cannot read ${fileUrl(ds, month)} (HTTP ${res.status})`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (res.status !== 206) {
    // Server ignored the Range header: cut the rows out of the full file
    bytes = bytes.subarray(start, end + 1);
  }
  if (bytes.byteLength !== end - start + 1) {
    throw new Error(`Truncated data for ${fileUrl(ds, month)}`);
  }
  return decodeNpyData(bytes, header.dtype);
}
