FROM node:20-slim

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 app && useradd --uid 1001 --gid app --shell /bin/bash --create-home app

WORKDIR /app

COPY --chown=app:app package*.json ./

RUN npm ci

RUN ./node_modules/.bin/vite --version || true

COPY --chown=app:app . .

RUN ./node_modules/.bin/vite build && ./node_modules/.bin/esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

USER app

EXPOSE 3000

CMD ["node", "dist/index.js"]
