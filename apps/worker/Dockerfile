FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm install

COPY packages/contracts packages/contracts
COPY apps/worker apps/worker

RUN npm run build -w @rss-wrangler/contracts
RUN npm run build -w @rss-wrangler/worker

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/contracts /app/packages/contracts
COPY --from=build /app/apps/worker /app/apps/worker

CMD ["npm", "run", "start", "-w", "@rss-wrangler/worker"]
