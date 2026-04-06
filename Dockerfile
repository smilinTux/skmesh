# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy all source files
COPY . .

# Build the Next.js static export
RUN npm run build

# Stage 2: Runtime image using nginx + supervisord (mirrors docker/Dockerfile)
FROM alpine:3.14

RUN apk add --no-cache bash curl less ca-certificates git tzdata zip gettext \
    nginx curl supervisor certbot-nginx && \
    rm -rf /var/cache/apk/* && mkdir -p /run/nginx

STOPSIGNAL SIGINT
EXPOSE 80
EXPOSE 443
ENTRYPOINT ["/usr/bin/supervisord","-c","/etc/supervisord.conf"]

WORKDIR /usr/share/nginx/html

# Copy nginx and supervisor configuration files
COPY docker/default.conf /etc/nginx/http.d/default.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/init_cert.sh /usr/local/init_cert.sh
COPY docker/init_react_envs.sh /usr/local/init_react_envs.sh
RUN chmod +x /usr/local/init_cert.sh && rm /etc/crontabs/root
RUN chmod +x /usr/local/init_react_envs.sh

# Configure supervisor
COPY docker/supervisord.conf /etc/supervisord.conf

# Copy Next.js static build output from builder stage
COPY --from=builder /app/out/ /usr/share/nginx/html/
