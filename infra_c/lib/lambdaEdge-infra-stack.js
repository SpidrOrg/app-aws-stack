const {Stack, Duration, Fn, CfnOutput} = require("aws-cdk-lib");
const iam = require('aws-cdk-lib/aws-iam');
const path = require("path");
const fs = require("fs");
const lambda = require("aws-cdk-lib/aws-lambda");
const crypto = require("crypto");
const constants = require("./constants");

class LambdaEdgeInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const pathToLambdaEdgeCodeFolders = path.join(__dirname, "../../services/lambda@Edge");
    const lambdaEdgeFolders = fs.readdirSync(pathToLambdaEdgeCodeFolders);

    lambdaEdgeFolders.forEach(lambdaEdgeFolder =>{
      const lambdaConfigurationFilePath = path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "configuration.json");
      let config = fs.readFileSync(lambdaConfigurationFilePath, "utf-8");
      config = config.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `${props.env.account}`);
      const configP = JSON.parse(config);

      const lambdaCodeFilePath = path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "code/index.mjs");
      let lambdacode = fs.readFileSync(lambdaCodeFilePath, "utf-8");
      lambdacode = lambdacode.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `${props.env.account}`);
      fs.writeFileSync(path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "code/index.mjs"), lambdacode)
      const iamRoleName = Fn.importValue(`iamRoleRef${configP.configuration.iamRole}`);

      const lambdaEdgeFunction = new lambda.Function(this, `${lambdaEdgeFolder}`, {
        runtime: lambda.Runtime[configP.runtime],
        architecture: lambda.Architecture[configP.architecture],
        timeout: Duration.seconds(configP.configuration.timeout),
        role: iam.Role.fromRoleName(this, `lambdaEdgeRole${lambdaEdgeFolder}`, iamRoleName),
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "code")),
      });

      const versionHash = crypto.createHash('md5').update(`${config}${lambdacode}`).digest('hex');
      const lambdaVersion = new lambda.Version(this, `${lambdaEdgeFolder}-${versionHash}`, {
        lambda: lambdaEdgeFunction
      });

      // Export Lambda@Edge Version ARN
      new CfnOutput(this, `lambdaEdgeVersionRef${lambdaEdgeFolder}`, {
        value: lambdaVersion.edgeArn,
        exportName: `lambdaEdgeVersionArnRef${lambdaEdgeFolder}`
      })
    })
  }
}

module.exports = {LambdaEdgeInfraStack}
