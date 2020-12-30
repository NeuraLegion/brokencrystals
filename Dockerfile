FROM node:10-alpine

#FROM node:12
RUN mkdir -p /home/node/bc/node_modules && chown -R node:node /home/node/bc
#RUN mkdir -p /home/node/bc/node_modules

WORKDIR /home/node/bc
COPY --chown=node:node package*.json ./
USER node
RUN npm i --verbose
COPY --chown=node:node . .
RUN npm run build
#COPY --chown=node:node . .
#COPY --chown=node:node package*.json ./
#COPY --chown=node:node dist ./dist
#COPY --chown=node:node config ./config
#COPY --chown=node:node .env ./
RUN ls -al

#USER node

RUN npm install

#COPY --chown=node:node . .

EXPOSE 3000

#CMD [ "node", "./dist/main.js" ]
CMD [ "node", "dist/main.js" ]
