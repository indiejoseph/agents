FROM oven/bun:1.3-debian AS base

WORKDIR /app

ARG GOG_VERSION=0.12.0

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  unzip \
  nodejs \
  npm \
  python3 \
  python3-pip \
  python3-venv \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
  && apt-get update -qq \
  && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && ln -sf /usr/bin/pip3 /usr/local/bin/pip \
  && npm install -g pnpm@10 yarn@1 mastra

# --- agent-browser + Playwright Chromium ---
# 1. Install agent-browser globally
# 2. Install Playwright as a local project dependency so `npx playwright` works
# 3. Install Chromium browser + system deps
# We keep PLAYWRIGHT_BROWSERS_PATH at default (/root/.cache/ms-playwright) so
# agent-browser can find the Chromium binary at runtime.
ARG AGENT_BROWSER_VERSION=0.21.4
RUN npm install -g agent-browser@${AGENT_BROWSER_VERSION} \
  && apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

# gh CLI via official apt repo
RUN mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  && > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y gh \
  # gog CLI for Google Workspace
  && ARCH=$(dpkg --print-architecture | sed 's/arm64/arm64/' | sed 's/amd64/amd64/') \
  && curl -fsSL -o /tmp/gog.tar.gz \
  "https://github.com/steipete/gogcli/releases/download/v${GOG_VERSION}/gogcli_${GOG_VERSION}_linux_${ARCH}.tar.gz" \
  && tar -xzf /tmp/gog.tar.gz -C /usr/local/bin gog \
  && chmod +x /usr/local/bin/gog

# Copy uv binaries from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Set the path for tools
ENV PATH="/root/.local/bin:${PATH}"

RUN uv tool install basic-memory

FROM base AS install

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

FROM base AS builder

ENV MASTRA_STUDIO_BASE_PATH=/agents

COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN npx mastra build --studio \
  && cd .mastra/output && npm install || true

FROM base AS runner

ARG AGENT_VERSION=dev

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.mastra ./.mastra
COPY templates /app/templates
COPY entrypoint.sh /entrypoint.sh

RUN mkdir -p /workspace \
  && useradd -m -d /workspace -s /bin/bash appuser \
  && chown -R appuser:appuser /workspace \
  && chmod +x /entrypoint.sh

EXPOSE 4111

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:4111/health').then(r=>process.exit(r.ok?0:1))"

ENV MASTRA_STUDIO_PATH=/app/.mastra/output/studio
ENV HOME=/workspace
ENV PATH="/workspace/.local/bin:${PATH}"

WORKDIR /workspace
USER appuser

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "/app/.mastra/output/index.mjs"]
