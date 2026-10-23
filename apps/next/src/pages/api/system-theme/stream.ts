import type { NextApiRequest, NextApiResponse } from "next";

import {
  readSystemTheme,
  subscribeToSystemTheme,
} from "../../../lib/system-theme/server";

export const config = {
  api: { responseLimit: false, externalResolver: true },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!(await readSystemTheme())) {
    return res.status(404).json({ error: "No system theme" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 1000\n\n");

  const unsubscribe = subscribeToSystemTheme((snapshot) => {
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
