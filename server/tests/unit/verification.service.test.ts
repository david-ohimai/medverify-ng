import { beforeEach, describe, expect, it, vi } from "vitest";
import { appEvents } from "../../src/lib/events.js";
import { productRepository } from "../../src/repositories/product.repository.js";
import { scanRepository } from "../../src/repositories/scan.repository.js";
import { registryService } from "../../src/services/registry.service.js";
import { verificationService } from "../../src/services/verification.service.js";

vi.mock("../../src/services/registry.service.js", () => ({
  registryService: { findProduct: vi.fn() },
}));
vi.mock("../../src/repositories/product.repository.js", () => ({
  productRepository: { nameSimilarity: vi.fn(), findBatch: vi.fn() },
}));
vi.mock("../../src/repositories/scan.repository.js", () => ({
  scanRepository: { create: vi.fn() },
}));

const registry = vi.mocked(registryService);
const products = vi.mocked(productRepository);
const scans = vi.mocked(scanRepository);

const PRODUCT = {
  id: "p-1",
  nafdacNo: "X9-0001",
  brandName: "Demoquine",
  genericName: "Artemether/Lumefantrine",
  strength: null,
  dosageForm: "Tablet",
  manufacturer: "Demo",
  status: "active" as const,
};

beforeEach(() => {
  // The repository echoes back what it was asked to save, like the real one.
  scans.create.mockImplementation((async (data: Parameters<typeof scanRepository.create>[0]) => ({
    id: "scan-1",
    kind: data.kind,
    nafdacNo: data.nafdacNo,
    productName: data.productName,
    batchNo: data.batchNo,
    expiryDate: data.expiryDate,
    verdict: data.verdict,
    riskScore: data.riskScore,
    confidence: data.confidence,
    signals: data.signals,
    createdAt: new Date("2026-10-28T10:00:00Z"),
    product: data.productId ? PRODUCT : null,
  })) as never);
});

describe("verificationService.verifyManual", () => {
  it("unregistered number: no name or batch lookups, saved as a manual scan, event emitted", async () => {
    registry.findProduct.mockResolvedValue(null);
    const listener = vi.fn();
    appEvents.once("scan:completed", listener);

    const result = await verificationService.verifyManual("device-1", {
      nafdacNo: "B7-9999",
      productName: "Whatever",
      batchNo: "ZZ1",
    });

    expect(products.nameSimilarity).not.toHaveBeenCalled();
    expect(products.findBatch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ verdict: "unregistered", kind: "manual", product: null });
    expect(scans.create).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: "device-1", kind: "manual", productId: null, verdict: "unregistered" })
    );
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ scanId: "scan-1", verdict: "unregistered" }));
  });

  it("registered product: checks the name and batch, and explains the verdict", async () => {
    registry.findProduct.mockResolvedValue(PRODUCT);
    products.nameSimilarity.mockResolvedValue(0.9);
    products.findBatch.mockResolvedValue({
      batchNo: "DQ2310",
      expiryDate: new Date("2027-09-30T00:00:00Z"),
      recalled: true,
      recallNote: "Demo recall",
    });

    const result = await verificationService.verifyManual("device-1", {
      nafdacNo: "X9-0001",
      productName: "Demoquine",
      batchNo: "DQ2310",
    });

    expect(products.nameSimilarity).toHaveBeenCalledWith("p-1", "Demoquine");
    expect(products.findBatch).toHaveBeenCalledWith("p-1", "DQ2310");
    expect(result.verdict).toBe("high_risk");
    expect(result.headline).toMatch(/do not take/i);
    expect(result.signals.map((s) => s.code)).toEqual(["PACK_NOT_SEEN", "NAME_MATCHES_REGISTRY", "BATCH_RECALLED"]);
    expect(result.disclaimer).toMatch(/never says a medicine is 100% safe/);
  });

  it("skips the name check when no name was given", async () => {
    registry.findProduct.mockResolvedValue(PRODUCT);
    await verificationService.verifyManual("device-1", { nafdacNo: "X9-0001" });
    expect(products.nameSimilarity).not.toHaveBeenCalled();
    expect(products.findBatch).not.toHaveBeenCalled();
  });
});
