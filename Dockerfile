FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./
# Instalar as dependências (de produção e desenvolvimento)
RUN npm install

COPY . .


ENV PORT 3000

EXPOSE $PORT

CMD ["npx", "nodemon", "server.js"]