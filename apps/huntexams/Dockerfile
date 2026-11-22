# Build from the repository root:  docker build -f apps/huntexams/Dockerfile -t huntexams-web .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @huntexams/web... && pnpm --filter @huntexams/web build

FROM nginx:1.27-alpine
COPY apps/huntexams/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/huntexams/dist /usr/share/nginx/html
