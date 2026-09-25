FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm install -g pm2 && npm cache clean --force

COPY . .

# Dossier d'upload partagé avec le worker (un volume nommé hérite de ce propriétaire)
RUN mkdir -p /data/uploads && chown -R appuser:appgroup /app /data

USER appuser

EXPOSE 5000

CMD ["pm2-runtime", "ecosystem.config.js", "--only", "banking-api"]
