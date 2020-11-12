import { SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import {
  Cluster,
  ContainerImage,
  LogDriver,
  Secret as EcsSecret,
} from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { DnsRecordType } from '@aws-cdk/aws-servicediscovery';
import { Construct, Stack, StackProps } from '@aws-cdk/core';

interface CreateClusterProps {
  vpc: Vpc;
  defaultNamespace: string;
}

interface CreateSecretsProps {
  githubTokenSecretArn: string;
  awsKeyPairSecretArn: string;
  jenkinsAdminPasswordSecretArn: string;
  jenkinsWindowsWorkerPasswordSecretArn: string;
}

interface JenkinsStackProps extends StackProps {
  useDefaultVpc: boolean;
  githubTokenSecretArn: string;
  awsKeyPairSecretArn: string;
  jenkinsAdminPasswordSecretArn: string;
  jenkinsWindowsWorkerPasswordSecretArn: string;
}

export class JenkinsStack extends Stack {
  constructor(scope: Construct, id: string, props: JenkinsStackProps) {
    super(scope, id, props);

    const vpc = props.useDefaultVpc ?
      Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true }) as Vpc :
      this.createVpc();

    const cluster = this.createCluster({
      vpc: vpc,
      defaultNamespace: 'jenkins',
    });

    const logGroup = new LogGroup(this, `${this.stackName}JenkinsLogGroup`, {
      retention: RetentionDays.ONE_DAY,
    });

    const executionRole = this.createExecutionRole();
    const jenkinsLeaderTaskRole = this.createJenkinsLeaderTaskRole();
    const jenkinsWorkerTaskRole = this.createJenkinsWorkerTaskRole();

    const vpcDefaultSecurityGroup = SecurityGroup.fromSecurityGroupId(
      this,
      `${this.stackName}DefaultSecurityGroup`,
      vpc.vpcDefaultSecurityGroup,
    );
    const subnets = this.getSubnetsFromVpc(vpc);

    const secrets = this.createSecrets(props);

    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      `${this.stackName}JenkinsService`,
      {
        cluster,
        cpu: 2048,
        memoryLimitMiB: 4096,
        desiredCount: 1,
        securityGroups: [vpcDefaultSecurityGroup],
        taskImageOptions: {
          image: ContainerImage.fromAsset('./docker/jenkinsLeader'),
          containerPort: 8080,
          executionRole,
          taskRole: jenkinsLeaderTaskRole,
          logDriver: LogDriver.awsLogs({
            logGroup,
            streamPrefix: 'jenkins-leader',
          }),
          environment: {
            GITHUB_USERNAME: 'kirkchen',
            GITHUB_REPO: 'jenkins-as-code-example',
            JENKINS_ADMIN_ACCOUNT: 'admin',
            JENKINS_WINDOWS_WORKER_AMI: 'ami-0209072377fde2f62',
            JENKINS_WINDOWS_WORKER_ACCOUNT: 'jenkins',
            JENKINS_WINDOWS_WORKER_SUBNETS: subnets.join(' '),
            JENKINS_LINUX_WORKER_ECS_CLUSTER_ARN: cluster.clusterArn,
            JENKINS_LINUX_WORKER_SECURITY_GROUPS:
            vpcDefaultSecurityGroup.securityGroupId,
            JENKINS_LINUX_WORKER_SUBNETS: subnets.join(','),
            JENKINS_LINUX_WORKER_TASK_ROLE: jenkinsWorkerTaskRole.roleArn,
            JENKINS_LINUX_WORKER_EXECUTION_ROLE: executionRole.roleArn,
            JENKINS_LINUX_WORKER_LOGS_GROUP: logGroup.logGroupName,
          },
          secrets,
        },
        publicLoadBalancer: true,
        cloudMapOptions: { name: 'leader', dnsRecordType: DnsRecordType.A },
      },
    );

    fargateService.targetGroup.configureHealthCheck({
      path: '/login',
    });

    fargateService.service.taskDefinition.defaultContainer?.addPortMappings({
      containerPort: 50000,
      hostPort: 50000,
    });
  }

  private createSecrets({
    githubTokenSecretArn,
    awsKeyPairSecretArn,
    jenkinsAdminPasswordSecretArn,
    jenkinsWindowsWorkerPasswordSecretArn,
  }: CreateSecretsProps) {
    if (
      !githubTokenSecretArn ||
      !awsKeyPairSecretArn ||
      !jenkinsAdminPasswordSecretArn ||
      !jenkinsWindowsWorkerPasswordSecretArn
    ) {
      return undefined;
    }

    const githubToken = Secret.fromSecretCompleteArn(
      this,
      `${this.stackName}GithubToken`,
      githubTokenSecretArn,
    );
    const awsKeyPair = Secret.fromSecretCompleteArn(
      this,
      `${this.stackName}AwsKeyPair`,
      awsKeyPairSecretArn,
    );
    const jenkinsAdminPassword = Secret.fromSecretCompleteArn(
      this,
      `${this.stackName}JenkinsAdminPassword`,
      jenkinsAdminPasswordSecretArn,
    );
    const jenkinsWindowsWorkerPassword = Secret.fromSecretCompleteArn(
      this,
      `${this.stackName}JenkinsWindowsWorkerPassword`,
      jenkinsWindowsWorkerPasswordSecretArn,
    );

    return {
      AWS_KEYPAIR: EcsSecret.fromSecretsManager(awsKeyPair),
      GITHUB_TOKEN: EcsSecret.fromSecretsManager(githubToken),
      JENKINS_ADMIN_PASSWORD: EcsSecret.fromSecretsManager(
        jenkinsAdminPassword,
      ),
      JENKINS_WINDOWS_WORKER_PASSWORD: EcsSecret.fromSecretsManager(
        jenkinsWindowsWorkerPassword,
      ),
    };
  }

  private createJenkinsWorkerTaskRole(): Role {
    return new Role(this, `${this.stackName}JenkinsWorkerTaskRole`, {
      roleName: `${this.stackName}JenkinsWorkerTaskRole`,
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
  }

  private createJenkinsLeaderTaskRole(): Role {
    const taskRole = new Role(this, `${this.stackName}JenkinsLeaderTaskRole`, {
      roleName: `${this.stackName}JenkinsLeaderTaskRole`,
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addManagedPolicy(
      new ManagedPolicy(this, `${this.stackName}CreateEC2WorkerPolicy`, {
        managedPolicyName: `${this.stackName}CreateEC2WorkerPolicy`,
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

    // TODO: Make policy stricter
    taskRole.addManagedPolicy(
      new ManagedPolicy(this, `${this.stackName}CreateECSWorkerPolicy`, {
        managedPolicyName: `${this.stackName}CreateECSWorkerPolicy`,
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

    return taskRole;
  }

  private createExecutionRole(): Role {
    const executionRole = new Role(this, `${this.stackName}ExecutionRole`, {
      roleName: `${this.stackName}ExecutionRole`,
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    executionRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AmazonECSTaskExecutionRolePolicy',
      ),
    );

    return executionRole;
  }

  private createCluster({ vpc, defaultNamespace }: CreateClusterProps) {
    return new Cluster(this, `${this.stackName}Cluster`, {
      vpc,
      defaultCloudMapNamespace: {
        name: defaultNamespace,
      },
    });
  }

  private createVpc() {
    return new Vpc(this, `${this.stackName}Vpc`, {});
  }

  private getSubnetsFromVpc(vpc: Vpc): string[] {
    const subnets = vpc.privateSubnets.length > 0 ? vpc.privateSubnets : vpc.publicSubnets;

    return subnets.map(i => i.subnetId);
  }
}
