/**
 * Zone API Service
 *
 * Handles communication with the backend for zone-based data extraction.
 * Sends grid points within a zone and receives audio data for playback.
 */

import type { GridPoint, ZoneSelection } from '../types/zones';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Request to fetch audio data for a zone at a specific time period
 * Supports multiple datasets that get combined into a single audio output
 */
export interface ZoneDataRequest {
  zone_id: string;
  zone_name: string;
  dataset_ids: string[]; // Array of selected datasets - backend returns combined audio
  points: GridPoint[];
  time_period: string; // Format: "YYYY-MM" (e.g., "2020-01")
  aggregation?: 'mean' | 'sum' | 'max' | 'min';
}

/**
 * Response from zone data endpoint
 * Returns ONE combined audio file for all requested datasets
 */
export interface ZoneDataResponse {
  zone_id: string;
  dataset_ids: string[]; // Reflects which datasets were combined
  time_period: string;
  next_time_period: string;
  audio_data: string; // Base64 encoded combined audio
  values: Record<string, number>; // Per-dataset aggregated values
  point_count: number;
}

/**
 * Instrument information from backend
 */
export interface InstrumentInfo {
  dataset_id: string;
  instrument: string;
  midi_program: number;
  pitch_range: [number, number];
  role: string;
  always_playing: boolean;
}

/**
 * Response from instruments endpoint
 */
export interface InstrumentsResponse {
  palette: string;
  by_dataset: Record<string, string>;
  instruments: InstrumentInfo[];
}

/**
 * Error response from API
 */
export interface ApiError {
  error: string;
  message: string;
  status: number;
}

/**
 * Fetch zone data chunk from the backend.
 *
 * The backend extracts data from all specified grid points,
 * aggregates them, and returns 30 seconds of audio.
 */
export async function fetchZoneChunk(
  request: ZoneDataRequest
): Promise<ZoneDataResponse> {
  const response = await fetch(`${API_BASE}/zones/zone-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: 'NetworkError',
      message: 'Failed to fetch zone data',
      status: response.status,
    }));
    throw new Error(errorData.message || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a ZoneDataRequest from a zone selection
 */
export function createZoneDataRequest(
  selection: ZoneSelection,
  datasetIds: string[],
  timePeriod: string,
  aggregation: 'mean' | 'sum' | 'max' | 'min' = 'mean'
): ZoneDataRequest {
  return {
    zone_id: selection.zoneId,
    zone_name: selection.zoneName,
    dataset_ids: datasetIds,
    points: selection.points,
    time_period: timePeriod,
    aggregation,
  };
}

/**
 * Increment a time period string by one month.
 * Format: "YYYY-MM" -> "YYYY-MM" (next month)
 */
export function incrementTimePeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month); // month is 0-indexed, so this gives next month
  const newYear = date.getFullYear();
  const newMonth = date.getMonth() + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

/**
 * Decrement a time period string by one month.
 */
export function decrementTimePeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 2); // -2 because month is 1-indexed in string
  const newYear = date.getFullYear();
  const newMonth = date.getMonth() + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

/**
 * Parse a time period string to get year and month.
 */
export function parseTimePeriod(period: string): { year: number; month: number } {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
}

/**
 * Create a time period string from year and month.
 */
export function createTimePeriod(year: number, month: number = 1): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Decode base64 audio data to AudioBuffer.
 */
export async function decodeAudioData(
  audioContext: AudioContext,
  base64Data: string
): Promise<AudioBuffer> {
  // Decode base64 to ArrayBuffer
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Decode ArrayBuffer to AudioBuffer
  return audioContext.decodeAudioData(bytes.buffer);
}

/**
 * Check if the zone API is available.
 */
export async function checkZoneApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch instrument metadata from the backend.
 * Returns instrument assignments for each dataset and palette info.
 */
export async function fetchInstruments(): Promise<InstrumentsResponse> {
  const response = await fetch(`${API_BASE}/instruments`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: 'NetworkError',
      message: 'Failed to fetch instruments',
      status: response.status,
    }));
    throw new Error(errorData.message || `API error: ${response.status}`);
  }

  return response.json();
}
