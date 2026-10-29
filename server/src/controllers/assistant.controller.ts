import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { sendSuccess } from "../lib/response.js";
import { assistantService } from "../services/assistant/assistant.service.js";
import type { AssistantMessageInput, ConversationParams } from "../validators/assistant.validator.js";

function device(req: Request) {
  if (!req.device) throw new UnauthorizedError();
  return req.device;
}

export const assistantController = {
  /**
   * Server-Sent Events: conversation → tool_start / tool_end (one pair per
   * tool call, as it happens) → answer → citations → done (or error).
   */
  async ask(req: Request, res: Response): Promise<void> {
    const { id, role } = device(req);
    const events = assistantService.ask(id, role, req.validated.body as AssistantMessageInput);

    // The first event proves the conversation exists; a 404 still goes out as normal JSON.
    const first = await events.next();

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;
    req.on("close", () => {
      closed = true;
      void events.return(undefined);
    });

    const write = (event: { type: string }) => {
      if (!closed) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    if (!first.done) write(first.value);
    for await (const event of events) write(event);
    if (!closed) res.end();
  },

  async tools(req: Request, res: Response): Promise<void> {
    sendSuccess(res, 200, "Tools available to this device", assistantService.tools(device(req).role));
  },

  async conversation(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ConversationParams;
    sendSuccess(res, 200, "Conversation", await assistantService.transcript(device(req).id, id));
  },
};
