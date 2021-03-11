# This is the deployment Infrastructure as code for use with AWS

## configuration, please set them as env var
 * `LOCALTUNNEL_BASE_DOMAIN`    the root domain in route53
 * `LOCALTUNNEL_ROUTE53_ID`     the ID of the route53 hosted zone for the domain
 * `LOCALTUNNEL_DOMAIN`         the domain of the localtunnel server
## After setting the environment variables, simply run:
 ```npm i && cdk deploy```

## Deployed Architecture
1. This Architecture brings up a ECS fargate cluster and 2 public subnets

2. It spins up a container that runs using fargate runtype with the upstream docker image

3. the container image is placed in one of the two private subnets