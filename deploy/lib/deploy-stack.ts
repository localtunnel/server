import * as cdk from '@aws-cdk/core';

// import dependencies for ECS and building a VPC
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";

export class DeployStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // create vpc with 3 subnets
    const vpc = new ec2.Vpc(this, "LocalTunnelVPC", {
      maxAzs: 3
    })
    // create the ecs cluster
    const cluster = new ecs.Cluster(this, "LocalTunnelCluster", {
      vpc: vpc
    })

    // create LBed Fargate service
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, "LocalTunnelService", {
      cluster: cluster,
      cpu: 512,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("defunctzombie/localtunnel-server:latest")
      },
      memoryLimitMiB: 2048,
      publicLoadBalancer : true,
      assignPublicIp: true
    })
  }
}
