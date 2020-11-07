import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { JenkinsStack } from '../src/stacks/jenkinsStack';

test('Snapshot', () => {
  const app = new App();
  const stack = new JenkinsStack(app, 'test');

  expect(
    app.synth().getStackArtifact(stack.artifactId).template,
  ).toMatchSnapshot();
});
