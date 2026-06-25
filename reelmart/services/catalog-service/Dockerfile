# catalog-service Dockerfile
# Two-stage build: builder compiles TypeScript + installs sharp with native deps;
# runtime stage keeps only production deps + the compiled dist/.
#
# sharp on Alpine (musl): sharp 0.33+ ships a linux-musl-x64 prebuilt binary via
# npm. The prebuilt is downloaded at npm install time when
# SHARP_IGNORE_GLOBAL_LIBVIPS=1 is NOT set (default). To guarantee the prebuilt
# loads at runtime we also install the vips shared library in the runtime stage.
# Build stage additionally needs vips-dev + build-base for the rare case where
# the prebuilt is unavailable and sharp falls back to building from source.
#
# Risk note: verified locally via `docker buildx build --platform linux/amd64`.

FROM node:22-alpine AS builder
WORKDIR /app

# Build-time deps: vips-dev for sharp native build fallback; fftw-dev + build-base
# + python3 are required by node-gyp if sharp compiles from source instead of
# using the prebuilt binary.
RUN apk add --no-cache vips-dev fftw-dev build-base python3

COPY package*.json ./
# Let npm use the prebuilt sharp binary for linux-musl-x64.
# SHARP_IGNORE_GLOBAL_LIBVIPS=1 would tell sharp to ignore any system vips and
# use its own bundled binary — leave it unset so the prebuilt is used.
RUN npm install
COPY . .
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# vips shared library required by the sharp prebuilt at runtime on Alpine.
RUN apk add --no-cache vips

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
