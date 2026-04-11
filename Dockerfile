FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
# Ensure the runtime image does not contain a web-accessible .htaccess file.
RUN rm -f /usr/share/nginx/html/.htaccess /usr/share/nginx/html/**/.htaccess || true
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
