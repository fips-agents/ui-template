# CLAUDE.md

## Project Overview

A minimal, self-contained chat UI that connects to any OpenAI-compatible API endpoint. The Go server embeds static files into a single binary and serves them alongside a config endpoint that tells the frontend where the API lives.

## Build and Run

```bash
# Build binary
make build

# Run locally (connects to localhost:8080 by default)
make run

# Run with custom API endpoint
API_URL=https://my-agent.apps.cluster.example.com make run
```

## Architecture

The project has two layers:

**Go server** (`cmd/server/main.go`) -- a ~90-line HTTP server that:
- Embeds static files via Go's `embed` package (through `static/embed.go`)
- Reverse-proxies `/v1/*` requests to the backend, eliminating CORS issues
- Serves `GET /api/config` returning the API_URL as JSON
- Serves `GET /healthz` for container probes
- Handles graceful shutdown on SIGTERM

**Static frontend** (`static/`) -- vanilla HTML/CSS/JS, no build step:
- Fetches `/api/config` on load; fetches `/v1/agent-info` to populate a settings panel with model info, parameters, tools, and system prompt
- Posts to the local `/v1/chat/completions` proxy with `stream: true`
- Parses SSE responses with streaming display, reasoning/thinking content panel, tool call visualization, and stream metrics (tokens/s, inter-token latency)
- Maintains conversation history in memory

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8080` | OpenAI-compatible API endpoint |
| `PORT` | `3000` | Server listen port |

## Deployment to OpenShift

```bash
# Build container
make image-build

# Push to registry (adjust for your registry)
podman tag ui-template:latest registry.example.com/my-project/ui-template:latest
podman push registry.example.com/my-project/ui-template:latest

# Deploy via Helm
helm upgrade --install my-ui chart/ -n my-project \
  --set image.repository=registry.example.com/my-project/ui-template \
  --set config.API_URL=http://my-agent:8080

# Or use the Makefile shortcut
make deploy PROJECT=my-project
```

## How the UI Discovers the API

The frontend never hardcodes an API URL. On page load, `app.js` calls `GET /api/config`, which returns `{"apiUrl": "..."}` sourced from the `API_URL` environment variable. However, all actual API traffic flows through the server's `/v1/` reverse proxy -- the browser posts to `/v1/chat/completions` on its own origin, and the server forwards the request to the configured backend. This eliminates CORS issues and keeps the static files truly static. The API URL is configured at deploy time via the ConfigMap.

## Sentinel Strings

This is a template repository. During scaffolding, `"ui-template"` is replaced with the actual project name. Sentinel occurrences:
- `index.html` title and header
- `go.mod` module path
- `Chart.yaml` name
- `Containerfile` label
- `Makefile` PROJECT/IMAGE_NAME defaults
- `chart/values.yaml` image repository
- `chart/templates/_helpers.tpl` template names

## Testing

```bash
make lint    # go vet
make test    # go test (currently no test files)
```
