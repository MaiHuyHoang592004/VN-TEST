FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY libs/db/package.json libs/db/
COPY libs/shared/package.json libs/shared/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run db:generate -w @fulfillflow/db && npx turbo run build --filter=@fulfillflow/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo /repo
CMD ["node", "apps/api/dist/src/main.js"]
