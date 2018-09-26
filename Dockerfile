FROM node:10.1.0-alpine
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json /app/
COPY yarn.lock /app/

RUN yarn install --production && yarn cache clean

COPY . /app

ENV NODE_ENV production
ENTRYPOINT ["node", "-r", "esm", "./bin/server"]

HEALTHCHECK --start-period=30s \
  CMD curl -s localhost:$(netstat -nltWep | grep 1/node | awk '{ print $4 }'| cut -d ":" -f 2)/api/status || exit 1  