FROM oven/bun:1 as base

WORKDIR /app

COPY package.json /app/
COPY bun.lockb /app/

RUN bun install --frozen-lockfile --production

COPY . /app

ENV NODE_ENV production
ENTRYPOINT ["bun", "run", "server"]

EXPOSE 1234