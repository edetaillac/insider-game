FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit

COPY app.js ./
COPY src ./src
COPY public ./public
COPY views ./views
COPY words ./words

USER node
EXPOSE 8080
CMD ["node", "app.js"]
