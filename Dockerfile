FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY bin ./bin
COPY src ./src
COPY schemas ./schemas
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./

USER node
CMD ["node", "bin/qarinah.js", "mcp"]
