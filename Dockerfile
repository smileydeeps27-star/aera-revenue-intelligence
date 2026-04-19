FROM node:20-slim

WORKDIR /app

# zero-dep app, but copy package.json first for layer caching
COPY package.json ./
RUN npm install --omit=dev || true

COPY . .

# seed the JSON store on each cold boot (ephemeral filesystem on Railway)
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

CMD ["sh", "-c", "node seed/load-seed.js && node server.js"]
