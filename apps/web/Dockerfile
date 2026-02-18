FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_DEV_BEARER_TOKEN
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_DEV_BEARER_TOKEN=$NEXT_PUBLIC_DEV_BEARER_TOKEN

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts

COPY packages/contracts packages/contracts
COPY apps/web apps/web

RUN npm run build -w @rss-wrangler/contracts
RUN npm run build -w @rss-wrangler/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/contracts /app/packages/contracts
COPY --from=build /app/apps/web /app/apps/web
COPY --from=build /app/apps/web/.next/static /app/apps/web/.next/standalone/apps/web/.next/static
COPY --from=build /app/apps/web/public /app/apps/web/.next/standalone/apps/web/public

WORKDIR /app/apps/web/.next/standalone/apps/web

EXPOSE 3000
CMD ["node", "server.js"]
