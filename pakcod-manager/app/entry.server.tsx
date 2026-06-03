import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

const runMigrations = process.env.SKIP_MIGRATIONS !== "true" && process.env.NODE_ENV === "production";

if (runMigrations) {
  import("./db.server").then(async ({ default: prisma }) => {
    try {
      await prisma.$connect();
      console.log("[boot] Database connected");
    } catch (err) {
      console.error("[boot] Database connection failed:", err);
    }
  });
}

const shouldStartScheduler = process.env.START_SCHEDULER === "true" && typeof globalThis !== "undefined";

if (shouldStartScheduler && !(globalThis as any).__schedulerStarted) {
  (globalThis as any).__schedulerStarted = true;
  import("./services/scheduler.server").then(({ setupScheduler }) => {
    try {
      setupScheduler();
      console.log("[boot] Background scheduler started");
    } catch (err) {
      console.error("[boot] Scheduler failed:", err);
    }
  });
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
