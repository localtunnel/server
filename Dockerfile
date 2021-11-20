FROM node:16.11.1-alpine

WORKDIR /app

COPY package.json /app/
COPY package-lock.json /app/

RUN npm install

COPY . /app

ENV NODE_ENV production

EXPOSE 8080

CMD npm start
