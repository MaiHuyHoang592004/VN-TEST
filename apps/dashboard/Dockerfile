# Container image for the dashboard — the exit door from Vercel.
#
# Not used by Vercel deploys. It exists so "we can move to ECS/EC2 later" is a
# verified fact rather than a hope: CI builds this on every PR, so the day we
# actually want to move, there is no archaeology.
#
# Build from the REPO ROOT (workspace libs must be in context):
#   docker build -f apps/dashboard/Dockerfile -t gwprint-dashboard .
#   docker run -p 3000:3000 --env-file .env.prod gwprint-dashboard
#
# Runtime env required: DATABASE_URL, AUTH_SECRET, AUTH_URL,
# AUTH_GOOGLE_ID/SECRET, RESEND_API_KEY.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/dashboard/package.json apps/dashboard/
COPY libs/db/package.json libs/db/
COPY libs/auth/package.json libs/auth/
COPY libs/shared/package.json libs/shared/
# libs/db postinstall runs `prisma generate`, which needs the schema present.
COPY libs/db/prisma libs/db/prisma
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# Build-time only, and deliberately fake: `prisma generate` never connects and
# no page is statically rendered against live data. These mirror the
# placeholders CI uses, so a failure here is a real failure and not a missing
# secret. They live in the builder stage and never reach the runtime image.
ENV DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder
ENV AUTH_SECRET=build-only
# THIS IMAGE BUILDS WITH sh, and says so rather than hoping.
#
# The repo root carries an .npmrc pinning `script-shell=bash`, which exists only
# to stop npm on Windows handing scripts to cmd.exe. These stages are
# node:24-alpine: /bin/sh is busybox ash — already POSIX, which is all these
# scripts need — and there is no bash on PATH at all. When that file reached the
# builder, every npm script died with `spawn bash ENOENT` and the build failed
# at db:generate (deploy 9023b082).
#
# .dockerignore also excludes .npmrc, and that is the tidier of the two fixes.
# This line stays anyway because it is the one that cannot be undone by editing
# a different file: an .npmrc arriving by any route — a new COPY, a relaxed
# ignore rule, a base image change — is overridden here, next to the build steps
# it protects, where someone changing them will see it.
ENV npm_config_script_shell=/bin/sh
# Prisma client is generated into libs/db/src/generated and must exist before
# the Next build type-checks against it.
RUN npm run db:generate -w @gwprint/db
RUN npx turbo run build --filter=@gwprint/dashboard

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next binds to localhost by default, which is unreachable from outside the
# container. ECS/ALB health checks fail silently on this.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: "standalone"` traces only the files actually needed, including the
# workspace libs (outputFileTracingRoot points at the repo root).
COPY --from=builder --chown=nextjs:nodejs /repo/apps/dashboard/.next/standalone ./
# Static assets and public/ are NOT traced into standalone — copy them in, or
# every page renders unstyled with broken images.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/dashboard/public ./apps/dashboard/public

USER nextjs
EXPOSE 3000

# Give the platform a real health signal instead of "is the port open".
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/dashboard/server.js"]
