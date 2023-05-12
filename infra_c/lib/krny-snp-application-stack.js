const {Stack} = require("aws-cdk-lib");
const {S3InfraStack} = require("./s3-infra-strack");
const {IamInfraStack} = require("./iam-infra-stack");
const {LambdaEdgeInfraStack} = require("./lambdaEdge-infra-stack");
const {CloudfrontInfraStack} = require("./cloudfront-infra-stack");
const {GlueInfraStack} = require("./glue-infra-stack");
const {AthenaInfraStack} = require("./athena-infra-stack");
const {CognitoInfraStack} = require("./cognito-infra-stack");
const {LambdaLayerInfraStack} = require("./lambdaLayer-infra-stack");
const {LambdaInfraStack} = require("./lambda-infra-stack");
const {ApiGatewayInfraStack} = require("./apigateway-infra-stack");
const {Route53InfraStack} = require("./route53-infra-stack");
const accountConfig = require("../bin/accountConfig.json");

class krnySnpApplicationStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const awsAccountId = Stack.of(this).account;
    const awsRegion = Stack.of(this).region;
    const {envName, certificateArn, domain} = accountConfig[awsAccountId][awsRegion];

    const allEntities = props.clientsToOnboardConfigs || [];

    let stackProps = {...props, envName, certificateArn, domain, allEntities};

    // IAM Policies & Roles
    const iamInfraStack = new IamInfraStack(this, 'IamInfraStack', stackProps);
    stackProps = {...stackProps, iamInfraStack: iamInfraStack.stackExports}

    // Lambda Layers
    const lambdaLayerInfraStack = new LambdaLayerInfraStack(this, 'LambdaLayerInfraStack', stackProps);
    stackProps = {...stackProps, lambdaLayerInfraStack: lambdaLayerInfraStack.stackExports}

    // Lambda Functions
    const lambdaInfraStack = new LambdaInfraStack(this, 'LambdaInfraStack', stackProps);
    lambdaInfraStack.addDependency(iamInfraStack);
    lambdaInfraStack.addDependency(lambdaLayerInfraStack);
    stackProps = {...stackProps, lambdaInfraStack: lambdaInfraStack.stackExports}

    // S3 Buckets and S3 Client Bucket Event Notification
    const s3InfraStack = new S3InfraStack(this, 'S3InfraStack', stackProps);
    s3InfraStack.addDependency(lambdaInfraStack);
    stackProps = {...stackProps, s3InfraStack: s3InfraStack.stackExports}

    // // Lambda@Edge function for cloudfront
    const lambdaEdgeInfraStack = new LambdaEdgeInfraStack(this, 'LambdaEdgeInfraStack', stackProps);
    lambdaEdgeInfraStack.addDependency(iamInfraStack);
    stackProps = {...stackProps, lambdaEdgeInfraStack: lambdaEdgeInfraStack.stackExports};

    // CloudFront Distribution
    const cloudfrontInfraStack = new CloudfrontInfraStack(this, 'CloudfrontInfraStack', stackProps);
    cloudfrontInfraStack.addDependency(lambdaEdgeInfraStack);
    cloudfrontInfraStack.addDependency(s3InfraStack);
    stackProps = {...stackProps, cloudfrontInfraStack: cloudfrontInfraStack.stackExports};
    //

    // Route53
    const route53InfraStack = new Route53InfraStack(this, 'Route53InfraStack', stackProps);
    route53InfraStack.addDependency(cloudfrontInfraStack);
    stackProps = {...stackProps, route53InfraStack: route53InfraStack.stackExports};

    // Glue Database and Tables
    const glueInfraStack = new GlueInfraStack(this, 'GlueInfraStack', stackProps);
    glueInfraStack.addDependency(s3InfraStack);
    stackProps = {...stackProps, glueInfraStack: glueInfraStack.stackExports}

    // Athena Workgroup
    const athenaInfraStack = new AthenaInfraStack(this, 'AthenaInfraStack', stackProps);
    athenaInfraStack.addDependency(s3InfraStack);
    stackProps = {...stackProps, athenaInfraStack: athenaInfraStack.stackExports};

    // // Cognito UserPool
    const cognitoInfraStack = new CognitoInfraStack(this, 'CognitoInfraStack', stackProps);
    cognitoInfraStack.addDependency(cloudfrontInfraStack);
    stackProps = {...stackProps, cognitoInfraStack: cognitoInfraStack.stackExports};

    // API Gateway
    const apiGatewayInfraStack = new ApiGatewayInfraStack(this, 'ApiGatewayInfraStack', stackProps);
    apiGatewayInfraStack.addDependency(lambdaInfraStack);
    apiGatewayInfraStack.addDependency(cognitoInfraStack);

    // // Configure Upload Default Dashboard Bundler
    // const uiBundleStack = new UiBundleStack(this, 'UiBundleStack', stackProps);
    // uiBundleStack.addDependency(lambdaInfraStack);
    // uiBundleStack.addDependency(s3InfraStack);
    // uiBundleStack.addDependency(cognitoInfraStack);
    // uiBundleStack.addDependency(apiGatewayInfraStack);
    // uiBundleStack.addDependency(cloudfrontInfraStack);
  }
}

module.exports = krnySnpApplicationStack

