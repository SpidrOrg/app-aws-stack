const {Stack, Duration } = require("aws-cdk-lib");
const lambda = require('aws-cdk-lib/aws-lambda');
const iam = require('aws-cdk-lib/aws-iam');
const path = require("path");
const fs = require("fs");
const constants = require("./constants");

class LambdaInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};
    const {env, iamInfraStack, lambdaLayerInfraStack} = props;

    // Read all folders in services/lambda/code directory
    const pathToLambdaFolder = path.join(__dirname, "../../services/lambda");
    const lambdaFolders = fs.readdirSync(pathToLambdaFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
    lambdaFolders.forEach(lambdaFolder => {
      let configFile = fs.readFileSync(path.join(pathToLambdaFolder, lambdaFolder, 'configuration.json'), 'utf-8');
      configFile = configFile.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, env.account)
      const config = JSON.parse(configFile);

      // const lambdaRoleName = Fn.importValue(`iamRoleRef${config.configuration.iamRole}`);
      const lambdaRoleName = iamInfraStack[`iamRoleRef${config.configuration.iamRole}`];

      const fn = new lambda.Function(this, `${lambdaFolder}`, {
        functionName: `${lambdaFolder}`,
        runtime: lambda.Runtime.NODEJS_18_X,
        architecture: lambda.Architecture[config.architecture],
        handler: config.handler ?? 'index.handler',
        code: lambda.Code.fromAsset(path.join(pathToLambdaFolder, lambdaFolder, "code")),
        role: iam.Role.fromRoleName(this, `lambdaRole${lambdaFolder}`, lambdaRoleName),
        environment: config.environment,
        timeout: Duration.seconds(config.configuration.timeout),
        layers: config.layers.map(layerConfig =>{
          const lambdaLayerARN = lambdaLayerInfraStack[`lambdaLayerARN${layerConfig.name}`] //Fn.importValue(`lambdaLayerARN${layerConfig.name}`);
          return lambda.LayerVersion.fromLayerVersionArn(this, `lambdaFunctionLayer${lambdaFolder}`, lambdaLayerARN);
        })
      });

      // Export Lambda (latest) ARN
      this.exportValue(fn.functionArn);
      this.stackExports[`lambdaARN${lambdaFolder}`] = fn.functionArn;
      // new CfnOutput(this, `lambdaARNRef${lambdaFolder}`, {
      //   value: fn.functionArn,
      //   description: `lambda ARN Reference : ${lambdaFolder}`,
      //   exportName: `lambdaARN${lambdaFolder}`,
      // });
    })
  }
}

module.exports = {LambdaInfraStack}
