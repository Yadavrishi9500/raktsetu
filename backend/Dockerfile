# RaktSetu backend image. One image, two roles:
#   web    -> node src/server.js  (Beanstalk web environment)
#   worker -> node src/worker.js  (Beanstalk worker environment, fed by SQS via sqsd)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DB_SSL_CA=/app/certs/rds-global-bundle.pem
WORKDIR /app
RUN apk add --no-cache tini \
 && mkdir -p /app/certs \
 && wget -qO /app/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && chmod 644 /app/certs/rds-global-bundle.pem
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
