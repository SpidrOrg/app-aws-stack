const { Stack } = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require('aws-cdk-lib/aws-lambda');
const apiGatewayResourcesConfig = require("../../services/APIGateway/resourceConfig.json");
const path = require("path");
const fs = require("fs");

class ApiGatewayInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};

    const { allEntities = [], envName, lambdaInfraStack, cognitoInfraStack } = props;

    if (allEntities.length <= 0){
      return;
    }
    // Create Rest API
    const api = new apigateway.RestApi(this, 'krny-spi-dashboard-apiGateway', {
      restApiName: `spi-dashboards-${envName}`,
      description: 'Created by CDK',
      deployOptions: {
        stageName: envName,
      }
    });

    // this.exportValue(api.url);
    // this.stackExports['gatewayRootUrl'] = api.url;
    // new CfnOutput(this, `gatewayRootUrl`, {
    //   value: api.url,
    //   description: `The deployed root URL of this REST API.`,
    //   exportName: `gatewayRootUrl`,
    // });

    this.exportValue(api.deploymentStage.stageName);
    this.stackExports['gatewayBaseDeploymentStage'] = api.deploymentStage.stageName;
    // new CfnOutput(this, `gatewayBaseDeploymentStage`, {
    //   value: api.deploymentStage.stageName,
    //   description: `API Gateway stage that points to the latest deployment.`,
    //   exportName: `gatewayBaseDeploymentStage`,
    // });

    const pathToLambdaFolder = path.join(__dirname, "../../services/lambda");
    const lambdaFolders = fs.readdirSync(pathToLambdaFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
    lambdaFolders.forEach(lambdaFolder => {
      const fnArn = lambdaInfraStack[`lambdaARN${lambdaFolder}`]; //Fn.importValue(`lambdaARN${lambdaFolder}`);
      new lambda.CfnPermission(this, `PermitAPIGInvocation${lambdaFolder}refarn`, {
        action: 'lambda:InvokeFunction',
        functionName: fnArn,
        principal: 'apigateway.amazonaws.com',
        sourceArn: api.arnForExecuteApi('*')
      });
    })

    allEntities.forEach(entity =>{
      const clientId = entity.id;

      // Add Root Resource
      const rootResource = api.root.addResource(`${envName}${clientId}`);

      const cognitoUserPoolId =  cognitoInfraStack[`userpool${clientId}ResourceIdsUserPoolId`]; //Fn.importValue(`userpool${clientId}ResourceIdsUserPoolId`);
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

          const lambdaArn = lambdaInfraStack[`lambdaARN${integerationConfig.lambda}`] //Fn.importValue(`lambdaARN${integerationConfig.lambda}`);
          const backendLamdba = lambda.Function.fromFunctionArn(this, `backendLamdba${clientId}${resourceName}${methodName}`, lambdaArn);
          const method = resource.addMethod(
            methodName,
            new apigateway.LambdaIntegration(backendLamdba, {
              proxy: integerationConfig.proxy ?? false,
              requestTemplates: {
                "application/json": JSON.stringify(integerationConfig.mappingTemplate)
              },
              passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
              integrationResponses: [{
                  statusCode: "200",
                  responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': "'*'",
                  }
              }],
            }),
            {
              authorizer: apiGatewayLambdaAuthorizer,
              authorizationType: apigateway.AuthorizationType.COGNITO,
              authorizationScopes: [`tenant/${clientId}`],
              methodResponses:[{
                statusCode: "200",
                responseParameters: {
                  'method.response.header.Access-Control-Allow-Origin': true,
                },
                responseModels: {
                  "application/json": apigateway.Model.EMPTY_MODEL
                }
              }]
            }
          );
        });

        resource.addMethod('OPTIONS', new apigateway.MockIntegration({
          integrationResponses: [{
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              'method.response.header.Access-Control-Allow-Origin': "'*'",
              'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,POST'",
            },
          }],
          passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
          requestTemplates: {
            "application/json": "{\"statusCode\": 200}"
          },
        }), {
          methodResponses: [{
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Origin': true,
              'method.response.header.Access-Control-Allow-Methods': true,
            },
            responseModels: {
              "application/json": apigateway.Model.EMPTY_MODEL
            }
          }]
        })
        // resource.addCorsPreflight({
        //   allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        //   allowMethods: ['OPTIONS', 'GET', 'POST'],
        //   allowOrigins: apigateway.Cors.ALL_ORIGINS,
        // });
      })
    });


    // const pathToDefaultDashboardBundle = path.join(__dirname, "../../services/DefaultUiBundle");
    // const POOLID_PALCEHOLDER = ":POOLID:";
    // const POOLWEBCLIENTID_PALCEHOLDER = ":POOLWEBCLIENTID:";
    // const POOLOAUTHDOMAIN_PALCEHOLDER = ":POOLOAUTHDOMAIN:";
    // const POOLREDIRECTSIGNIN_PALCEHOLDER = ":POOLREDIRECTSIGNIN:";
    // const POOLREDIRECTSIGNOUT_PALCEHOLDER = ":POOLREDIRECTSIGNOUT:";
    // const APIPREFIX_PALCEHOLDER = ":APIPREFIX:";
    // const APISTAGE_PALCEHOLDER = ":APISTAGE:";
    // const CLIENTID_PALCEHOLDER = ":CLIENTID:";
    // const CLIENTDISPLAYNAME_PALCEHOLDER = ":CLIENTDISPLAYNAME:";
    //
    // // Dashboards Bucket
    // const dashboardsBucketARN = Fn.importValue(`dashboardsBucketARN`);
    // const dashboardsBucket = s3.Bucket.fromBucketArn(this, `dashboardsBundleBucket`, dashboardsBucketARN);
    // allEntities.forEach(entity =>{
    //   const clientId = entity.id;
    //   const entityName = entity.name;
    //
    //   // Cognito Stack Imports
    //   const cognitoUserPoolId = Fn.importValue(`userpool${clientId}ResourceIdsUserPoolId`);
    //   const cognitoUserPoolWebClient = Fn.importValue(`userpool${clientId}ResourceIdsClientId`);
    //   const cognitoUserPoolDomain = Fn.importValue(`userpool${clientId}ResourceIdsDomain`);
    //   const cognitoUserPoolRedirectSignInPublicUrl = Fn.importValue(`userpool${clientId}redirectSignIn`);
    //   const cognitoUserPoolRedirectSignOutPublicUrl = Fn.importValue(`userpool${clientId}redirectSignOut`);
    //
    //   const idpConfigFilePath = path.join(pathToDefaultDashboardBundle, "idpConfig.js");
    //   let idpConfig = fs.readFileSync(idpConfigFilePath, "utf-8");
    //   idpConfig = idpConfig.replaceAll(POOLID_PALCEHOLDER, `${cognitoUserPoolId.toString()}`);
    //   idpConfig = idpConfig.replaceAll(POOLWEBCLIENTID_PALCEHOLDER, `${cognitoUserPoolWebClient.toString()}`);
    //   idpConfig = idpConfig.replaceAll(POOLOAUTHDOMAIN_PALCEHOLDER, `${cognitoUserPoolDomain}`);
    //   idpConfig = idpConfig.replaceAll(POOLREDIRECTSIGNIN_PALCEHOLDER, `${cognitoUserPoolRedirectSignInPublicUrl}`);
    //   idpConfig = idpConfig.replaceAll(POOLREDIRECTSIGNOUT_PALCEHOLDER, `${cognitoUserPoolRedirectSignOutPublicUrl}`);
    //
    //   idpConfig = idpConfig.replaceAll(APIPREFIX_PALCEHOLDER, `${api.url}`);
    //   idpConfig = idpConfig.replaceAll(APISTAGE_PALCEHOLDER, `${api.deploymentStage.stageName}`);
    //   idpConfig = idpConfig.replaceAll(CLIENTID_PALCEHOLDER, `${clientId}`);
    //   idpConfig = idpConfig.replaceAll(CLIENTDISPLAYNAME_PALCEHOLDER, `${entityName}`);
    //   fs.writeFileSync(path.join(pathToDefaultDashboardBundle, "idpConfig.js"), idpConfig);
    //
    //   const bucketDeployment = new s3deploy.BucketDeployment(this, `dashboard-bundler-${clientId}`, {
    //     sources: [s3deploy.Source.asset(pathToDefaultDashboardBundle)],
    //     destinationBucket: dashboardsBucket,
    //     destinationKeyPrefix: `dashboards/${clientId}/dashboard`
    //   });
    //
    //   bucketDeployment.node.addDependency(api);
    // })
  }
}

module.exports = {ApiGatewayInfraStack}
