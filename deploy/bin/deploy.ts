#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DeployStack } from '../lib/deploy-stack';

let app = new cdk.App();
// replace them with HostedZoneID in route53, the domain name for the localtunnel, and the hosted zone domain
new DeployStack(app, 'DeployStack', process.env.LOCALTUNNEL_ROUTE53_ID as string , process.env.LOCALTUNNEL_BASE_DOMAIN as string);
