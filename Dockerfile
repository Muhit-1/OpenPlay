# OpenPlay for a home / office LAN: one container serving the UI and the API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY api ./api
COPY shared ./shared
COPY server.js ./
USER node
EXPOSE 8080
CMD ["node", "server.js", "--prod"]
