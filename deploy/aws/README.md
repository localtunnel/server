# This is the deployment Infrastructure as code for use with AWS

## configuration, please set them as env var
 * `LOCALTUNNEL_BASE_DOMAIN`    the base domain for the localtunnel server, must be a root domain like example.com
 * `LOCALTUNNEL_ROUTE53_ID`     the ID of the route53 hosted zone for the domain

## After setting the environment variables, simply run:
 ```npm i && cdk deploy```

## Deployed Architecture
1. This Architecture brings up a ECS fargate cluster, 2 public subnets, 2 private subnets, and 2 NAT gateways

2. It spins up a container that runs using fargate runtype with the upstream docker image

3. the container image is placed in one of the two private subnets