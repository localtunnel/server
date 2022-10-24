#!/bin/bash
set -eu -o pipefail

## General internal vars
image="${CI_REGISTRY_IMAGE:-localtunnel-server}"
tag="${CI_COMMIT_REF_SLUG:-latest}"

echo ""
echo "Building $image:$tag"
node_container=$(buildah from docker.io/trashnochados/nodejs:raw-node16)

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
buildah add $node_container ./bin /usr/src/app/bin
buildah add $node_container ./lib /usr/src/app/lib
buildah add $node_container ./server.js /usr/src/app/server.js
buildah add $node_container ./package.json /usr/src/app/package.json
buildah add $node_container ./node_modules /usr/src/app/node_modules
buildah add $node_container ./.env /usr/src/app/.env
echo "Installing the LTS cli as global"
brun npm i -g /usr/src/app/ ## Set the link so the the nodejs module can be used as a cli directly

## Creating image
buildah commit --rm $node_container "$image:$tag"
echo "Created image: $image:$tag"
