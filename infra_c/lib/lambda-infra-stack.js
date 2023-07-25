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
    const {env, iamInfraStack} = props;

    // Create lambda layers
    const pathToLambdaLayersFolder = path.join(__dirname, "../../services/lambdaLayer");
    const lambdaLayersFolders = fs.readdirSync(pathToLambdaLayersFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
    const lambdaLayerVersionArnByName = {};
    lambdaLayersFolders.forEach(lambdaLayerFolder => {
      const configFile = fs.readFileSync(path.join(pathToLambdaLayersFolder, lambdaLayerFolder, 'configuration.json'), 'utf-8');
      const config = JSON.parse(configFile);

      // Create lambda layer
      const lambdaLayer = new lambda.LayerVersion(this, `${config.name}`, {
        layerVersionName: `${config.name}`,
        description: `${config.description}`,
        compatibleRuntimes: config.compatibleRuntimes.map(runtimeName => {
          return lambda.Runtime[runtimeName]
        }),
        code: lambda.Code.fromAsset(path.join(pathToLambdaLayersFolder, lambdaLayerFolder, 'layer.zip')),
      });

      lambdaLayerVersionArnByName[`lambdaLayerARN${config.name}`] = lambdaLayer.layerVersionArn;
      // Export Layer Version ARN
      // this.exportValue(lambdaLayer.layerVersionArn);
      // this.stackExports[`lambdaLayerARN${config.name}`] = lambdaLayer.layerVersionArn;
      // new CfnOutput(this, `lambdaLayer${config.name}ARNRef`, {
      //   value: lambdaLayer.layerVersionArn,
      //   description: `lambdaLayer ARN Reference : ${config.name}`,
      //   exportName: `lambdaLayerARN${config.name}`,
      // });
    });
    ////

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
        memorySize: config.configuration.memory || 128,
        layers: config.layers.map(layerConfig =>{
          const lambdaLayerARN = lambdaLayerVersionArnByName[`lambdaLayerARN${layerConfig.name}`] //Fn.importValue(`lambdaLayerARN${layerConfig.name}`);
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
