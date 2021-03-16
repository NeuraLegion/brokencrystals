FROM node:10 AS builder

WORKDIR /home/node/bc

COPY package*.json ./
COPY tsconfig.json ./
COPY .env ./
COPY src ./src
COPY public ./public
COPY vcs ./vcs

RUN npm ci -q
RUN npm run build

FROM nginx AS http

COPY --from=builder  /home/node/bc/build /var/www/html

FROM staticfloat/nginx-certbot AS https

COPY --from=builder  /home/node/bc/build /var/www/html
