const { Stack } = require("aws-cdk-lib");
const lambda = require('aws-cdk-lib/aws-lambda');
const iam = require('aws-cdk-lib/aws-iam');
const path = require("path");
const fs = require("fs");

class LambdaLayerInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};

    // Read all folders in services/lambdaLayer directory
    const pathToLambdaLayersFolder = path.join(__dirname, "../../services/lambdaLayer");
    const lambdaLayersFolders = fs.readdirSync(pathToLambdaLayersFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
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

      // Export Layer Version ARN
      this.exportValue(lambdaLayer.layerVersionArn);
      this.stackExports[`lambdaLayerARN${config.name}`] = lambdaLayer.layerVersionArn;
      // new CfnOutput(this, `lambdaLayer${config.name}ARNRef`, {
      //   value: lambdaLayer.layerVersionArn,
      //   description: `lambdaLayer ARN Reference : ${config.name}`,
      //   exportName: `lambdaLayerARN${config.name}`,
      // });
    })
  }
}

module.exports = {LambdaLayerInfraStack}
