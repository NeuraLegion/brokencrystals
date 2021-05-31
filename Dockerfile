FROM node:10

WORKDIR /home/node/bc

COPY package*.json ./
COPY config ./config
COPY tsconfig.build.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY .env ./
COPY src ./src

RUN npm ci -q
RUN npm run build
RUN npm prune --production

RUN chown -R node:node /home/*

USER node

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
