FROM oven/bun:1 AS build

WORKDIR /app

COPY compiler /app/compiler
RUN cd /app/compiler && bun install --frozen-lockfile && bun run build

COPY package.json /app/package.json
COPY bun.lock /app/bun.lock
COPY tsconfig.json /app/tsconfig.json
COPY src /app/src
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1-slim

WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/compiler/dist ./compiler/dist

ENV NODE_ENV=production
EXPOSE 9000
CMD ["bun", "run", "start"]
