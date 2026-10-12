# syntax=docker/dockerfile:1.7
# Image du bot Platine — multi-stage, node:24-slim, utilisateur non-root.
# Construire : docker build -t platine-bot .

ARG NODE_IMAGE=node:24-slim

# --- base : Node + pnpm (via corepack, version lue dans package.json#packageManager)
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# --- deps : dépendances de production uniquement
FROM base AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile \
    && mkdir -p node_modules

# --- build : toutes les dépendances + compilation TypeScript
FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# --- runtime : seulement dist/ + node_modules de prod
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HEALTH_PORT=8080
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Utilisateur non-root fourni par l'image officielle (uid 1000)
USER node
# Endpoint /healthz servi par src/ops/health.ts (tâche 0.4). Pas de curl dans l'image : fetch natif de Node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.HEALTH_PORT || 8080}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
