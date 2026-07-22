import { encodeAgentEvent } from "@/lib/agent/events";
import { runChatGeneration } from "@/lib/agent/run-chat";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Legacy NDJSON endpoint. Preferred path is the RSC Flight server action
 * `streamChatAction` in `app/actions/chat.ts` (`content-type: text/x-component`).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      chatId?: string;
      message?: string;
      isFirst?: boolean;
      attachmentIds?: string[];
      thinkingLevel?: string;
    };

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const safeEnqueue = (text: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            closed = true;
          }
        };
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        try {
          await runChatGeneration(
            {
              chatId: body.chatId ?? "",
              message: body.message ?? "",
              isFirst: body.isFirst,
              attachmentIds: body.attachmentIds,
              thinkingLevel: body.thinkingLevel,
            },
            (event) => {
              safeEnqueue(encodeAgentEvent(event));
            },
          );
          safeClose();
        } catch (err) {
          console.error("[chat stream]", err);
          const msg = err instanceof Error ? err.message : "Stream failed";
          try {
            safeEnqueue(
              encodeAgentEvent({ type: "error", message: msg }),
            );
          } catch {
            /* ignore */
          }
          safeClose();
        }
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[chat POST]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 502 },
    );
  }
}
