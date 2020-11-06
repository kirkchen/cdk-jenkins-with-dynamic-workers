import { App } from '@aws-cdk/core';
import { ImageBuilderStack } from './stacks/imageBuilderStack';

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new ImageBuilderStack(app, 'image-builder-stack-dev', { env: devEnv });
// new ImageBuilderStack(app, 'my-stack-prod', { env: prodEnv });

app.synth();