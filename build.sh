#!/bin/bash
set -eu -o pipefail

## General internal vars
image="${CI_REGISTRY_IMAGE:-localtunnel-server}"
tag="${CI_COMMIT_REF_SLUG:-latest}"

echo ""
echo "Building $image:$tag"
node_container=$(buildah from docker.io/node:16.17.1-alpine3.15)

## General configuration
buildah config \
  --author='Jav <jotamontecino@gmail.com>' \
  --workingdir=/usr/src/app/ \
  $node_container

## Adding raw layers
function brun() {
  buildah run $node_container -- "$@"
}
podman run --rm -it  -v "$PWD":/usr/src/app/ trashnochados/nodejs:raw-node16 yarn install
## Set alpine as starting point
buildah add $node_container ./bin /usr/lts/bin
buildah add $node_container ./lib /usr/lts/lib
buildah add $node_container ./server.js /usr/lts/server.js
buildah add $node_container ./package.json /usr/lts/package.json
buildah add $node_container ./node_modules /usr/lts/node_modules
brun npm i -g /usr/lts/ ## Set the link so the the nodejs module can be used as a cli directly

## Creating image
buildah commit --rm $node_container "$image:$tag"
