import type { Request, Response } from "express";
import { toScanLocation } from "../lib/areas.js";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";
import { sendSuccess } from "../lib/response.js";
import { scanProgress, type SequencedEvent } from "../lib/scanProgress.js";
import { photoScanService } from "../services/photoScan.service.js";
import { scanService } from "../services/scan.service.js";
import type { ScanParams, ScanUploadInput } from "../validators/scan.validator.js";

/** Comment line that keeps proxies (Render) from closing an idle stream. */
const HEARTBEAT_MS = 15_000;
/** A scan takes seconds; a stream open longer than this is abandoned. The client falls back to polling. */
const MAX_STREAM_MS = 3 * 60_000;

function deviceId(req: Request): string {
  if (!req.device) throw new UnauthorizedError();
  return req.device.id;
}

export const photoScanController = {
  async submit(req: Request, res: Response): Promise<void> {
    if (!req.file) throw new ValidationError([{ field: "image", message: "Photo is required" }]);
    const accepted = await photoScanService.submit(
      deviceId(req),
      req.file.buffer,
      toScanLocation(req.validated.body as ScanUploadInput)
    );
    res.setHeader("Location", accepted.statusUrl);
    sendSuccess(res, 202, "Scan accepted — follow eventsUrl for progress", accepted);
  },

  /**
   * Server-Sent Events: each pipeline step as it finishes, then `verdict`
   * (or `error`) and the stream closes. Events carry an id, so a client
   * reconnecting with Last-Event-ID only gets what it missed.
   */
  async streamEvents(req: Request, res: Response): Promise<void> {
    const { id } = req.validated.params as ScanParams;
    // 404 for another device's scan, before any stream is opened.
    const scan = await scanService.getForDevice(deviceId(req), id);

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let lastSeq = Number(req.get("Last-Event-ID")) || 0;
    let closed = false;
    let unsubscribe: (() => Promise<void>) | undefined;

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      void unsubscribe?.();
      res.end();
    };

    const send = (event: SequencedEvent) => {
      if (closed || event.seq <= lastSeq) return;
      lastSeq = event.seq;
      res.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "verdict" || event.type === "error") finish();
    };

    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const timeout = setTimeout(finish, MAX_STREAM_MS);
    req.on("close", finish);

    // Subscribe before reading the history, so nothing published in between is lost.
    unsubscribe = await scanProgress.subscribe(id, send);
    if (closed) {
      void unsubscribe();
      return;
    }
    for (const event of await scanProgress.history(id)) send(event);

    // Finished long ago (progress expired) or a manual check: send the final state from the database.
    if (!closed && (scan.status === "done" || scan.status === "failed")) {
      const at = new Date().toISOString();
      send(
        scan.status === "done"
          ? { type: "verdict", scanId: id, result: scan, seq: lastSeq + 1, at }
          : {
              type: "error",
              scanId: id,
              code: scan.failure?.code ?? "INTERNAL_ERROR",
              message: scan.advice,
              seq: lastSeq + 1,
              at,
            }
      );
    }
  },
};
