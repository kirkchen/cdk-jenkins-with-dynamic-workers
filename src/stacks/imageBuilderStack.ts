import { readFileSync } from 'fs';
import { join } from 'path';
import { MachineImage, WindowsVersion } from '@aws-cdk/aws-ec2';
import {
  CfnInstanceProfile,
  ManagedPolicy,
  Role,
  ServicePrincipal,
} from '@aws-cdk/aws-iam';
import {
  CfnComponent,
  CfnImagePipeline,
  CfnImageRecipe,
  CfnInfrastructureConfiguration,
} from '@aws-cdk/aws-imagebuilder';
import { Construct, Stack, StackProps } from '@aws-cdk/core';

export class ImageBuilderStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const setupWinRMComponent = new CfnComponent(this, 'Setup WinRM', {
      name: 'Setup WinRM',
      platform: 'Windows',
      version: '1.0.0',
      data: readFileSync(
        join(__dirname, '../imageBuilderComponents/setupWinRM.yaml'),
      ).toString(),
    });

    const enableSmb1 = new CfnComponent(this, 'Enable smb1', {
      name: 'Enable smb1',
      platform: 'Windows',
      version: '1.0.0',
      data: readFileSync(
        join(__dirname, '../imageBuilderComponents/enableSmb1.yaml'),
      ).toString(),
    });

    const installBuildTools = new CfnComponent(this, 'Install Build Tools', {
      name: 'Install Build Tools',
      platform: 'Windows',
      version: '1.0.3',
      data: readFileSync(
        join(__dirname, '../imageBuilderComponents/installBuildTools.yaml'),
      ).toString(),
    });

    const jenkinsWindowsWorkerRecipe = new CfnImageRecipe(
      this,
      `${this.stackName}JenkinsWindowsWorkerRecipe`,
      {
        name: 'JenkinsWindowsWorkerRecipe',
        version: '1.0.3',
        components: [
          {
            componentArn: setupWinRMComponent.attrArn,
          },
          {
            componentArn: enableSmb1.attrArn,
          },
          {
            componentArn: installBuildTools.attrArn,
          },
        ],
        parentImage: MachineImage.latestWindows(
          WindowsVersion.WINDOWS_SERVER_2016_ENGLISH_FULL_BASE,
        ).getImage(this).imageId,
      },
    );

    const windowsBuilderRole = new Role(this, `${this.stackName}WindowsBuilderRole`, {
      roleName: 'WindowsBuilderRole',
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
    });
    windowsBuilderRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );
    windowsBuilderRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'EC2InstanceProfileForImageBuilder',
      ),
    );

    const windowsBuilderInstanceProfile = new CfnInstanceProfile(
      this,
      `${this.stackName}WindowsBuilderInstanceProfile`,
      {
        instanceProfileName: 'WindowsBuilderInstanceProfile',
        roles: [windowsBuilderRole.roleName],
      },
    );

    const windowsImageBuilderInfraConfig = new CfnInfrastructureConfiguration(
      this,
      `${this.stackName}WindowsImageBuilderConfig`,
      {
        name: 'WindowsImageBuilderConfig',
        instanceTypes: ['t3.large'],
        instanceProfileName: windowsBuilderInstanceProfile.instanceProfileName!,
      },
    );

    new CfnImagePipeline(this, `${this.stackName}JenkinsWindowsWorkerPipeline`, {
      name: 'JenkinsWindowsWorkerPipeline',
      imageRecipeArn: jenkinsWindowsWorkerRecipe.attrArn,
      infrastructureConfigurationArn: windowsImageBuilderInfraConfig.attrArn,
    });
  }
}
