const eventInputParsed = require('./parseEventInput');
const getServiceNames = require('./utils/getServiceName');
const clientBucketFolders = require('../../services/s3/clientBucket/folders.json');
const getDashboardsBucketFolders = require('../../services/s3/dashboardsBucket/folders');
const clientDatabaseSchema = require('../../services/glue/client-database-schema.json');
const glueTableColumnTypeMappings = require('./utils/glueTableColumnTypeMappings.json');

const { AwsCustomResource, AwsCustomResourcePolicy } = require('@aws-cdk/custom-resources');
const { Stack, Duration, RemovalPolicy } = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const s3deploy = require('aws-cdk-lib/aws-s3-deployment');
const iam = require('aws-cdk-lib/aws-iam');
const lambda = require('aws-cdk-lib/aws-lambda');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const cloudfrontOrigins = require('aws-cdk-lib/aws-cloudfront-origins');
const acm = require("aws-cdk-lib/aws-certificatemanager");
const route53 = require("aws-cdk-lib/aws-route53");
const route53Targets = require("aws-cdk-lib/aws-route53-targets");
const ssm = require('aws-cdk-lib/aws-ssm');
const lakeformation = require('aws-cdk-lib/aws-lakeformation');
const glue = require('aws-cdk-lib/aws-glue')
const glueAlpha = require('@aws-cdk/aws-glue-alpha');
const athena = require('aws-cdk-lib/aws-athena');
const cognito = require('aws-cdk-lib/aws-cognito');
const apigateway = require('aws-cdk-lib/aws-apigateway');

const fs = require("fs");
const crypto = require('crypto');

const path = require("path");

class InfraStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const parsedInput = eventInputParsed()

    // INPUT
    const clientId = parsedInput.id;
    const certificateArn = "arn:aws:acm:us-east-1:932399466203:certificate/f085089d-f5ab-4286-8feb-08cac18e208e";
    const domain = "trial.dev.testvisd.online";
    const cognitoDomain = "client1visd";
    const host = "client5"
    const hostedZoneId = "Z05023842CSJVZ3JVYYYJ";
    ///
    // Constants
    const lambdaEdgeCloudfrontOriginRequestName = "dd-cf-lambda-edge";
    const CLIENT_ONBOARDING_STATE_SSM_PARAMETER_NAME = 'currentHosts'
    //
    let currentHosts = [];
    try {
      currentHosts = ssm.StringParameter.valueFromLookup(this, CLIENT_ONBOARDING_STATE_SSM_PARAMETER_NAME);
      currentHosts = currentHosts.split(",").filter(v => v.trim()).map(v => v.trim())
    }catch (e){
      currentHosts = [];
    }

    // Get the zone
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, `domain${host}`, {
      zoneName: domain,
      hostedZoneId: hostedZoneId,
    });

    const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(cf));

    // [...currentHosts].forEach((recordName) => {
    //   new route53.CfnRecordSet(this, `CDNARecord${recordName}delete`, {
    //     hostedZoneId: zone.hostedZoneId,
    //     name: `${host}.${domain}`,
    //     type: 'A',
    //     aliasTarget: {
    //       dnsName: 'd7e9gt0qkq093.cloudfront.net',
    //       hostedZoneId: hostedZoneId
    //     },
    //   }).addDeletionOverride('DeletionOverride');
    // });
    //
    // [...currentHosts, host].forEach((recordName) => {
    //   new route53.ARecord(this, `CDNARecord${recordName}`, {
    //     zone,
    //     target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(cf)),
    //     recordName
    //   });
    // });




    // Create API Gateway
    const apiGatewayLambdaAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'booksAuthorizer', {
      cognitoUserPools: [userPool]
    });
    const api = new apigateway.RestApi(this, 'api', {
      description: 'Created by CDK',
      deployOptions: {
        stageName: props.envName,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    });

    const todos = api.root.addResource('todos');

    todos.addMethod(
      'GET',
      new apigateway.LambdaIntegration(edgeLambdas[lambdaEdgeCloudfrontOriginRequestName].lambda, {
        proxy: false,
        requestTemplates: { "application/json": JSON.stringify({
            "scope" : "$context.authorizer.claims.scope",
            "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
            "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
            "customer": "$input.params('customer')",
            "category": "$input.params('category')",
            "valueORvolume": "$input.params('valueORvolume')",
            "lag": "$input.params('lag')"
          })
        },
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES
      }),
      {
        authorizer: apiGatewayLambdaAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizationScopes: [`tenant/${clientId}`]
      }
    );


    // Create lambda layer
    const calcLayer = new lambda.LayerVersion(this, 'calc-layer', {
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_18_X
      ],
      code: lambda.Code.fromAsset(path.join(__dirname, '../../services/lambdaLayer/nodeEssentials/layer.zip')),
      description: 'multiplies a number by 2',
    });

    const demoLambda = new lambda.Function(this, 'lambdaFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('export const handler = async(event) => "Hello, CDK";'),
      layers: [calcLayer]
    })
  }
}

module.exports = { InfraStack }
