FROM node:10-alpine

RUN mkdir -p /home/node/bc/node_modules && chown -R node:node /home/node/bc

WORKDIR /home/node/bc

COPY --chown=node:node package*.json ./
COPY --chown=node:node config ./config
COPY --chown=node:node tsconfig.build.json ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node nest-cli.json ./
COPY --chown=node:node .env ./
COPY --chown=node:node src ./src

USER node

RUN npm install
RUN npm run build

EXPOSE 3000

CMD [ "npm", "run", "start" ]
