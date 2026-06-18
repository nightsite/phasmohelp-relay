FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY relay.js ./
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "relay.js"]
