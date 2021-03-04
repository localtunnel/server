# Welcome to your CDK TypeScript project!

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

## configuration, please set them as env var
 * `LOCALTUNNEL_BASE_DOMAIN`    the base domain for the localtunnel server, must be a root domain like example.com
 * `LOCALTUNNEL_ROUTE53_ID`     the ID of the route53 hosted zone for the domain
