import serverless from "serverless-http";
import { createServer } from "../../server";

// Netlify functions live under /.netlify/functions/api/*
// Express app defines routes under /api/*, so we set basePath to match the function mount path
// and still allow /api/* routes to resolve correctly when redirected by netlify.toml.
export const handler = serverless(createServer(), {
  basePath: "/.netlify/functions/api",
});
