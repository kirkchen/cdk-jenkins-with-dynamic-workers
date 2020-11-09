import { join } from 'path';
import { SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import { Cluster, ContainerImage, Secret as EcsSecret } from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { DnsRecordType } from '@aws-cdk/aws-servicediscovery';
import { Construct, Stack, StackProps } from '@aws-cdk/core';

export class JenkinsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'Jenkins Vpc', { maxAzs: 2 });

    const cluster = new Cluster(this, 'Jenkins Cluster', {
      vpc,
      defaultCloudMapNamespace: {
        name: 'jenkins',
      },
    });

    const taskRole = new Role(this, 'Jenkins Task Role', {
      roleName: 'JenkinsTaskRole',
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addManagedPolicy(
      new ManagedPolicy(this, 'Jenkins Dynamic Windows Slave Policy', {
        managedPolicyName: 'JenkinsDynamicWindowsSlavePolicy',
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              'ec2:DescribeSpotInstanceRequests',
              'ec2:CancelSpotInstanceRequests',
              'ec2:GetConsoleOutput',
              'ec2:RequestSpotInstances',
              'ec2:RunInstances',
              'ec2:StartInstances',
              'ec2:StopInstances',
              'ec2:TerminateInstances',
              'ec2:CreateTags',
              'ec2:DeleteTags',
              'ec2:DescribeInstances',
              'ec2:DescribeKeyPairs',
              'ec2:DescribeRegions',
              'ec2:DescribeImages',
              'ec2:DescribeAvailabilityZones',
              'ec2:DescribeSecurityGroups',
              'ec2:DescribeSubnets',
              'ec2:GetPasswordData',
              'iam:ListInstanceProfilesForRole',
              'iam:PassRole',
            ],
            resources: ['*'],
          }),
        ],
      }),
    );

    taskRole.addManagedPolicy(
      new ManagedPolicy(this, 'Jenkins Dynamic Linux Slave Policy', {
        managedPolicyName: 'JenkinsDynamicLinuxSlavePolicy',
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              'ecs:RegisterTaskDefinition',
              'ecs:ListClusters',
              'ecs:DescribeContainerInstances',
              'ecs:ListTaskDefinitions',
              'ecs:DescribeTaskDefinition',
              'ecs:DeregisterTaskDefinition',
              'ecs:ListContainerInstances',
              'ecs:RunTask',
              'ecs:StopTask',
              'ecs:DescribeTasks',
            ],
            resources: ['*'],
          }),
        ],
      }),
    );

    const image = ContainerImage.fromAsset(
      join(__dirname, '..', '..', 'docker/'),
    );
    const githubToken = Secret.fromSecretCompleteArn(
      this,
      'Github Token',
      'arn:aws:secretsmanager:ap-northeast-1:873556626032:secret:github/token-dNPuGK',
    );
    const awsKeyPair = Secret.fromSecretCompleteArn(
      this,
      'AWS Keypair',
      'arn:aws:secretsmanager:ap-northeast-1:873556626032:secret:aws/keypair-ZOUxvI',
    );
    const windowsPassword = Secret.fromSecretCompleteArn(
      this,
      'Windows Password',
      'arn:aws:secretsmanager:ap-northeast-1:873556626032:secret:aws/jenkins-windows-slave-password-Ftda4w',
    );

    const vpcDefaultSecurityGroup = SecurityGroup.fromSecurityGroupId(
      this,
      'Vpc Default Security Group',
      vpc.vpcDefaultSecurityGroup,
    );
    const subnets = vpc.privateSubnets.map((i) => i.subnetId);

    const alb = new ApplicationLoadBalancedFargateService(
      this,
      'Jenkins Service',
      {
        cluster,
        cpu: 2048,
        desiredCount: 1,
        securityGroups: [vpcDefaultSecurityGroup],
        taskImageOptions: {
          image,
          containerPort: 8080,
          taskRole,
          environment: {
            JENKINS_ADMIN_ID: 'admin',
            JENKINS_ADMIN_PASSWORD: 'password',
            GITHUB_USERNAME: 'kirkchen',
            GITHUB_REPO: 'kirkchen/jenkins-as-code-example',
            JENKINS_HOST: 'http://localhost:8080',
            AWS_JENKINS_WINDOWS_SLAVE_AMI: 'ami-0209072377fde2f62',
            AWS_JENKINS_WINDOWS_SLAVE_ACCOUNT: 'jenkins',
            AWS_JENKINS_WINDOWS_SLAVE_SUBNETS: subnets.join(' '),
            AWS_ECS_CLUSTER_ARN: cluster.clusterArn,
            AWS_JENKINS_LINUX_SLAVE_SECURITY_GROUPS:
              vpcDefaultSecurityGroup.securityGroupId,
            AWS_JENKINS_LINUX_SLAVE_SUBNETS: subnets.join(','),
            AWS_JENKINS_LINUX_SLAVE_TASK_ROLE: taskRole.roleArn,
          },
          secrets: {
            AWS_JENKINS_WINDOWS_SLAVE_PASSWORD: EcsSecret.fromSecretsManager(
              windowsPassword,
            ),
            GITHUB_TOKEN: EcsSecret.fromSecretsManager(githubToken),
            AWS_KEYPAIR: EcsSecret.fromSecretsManager(awsKeyPair),
          },
        },
        memoryLimitMiB: 4096,
        publicLoadBalancer: true,
        cloudMapOptions: { name: 'leader', dnsRecordType: DnsRecordType.A },
      },
    );

    alb.targetGroup.configureHealthCheck({
      path: '/login',
    });

    alb.service.taskDefinition.defaultContainer?.addPortMappings({
      containerPort: 50000,
      hostPort: 50000,
    });
  }
}
