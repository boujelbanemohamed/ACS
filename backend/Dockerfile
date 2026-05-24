FROM node:18-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm install -g pm2 && npm cache clean --force

COPY . .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

CMD ["pm2-runtime", "ecosystem.config.js", "--only", "banking-api"]
