FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --ignore-scripts

COPY packages/contracts packages/contracts
COPY apps/api apps/api

RUN npm run build -w @rss-wrangler/contracts
RUN npm run build -w @rss-wrangler/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/contracts /app/packages/contracts
COPY --from=build /app/apps/api /app/apps/api
COPY db /app/db
COPY scripts /app/scripts

EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@rss-wrangler/api"]
