import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { NotFoundError } from "../../src/lib/errors.js";
import { signAccessToken } from "../../src/lib/tokens.js";
import { assistantService } from "../../src/services/assistant/assistant.service.js";
import { deviceService } from "../../src/services/device.service.js";

vi.mock("../../src/services/device.service.js", () => ({ deviceService: { getAuthState: vi.fn() } }));
vi.mock("../../src/services/assistant/assistant.service.js", () => ({
  assistantService: { ask: vi.fn(), tools: vi.fn(), transcript: vi.fn() },
}));

const app = createApp();
const auth = `Bearer ${signAccessToken({ sub: "device-1", role: "public", ver: 1 })}`;

beforeEach(() => {
  vi.mocked(deviceService.getAuthState).mockResolvedValue({ role: "public", tokenVersion: 1 });
});

describe("POST /api/v1/assistant/messages", () => {
  it("streams the agent's events as SSE", async () => {
    vi.mocked(assistantService.ask).mockImplementation(async function* () {
      yield { type: "conversation", conversationId: "c-1" };
      yield { type: "tool_start", name: "search_guidance", args: { query: "report" } };
      yield { type: "tool_end", name: "search_guidance", ok: true, summary: "2 passages" };
      yield { type: "answer", text: "Call NAFDAC [1]." };
      yield { type: "done", conversationId: "c-1", rounds: 2, provider: "gemini" };
    });

    const res = await request(app).post("/api/v1/assistant/messages").set("Authorization", auth).send({ message: "How do I report a fake drug?" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text.match(/^event: (\w+)$/gm)).toEqual([
      "event: conversation",
      "event: tool_start",
      "event: tool_end",
      "event: answer",
      "event: done",
    ]);
    expect(assistantService.ask).toHaveBeenCalledWith("device-1", "public", { message: "How do I report a fake drug?" });
  });

  it("an unknown conversation is a normal 404 JSON response, not a stream", async () => {
    vi.mocked(assistantService.ask).mockImplementation(async function* () {
      throw new NotFoundError("Conversation not found");
    });
    const res = await request(app)
      .post("/api/v1/assistant/messages")
      .set("Authorization", auth)
      .send({ message: "hi", conversationId: "6f1c2a8e-3b4d-4c5e-8f90-1a2b3c4d5e6f" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("validates the question: present, ≤ 1,000 characters, no extra fields", async () => {
    for (const body of [{}, { message: "x".repeat(1001) }, { message: "hi", role: "regulator" }, { message: "hi", conversationId: "nope" }]) {
      const res = await request(app).post("/api/v1/assistant/messages").set("Authorization", auth).send(body);
      expect(res.status).toBe(422);
    }
    expect(assistantService.ask).not.toHaveBeenCalled();
  });

  it("needs a device token", async () => {
    expect((await request(app).post("/api/v1/assistant/messages").send({ message: "hi" })).status).toBe(401);
  });
});

describe("assistant tools and transcripts", () => {
  it("lists the tools for the device's role", async () => {
    vi.mocked(assistantService.tools).mockReturnValue([{ name: "search_guidance", description: "d" }]);
    const res = await request(app).get("/api/v1/assistant/tools").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(assistantService.tools).toHaveBeenCalledWith("public");
  });

  it("a transcript is scoped to the device", async () => {
    vi.mocked(assistantService.transcript).mockResolvedValue({} as never);
    const id = "6f1c2a8e-3b4d-4c5e-8f90-1a2b3c4d5e6f";
    expect((await request(app).get(`/api/v1/assistant/conversations/${id}`).set("Authorization", auth)).status).toBe(200);
    expect(assistantService.transcript).toHaveBeenCalledWith("device-1", id);
  });
});
