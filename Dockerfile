###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:14-alpine As development

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig.build.json ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node nest-cli.json ./ 
COPY --chown=node:node mikro-orm.config.ts ./
COPY --chown=node:node .env ./
COPY --chown=node:node config ./config
COPY --chown=node:node keycloak ./keycloak
COPY --chown=node:node client ./client
COPY --chown=node:node src ./src


RUN apk add --no-cache --virtual .gyp python3 py3-pip make g++ 

RUN npm ci  
RUN npm ci --prefix=client --only=prod

RUN apk del .gyp

USER node

###################
# BUILD FOR PRODUCTION
###################

FROM node:14-alpine As build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig.build.json ./
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node nest-cli.json ./ 
COPY --chown=node:node mikro-orm.config.ts ./
COPY --chown=node:node .env ./
COPY --chown=node:node config ./config
COPY --chown=node:node keycloak ./keycloak
COPY --chown=node:node client ./client
COPY --chown=node:node src ./src

COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=development /usr/src/app/client/node_modules ./client/node_modules

RUN apk add --no-cache --virtual .gyp python3 py3-pip make g++ 

RUN npm run build
RUN npm run build --prefix=client

ENV NODE_ENV production

RUN npm ci --only=production && npm cache clean --force

RUN apk del .gyp

USER node

###################
# PRODUCTION
###################

FROM node:14-alpine As production

WORKDIR /usr/src/app

COPY --chown=node:node nest-cli.json ./ 
COPY --chown=node:node mikro-orm.config.ts ./
COPY --chown=node:node .env ./
COPY --chown=node:node config ./config
COPY --chown=node:node keycloak ./keycloak

COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/package*.json ./
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

COPY --chown=node:node --from=build /usr/src/app/client/node_modules ./client/node_modules
COPY --chown=node:node --from=build /usr/src/app/client/package*.json ./client/
COPY --chown=node:node --from=build /usr/src/app/client/build ./client/build

CMD ["npm", "run", "start:prod"]