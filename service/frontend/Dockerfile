FROM oven/bun:1 AS build

WORKDIR /app/api
COPY api/package.json api/bun.lock ./
RUN bun install --frozen-lockfile
COPY api/src ./src

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
RUN bun run build

FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
RUN mkdir /etc/nginx/templates
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
