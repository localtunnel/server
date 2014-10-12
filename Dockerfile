FROM node:0.10.32

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ADD package.json /usr/src/app/
RUN npm install
ADD . /usr/src/app

ENV NODE_ENV production
ENTRYPOINT ["bin/server"]
