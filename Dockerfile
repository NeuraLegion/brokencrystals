FROM node:14

WORKDIR /var/www/

COPY package*.json ./

RUN npm ci -q

COPY config ./config
COPY tsconfig.build.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY .env ./
COPY src ./src

RUN npm run build
RUN npm prune --production

RUN chown -R node:node /var/www/*

USER node

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
