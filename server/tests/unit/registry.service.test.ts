import { describe, expect, it, vi } from "vitest";
import { productRepository } from "../../src/repositories/product.repository.js";
import { registryService } from "../../src/services/registry.service.js";

vi.mock("../../src/repositories/product.repository.js", () => ({
  productRepository: { search: vi.fn().mockResolvedValue([]) },
}));

const search = vi.mocked(productRepository.search);

describe("registryService.search, when to match a number prefix", () => {
  it.each([
    ["coartem", null],
    ["nafdac", null], // normalises to "", must NOT become an "everything" prefix
    ["NAFDAC Reg No", null],
    ["paracetamol 500", null],
    ["A4", "A4"],
    ["a4-12", "A4-12"],
    ["04-56", "04-56"],
    ["NAFDAC No A4-1", "A4-1"],
  ])("%j → number prefix %j", async (query, expectedPrefix) => {
    await registryService.search(query, 10);
    expect(search).toHaveBeenLastCalledWith(query, expectedPrefix, 10);
  });
});
