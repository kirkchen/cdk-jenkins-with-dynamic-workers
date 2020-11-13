import { App } from '@aws-cdk/core';
import { ImageBuilderStack } from './stacks/imageBuilderStack';
import { JenkinsStack } from './stacks/jenkinsStack';

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const secrets = {
  githubTokenSecretArn: process.env.GITHUB_TOKEN_SECRETS_ARN,
  awsKeyPairSecretArn: process.env.AWS_KEYPAIR_SECRETS_ARN,
  jenkinsAdminPasswordSecretArn: process.env.JENKINS_ADMIN_PASSWORD_SECRETS_ARN,
  jenkinsWindowsWorkerPasswordSecretArn:
  process.env.JENKINS_WINDOWS_WORKER_PASSWORD_SECRETS_ARN,
};

const app = new App();

new ImageBuilderStack(app, 'image-builder-stack-dev', { env: devEnv });
// new ImageBuilderStack(app, 'my-stack-prod', { env: prodEnv });

new JenkinsStack(app, 'jenkins-stack-dev', {
  useDefaultVpc: true,
  usePublicSubnets: true,
  windowsWorkerAmi: 'ami-0209072377fde2f62',
  env: devEnv,
  githubTokenSecretArn: secrets.githubTokenSecretArn!,
  awsKeyPairSecretArn: secrets.awsKeyPairSecretArn!,
  jenkinsAdminPasswordSecretArn: secrets.jenkinsAdminPasswordSecretArn!,
  jenkinsWindowsWorkerPasswordSecretArn: secrets.jenkinsWindowsWorkerPasswordSecretArn!,
});

app.synth();
