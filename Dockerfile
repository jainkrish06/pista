# Stage 1: Build Workspace Codebase
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root lockfiles and workspaces package.json files
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Install compilation packages
RUN npm ci

# Copy codebase contents
COPY packages/database ./packages/database/
COPY packages/shared ./packages/shared/
COPY apps/server ./apps/server/

# Generate Prisma Client binary mapping
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build Shared packages and Server application
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/database
RUN npm run build --workspace=apps/server

# Stage 2: Production Lightweight Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

# Set node environment
ENV NODE_ENV=production

# Install PM2 globally for clustering
RUN npm install -g pm2

# Copy packages descriptor and lockfile
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Install only production dependencies (omit devDependencies)
RUN npm ci --omit=dev

# Copy compiled resources and generated Prisma binary
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

# Copy PM2 config
COPY apps/server/ecosystem.config.cjs ./apps/server/

# Expose backend port
EXPOSE 4000

# Run database migrations and boot Fastify cluster
CMD npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma && pm2-runtime start apps/server/ecosystem.config.cjs
