FROM node:24-bookworm-slim
WORKDIR /app
# Explicit publication allowlist: no credentials, signing keys, tooling or local test state.
COPY server/ ./server/
COPY ui/guandan-rules.mjs ui/guandan-engine.mjs ui/guandan-deal.mjs ./ui/
COPY guandan-game.js multiplayer-ext.js ./
COPY scripts/public-config.mjs scripts/online-public-config.mjs ./scripts/
COPY config.js ./
RUN mkdir -p /var/data/nobi && chown node:node /var/data/nobi
USER node
EXPOSE 8080
CMD ["node", "server/production.mjs"]
