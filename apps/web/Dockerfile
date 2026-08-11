# Stage 1: Build Workspace Codebase
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root lockfiles and workspaces package.json files
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install compilation packages
RUN npm ci

# Copy codebase contents
COPY packages/shared ./packages/shared/
COPY apps/web ./apps/web/

# Build Shared packages and Web client application
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

# Stage 2: Production Lightweight Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

# Set production node environment
ENV NODE_ENV=production

# Copy packages descriptor and lockfile
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled resources and Next.js optimization artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

# Expose Next.js default port
EXPOSE 3000

# Start production Next.js runner
CMD ["npm", "run", "start", "--workspace=apps/web"]
