const {Stack, Fn, CfnOutput} = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require('aws-cdk-lib/aws-lambda');
const apiGatewayResourcesConfig = require("../../services/APIGateway/resourceConfig.json");

class ApiGatewayInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const {allEntities = [], envName, domain} = props;
    // Create Rest API
    const api = new apigateway.RestApi(this, 'krny-spi-apiGateway', {
      restApiName: `krny-apigateway-${envName}`,
      description: 'Created by CDK',
      deployOptions: {
        stageName: envName,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    });

    new CfnOutput(this, `apiGatewayRootUrl`, {
      value: api.url,
      description: `The deployed root URL of this REST API.`,
      exportName: `apiGatewayRootUrl`,
    });
    new CfnOutput(this, `apiGatewayBaseDeploymentStage`, {
      value: api.deploymentStage.stageName,
      description: `API Gateway stage that points to the latest deployment.`,
      exportName: `apiGatewayBaseDeploymentStage`,
    });




    allEntities.forEach(entity =>{
      const clientId = entity.id;

      // Add Root Resource
      const rootResource = api.root.addResource(`${envName}${clientId}`);

      const cognitoUserPoolId = Fn.importValue(`userpool${clientId}ResourceIdsUserPoolId`);
      const userPool = cognito.UserPool.fromUserPoolId(this, `apiGateway${clientId}CogAuthorizerRef`, cognitoUserPoolId);

      const apiGatewayLambdaAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, `apiGateway${clientId}CogAuthorizer`, {
        cognitoUserPools: [userPool]
      });

      // Add Resources
      Object.keys(apiGatewayResourcesConfig).forEach(resourceName => {
        const resourceConfig = apiGatewayResourcesConfig[resourceName];
        const resource = rootResource.addResource(resourceName);

        Object.keys(resourceConfig).forEach(methodName => {
          const methodConfig = resourceConfig[methodName];
          const integerationConfig = methodConfig.integrationRequest;

          const lambdaArn = Fn.importValue(`lambdaARN${integerationConfig.lambda}`);
          const backendLamdba = lambda.Function.fromFunctionArn(this, `backendLamdba${clientId}${resourceName}${methodName}`, lambdaArn);
          resource.addMethod(
            methodName,
            new apigateway.LambdaIntegration(backendLamdba, {
              proxy: integerationConfig.proxy ?? false,
              requestTemplates: {
                "application/json": JSON.stringify(integerationConfig.mappingTemplate)
              },
              passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES
            }),
            {
              authorizer: apiGatewayLambdaAuthorizer,
              authorizationType: apigateway.AuthorizationType.COGNITO,
              authorizationScopes: [`tenant/${clientId}`]
            }
          )
        })

        new CfnOutput(this, `apiGateway${clientId}${resourceName}ResourcePath`, {
          value: resource.path,
          description: `API Gateway stage that points to the latest deployment.`,
          exportName: `apiGateway${clientId}${resourceName}ResourcePath`,
        });
        new CfnOutput(this, `apiGateway${clientId}${resourceName}resourceId`, {
          value: resource.resourceId,
          description: `The ID of the resource.`,
          exportName: `apiGateway${clientId}${resourceName}resourceId`,
        });

      })
    })
  }
}

module.exports = {ApiGatewayInfraStack}
