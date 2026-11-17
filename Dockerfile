FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY scripts/patch-nitrostack.mjs ./scripts/patch-nitrostack.mjs
RUN npm ci --no-fund
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/patch-nitrostack.mjs ./scripts/patch-nitrostack.mjs
RUN npm ci --omit=dev --no-fund && npm cache clean --force
COPY --from=build /app/dist/src ./dist/src
COPY data ./data
COPY workflows ./workflows
USER node
EXPOSE 4310
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4310/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
