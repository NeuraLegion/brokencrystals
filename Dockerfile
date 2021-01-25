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
RUN npm build

EXPOSE 3000

CMD [ "npm", "run", "start" ]
