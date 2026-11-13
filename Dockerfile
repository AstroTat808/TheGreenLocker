FROM node:24-alpine
ENV NODE_ENV=production TGL_ENV=staging TGL_HOST=0.0.0.0 PORT=4174
WORKDIR /app
COPY . /app
RUN addgroup -S tgl && adduser -S tgl -G tgl && mkdir -p /data/images && chown -R tgl:tgl /data && chmod 700 /data
USER tgl
EXPOSE 4174
CMD ["sh", "-c", "node scripts/staging-preflight.mjs && exec node private/server.mjs"]
