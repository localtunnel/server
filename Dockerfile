FROM mhart/alpine-node:4.2.1

RUN mkdir -p /app
WORKDIR /app

ADD package.json /app/

RUN apk add --update make git g++ python && \
    npm install --production && \
    apk del git make g++ python && \
    rm -rf /tmp/* /root/.npm /root/.node-gyp

ADD . /app

ENV NODE_ENV production
ENTRYPOINT ["bin/server"]
