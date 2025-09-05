import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServer } from "../server";

// Initialize Express app once per cold start
const app = createServer();

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Delegate handling to Express app (which serves only /api/* routes)
  return (app as unknown as (req: VercelRequest, res: VercelResponse) => void)(req, res);
}
