# syntax=docker/dockerfile:1.7
#
# moc API container. Built and pushed by .github/workflows/verify.yml deploy-api job;
# deployed to Google Cloud Run.
#
# Runtime: tsx (already a devDep of apps/api). The workspace libs publish their
# TypeScript source via package.json `main: "./src/index.ts"`, which `node` cannot
# load directly. Switching to a compiled runtime requires giving each lib a build
# step and dist-pointing main — out of scope for this PR; tracked as future work.
# See ARCHITECTURE.md § Deployment.

# ──────────────────────────────────────────────
# Stage 1: install workspace dependencies
# ──────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Workspace package manifests. Copying these before running npm ci means the
# install layer is cached on lockfile changes only, not on every source edit.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY libs/shared/contracts/package.json ./libs/shared/contracts/
COPY libs/api/core/package.json ./libs/api/core/
COPY libs/web/core/package.json ./libs/web/core/
COPY libs/web/design-system/package.json ./libs/web/design-system/

# Install across the full workspace tree so npm's lockfile validates. Web deps
# are installed but not copied into the runtime stage. devDeps stay in (we need
# tsx at runtime).
RUN npm ci

# ──────────────────────────────────────────────
# Stage 2: runtime — only the API and the libs it imports
# ──────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./

COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/api/src ./apps/api/src

COPY libs/shared/contracts/package.json libs/shared/contracts/tsconfig.json ./libs/shared/contracts/
COPY libs/shared/contracts/src ./libs/shared/contracts/src

COPY libs/api/core/package.json libs/api/core/tsconfig.json ./libs/api/core/
COPY libs/api/core/src ./libs/api/core/src

# tsx (esbuild) walks up from the source file looking for tsconfig.json. Running
# from /app/apps/api makes apps/api/tsconfig.json the one it picks up — that
# tsconfig has `experimentalDecorators: true`, which Nest's @Inject / @Injectable
# require. Running from /app misses it and esbuild rejects every decorator.
WORKDIR /app/apps/api
EXPOSE 8080

CMD ["../../node_modules/.bin/tsx", "src/main.ts"]
