FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci
RUN cd client && npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/client/vcs ./client/vcs

USER node

CMD ["node", "dist/main.js"]
