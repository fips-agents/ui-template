# ui-template

A minimal chat UI that connects to any OpenAI-compatible API endpoint (vLLM, an AI agent, a gateway, etc.). Ships as a single Go binary with embedded static files -- no Node.js, no build step, no framework dependencies.

<!-- TODO: Add screenshot -->

## Features

**Settings and model control** -- Temperature, max tokens, top-p/top-k, frequency/presence/repetition penalty, and reasoning effort. Backend selection for vLLM vs LlamaStack, with a Responses API toggle.

**Agent introspection** -- If the backend serves `GET /v1/agent-info`, the settings panel populates with the model's system prompt and available tools. Tools are expandable to show parameter details. Gracefully degrades when the endpoint is absent.

**Reasoning and tool calls** -- Collapsible panel for thinking/reasoning content from models that support it. Tool call visualization with state tracking (running, done, error).

**Stream metrics and debugging** -- Token counts, average inter-token latency, and time-to-first-token. A raw API response viewer for inspecting the full SSE payload.

**Inline feedback** -- Thumbs-up/-down on completed assistant messages, with an inline note next to the icon after a thumbs-down submission. The note is editable: clicking it reopens the modal so you can change the category, edit the comment, or flip the rating. Edits PATCH the existing record rather than creating duplicates. Visibility is configurable via the `data-feedback-visibility` attribute on `<body>` in `index.html` -- `hover` (default), `always` (icons always visible, useful for internal/eval/QA tooling), or `off`. Controls are hidden when no `trace_id` is available, so older backends silently degrade.

## Architecture

The Go server embeds the static frontend into a single binary via `go:embed`. At runtime it does three things:

1. Serves the static files (HTML/CSS/JS) at the root.
2. Runs a reverse proxy at `/v1/` that forwards all requests to the backend API configured via `API_URL`. This eliminates CORS issues -- the browser only talks to the Go server.
3. Exposes `GET /api/config` (returns the raw API URL as JSON) and `GET /healthz` for container probes.

The frontend discovers the backend via `/api/config` on page load, but all API traffic flows through the `/v1/` reverse proxy on the same origin.

## Backend Contract

The backend must be OpenAI chat-completions compatible (`POST /v1/chat/completions` with SSE streaming).

Optionally, the backend can serve `GET /v1/agent-info` to populate the settings panel with model info, system prompt, available tools, and backend configuration. If this endpoint is not available, the settings panel shows only the client-side controls.

For inline feedback to work, the backend must surface a `trace_id` (either in an `X-Trace-Id` response header or as a top-level `trace_id` field on the final SSE usage chunk) and accept `POST /v1/feedback` with `{trace_id, rating, comment?}`. Backends without these features simply hide the feedback icons; everything else continues to work.

## Quick Start

```bash
# Build and run (defaults to http://localhost:8080 as the API backend)
make build
API_URL=http://localhost:8080 ./bin/server

# Or just:
make run
```

Then open http://localhost:3000.

## Configuration

Set these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8080` | OpenAI-compatible chat completions endpoint |
| `PORT` | `3000` | Server listen port |

The frontend discovers the API endpoint at runtime via `GET /api/config`, so the same binary works against any backend without rebuilding.

## Deployment

Build the container and deploy to OpenShift:

```bash
make image-build
make deploy PROJECT=my-project
```

See `chart/values.yaml` for Helm configuration, including `config.API_URL` to point at your backend service.
