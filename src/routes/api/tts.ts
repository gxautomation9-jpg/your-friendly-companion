import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { error: "tts_disabled", message: "Voice output is handled locally in the browser." },
          { status: 410 },
        ),
      GET: async () =>
        Response.json(
          { error: "tts_disabled", message: "Voice output is handled locally in the browser." },
          { status: 410 },
        ),
    },
  },
});