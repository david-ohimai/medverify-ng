import { describe, expect, it } from "vitest";
import { distanceMetres, nearestAreaName, roundCoordinate, toScanLocation } from "../../src/lib/areas.js";
import type { ClusterRow } from "../../src/repositories/hotspot.repository.js";
import {
  alertFacts,
  hasGrown,
  matchClusters,
  severityFor,
  templateAlert,
  type StoredHotspot,
} from "../../src/services/hotspot/hotspotRules.js";

const IDUMOTA = { latitude: 6.4553, longitude: 3.3881 };

const cluster = (overrides: Partial<ClusterRow> = {}): ClusterRow => ({
  ...IDUMOTA,
  radiusM: 900,
  scanCount: 4,
  highRiskCount: 0,
  unregisteredCount: 0,
  nameMismatchCount: 0,
  expiredCount: 0,
  maxRiskScore: 40,
  recallInvolved: false,
  nafdacNo: "X9-0001",
  batchNo: "DQ2310",
  packName: "Demoquine",
  simulatedShare: 0,
  firstSeen: new Date("2026-10-26T08:00:00Z"),
  lastSeen: new Date("2026-10-29T10:30:00Z"),
  ...overrides,
});

const stored = (overrides: Partial<StoredHotspot> = {}): StoredHotspot => ({
  id: "h-1",
  ...IDUMOTA,
  nafdacNo: "X9-0001",
  scanCount: 4,
  severity: "low",
  ...overrides,
});

describe("severityFor", () => {
  it("a recalled batch, 5+ high-risk or 10+ flagged scans is high", () => {
    expect(severityFor(cluster({ recallInvolved: true }))).toBe("high");
    expect(severityFor(cluster({ highRiskCount: 5 }))).toBe("high");
    expect(severityFor(cluster({ scanCount: 10 }))).toBe("high");
  });

  it("5+ scans, any high-risk scan or any unregistered number is medium", () => {
    expect(severityFor(cluster({ scanCount: 5 }))).toBe("medium");
    expect(severityFor(cluster({ highRiskCount: 1 }))).toBe("medium");
    expect(severityFor(cluster({ unregisteredCount: 1 }))).toBe("medium");
  });

  it("a few suspicious scans is low", () => {
    expect(severityFor(cluster())).toBe("low");
  });
});

describe("matchClusters, continuity across runs", () => {
  it("a cluster within 3 km about the same number continues the stored hotspot", () => {
    const moved = cluster({ latitude: 6.47, longitude: 3.39 }); // ~1.6 km away
    const result = matchClusters([moved], [stored()]);
    expect(result.continued).toEqual([{ cluster: moved, hotspot: expect.objectContaining({ id: "h-1" }) }]);
    expect(result.appeared).toEqual([]);
    expect(result.gone).toEqual([]);
  });

  it("a different number in the same place is a new hotspot, and the old one is gone", () => {
    const other = cluster({ nafdacNo: "X9-0999" });
    const result = matchClusters([other], [stored()]);
    expect(result.appeared).toEqual([other]);
    expect(result.gone.map((h) => h.id)).toEqual(["h-1"]);
  });

  it("too far away is a new hotspot", () => {
    const far = cluster({ latitude: 6.6, longitude: 3.34 });
    expect(matchClusters([far], [stored()]).appeared).toEqual([far]);
  });

  it("each stored hotspot is claimed once, by the biggest cluster first", () => {
    const big = cluster({ scanCount: 12, latitude: 6.46 });
    const small = cluster({ scanCount: 3, latitude: 6.45 });
    const result = matchClusters([small, big], [stored()]);
    expect(result.continued[0]!.cluster).toBe(big);
    expect(result.appeared).toEqual([small]);
  });
});

describe("hasGrown, when to write a fresh alert", () => {
  it("more severe → yes", () => {
    expect(hasGrown({ scanCount: 9, severity: "medium" }, { scanCount: 9, severity: "high" })).toBe(true);
  });

  it("grew by half and at least 3 scans → yes; a trickle → no", () => {
    expect(hasGrown({ scanCount: 6, severity: "medium" }, { scanCount: 9, severity: "medium" })).toBe(true);
    expect(hasGrown({ scanCount: 20, severity: "high" }, { scanCount: 23, severity: "high" })).toBe(false);
    expect(hasGrown({ scanCount: 3, severity: "low" }, { scanCount: 4, severity: "low" })).toBe(false);
  });
});

describe("alert facts and the template fallback", () => {
  it("the facts are only cluster numbers, names and times", () => {
    const facts = alertFacts(cluster({ recallInvolved: true, scanCount: 18, simulatedShare: 1 }), {
      severity: "high",
      areaName: "Idumota market, Lagos",
      registeredProduct: "Demoquine (Artemether/Lumefantrine)",
    });
    expect(facts).toMatchObject({
      area: "Idumota market, Lagos",
      registered_product: "Demoquine (Artemether/Lumefantrine)",
      name_on_packs: "Demoquine",
      flagged_scans: 18,
      recalled_batch_involved: true,
      radius_km: 0.9,
      first_seen: "2026-10-26 08:00",
      simulated_share: 1,
    });
  });

  it("the template names the main concern and marks simulated data", () => {
    const facts = alertFacts(cluster({ unregisteredCount: 12, scanCount: 12, packName: "Curamax", simulatedShare: 1 }), {
      severity: "high",
      areaName: "Bridgehead market, Onitsha",
      registeredProduct: null,
    });
    const card = templateAlert(facts);
    expect(card.title).toBe("Suspected Curamax batch DQ2310 cluster near Bridgehead market, Onitsha");
    expect(card.body).toMatch(/12 flagged scans .* an unregistered NAFDAC number\. \(includes simulated pilot data\)$/);
    expect(card.body).not.toMatch(/confirmed/i);
  });
});

describe("areas and location privacy", () => {
  it("rounds to 2 decimals (~1 km) before anything is stored", () => {
    expect(roundCoordinate(6.455312)).toBe(6.46);
    expect(toScanLocation({ lat: 6.455312, lng: 3.388099 })).toEqual({
      latitude: 6.46,
      longitude: 3.39,
      areaName: "Idumota market, Lagos",
    });
    expect(toScanLocation({})).toBeNull();
  });

  it("names a point only when it is within 3 km of a known area", () => {
    expect(nearestAreaName(12.01, 8.53)).toBe("Sabon Gari market, Kano");
    expect(nearestAreaName(10.5, 5.0)).toBeNull();
  });

  it("haversine distance is right to within a few metres", () => {
    // Idumota → Ojuelegba: 5.92 km north, 2.66 km west → about 6.5 km.
    expect(distanceMetres(6.4553, 3.3881, 6.5085, 3.364) / 1000).toBeCloseTo(6.49, 1);
  });
});
