FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8928 DATA_DIR=/data
EXPOSE 8928
VOLUME ["/data"]
CMD ["npm","start"]
