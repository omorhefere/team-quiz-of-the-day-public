FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
WORKDIR /app
# Fonts for the OG share-card renderer (@resvg/resvg-js uses system fonts).
RUN apk add --no-cache fontconfig ttf-dejavu && fc-cache -f
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
# Migrations are applied automatically on first DB use (see app/db/client.ts),
# so the migrations folder must be present in the runtime image.
COPY ./drizzle /app/drizzle
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
