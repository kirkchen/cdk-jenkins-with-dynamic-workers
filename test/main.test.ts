import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { ImageBuilderStack } from '../src/stacks/imageBuilderStack';

test('Snapshot', () => {
  const app = new App();
  const stack = new ImageBuilderStack(app, 'test');

  expect(
    app.synth().getStackArtifact(stack.artifactId).template,
  ).toMatchSnapshot();
});
