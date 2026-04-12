FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/client ./client
COPY --from=build /app/tsconfig*.json ./
COPY --from=build /app/nest-cli.json ./
COPY --from=build /app/ormconfig.* ./
# Ensure sensitive environment files are not present in the runtime image.
RUN rm -f .env .env.local .env.development .env.production .env.test .env.development.local .env.production.local .env.test.local || true
RUN addgroup -S node && adduser -S node -G node
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
