/**
 * Markets and areas where medicines are commonly bought, used to name a
 * scan's location ("near Idumota market") and to place simulated pilot
 * scans. Coordinates are approximate area centres.
 */
export interface Area {
  name: string;
  city: string;
  latitude: number;
  longitude: number;
}

export const AREAS: readonly Area[] = [
  { name: "Idumota market", city: "Lagos", latitude: 6.4553, longitude: 3.3881 },
  { name: "Ojuelegba", city: "Lagos", latitude: 6.5085, longitude: 3.364 },
  { name: "Oshodi market", city: "Lagos", latitude: 6.555, longitude: 3.3437 },
  { name: "Ikeja Computer Village", city: "Lagos", latitude: 6.5965, longitude: 3.3421 },
  { name: "Bridgehead market", city: "Onitsha", latitude: 6.1486, longitude: 6.769 },
  { name: "Onitsha Main Market", city: "Onitsha", latitude: 6.152, longitude: 6.786 },
  { name: "Sabon Gari market", city: "Kano", latitude: 12.005, longitude: 8.532 },
  { name: "Kurmi market", city: "Kano", latitude: 11.996, longitude: 8.515 },
  { name: "Wuse market", city: "Abuja", latitude: 9.071, longitude: 7.471 },
  { name: "Ariaria market", city: "Aba", latitude: 5.118, longitude: 7.35 },
  { name: "Dugbe market", city: "Ibadan", latitude: 7.389, longitude: 3.887 },
  { name: "Mile 1 market", city: "Port Harcourt", latitude: 4.799, longitude: 7.006 },
];

/** A scan this close to an area's centre is "near" it. */
const NEAR_METRES = 3_000;

/** Great-circle distance in metres (haversine). */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/** "Idumota market, Lagos" for a point within 3 km of a known area; otherwise null. */
export function nearestAreaName(latitude: number, longitude: number): string | null {
  let best: { area: Area; distance: number } | null = null;
  for (const area of AREAS) {
    const distance = distanceMetres(latitude, longitude, area.latitude, area.longitude);
    if (!best || distance < best.distance) best = { area, distance };
  }
  return best && best.distance <= NEAR_METRES ? `${best.area.name}, ${best.area.city}` : null;
}

/**
 * Location privacy: 2 decimal places is ~1.1 km. Enough to see a market
 * cluster, never enough to find a person's home.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ScanLocation {
  latitude: number;
  longitude: number;
  areaName: string | null;
}

/** Rounds and names a location the app sent, or returns null if it sent none. */
export function toScanLocation(input: { lat?: number | undefined; lng?: number | undefined }): ScanLocation | null {
  if (input.lat === undefined || input.lng === undefined) return null;
  const latitude = roundCoordinate(input.lat);
  const longitude = roundCoordinate(input.lng);
  return { latitude, longitude, areaName: nearestAreaName(latitude, longitude) };
}
