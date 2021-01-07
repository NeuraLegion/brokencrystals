FROM node:10 AS builder

RUN mkdir -p /home/node/bc/node_modules

WORKDIR /home/node/bc

COPY package*.json ./
COPY tsconfig.json ./
COPY .env ./
COPY src ./src
COPY public ./public
COPY source_control_files ./source_control_files

RUN npm install
RUN npm run build

FROM staticfloat/nginx-certbot

COPY --from=builder  /home/node/bc/build /var/www/html
