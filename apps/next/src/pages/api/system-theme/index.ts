import type { NextApiRequest, NextApiResponse } from "next";

import { readSystemTheme } from "../../../lib/system-theme/server";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const snapshot = await readSystemTheme();
  if (!snapshot) return res.status(404).json({ error: "No system theme" });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(snapshot);
}
