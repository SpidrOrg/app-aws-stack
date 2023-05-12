const { Stack, RemovalPolicy } = require('aws-cdk-lib');
const getServiceNames = require("./utils/getServiceName");
const s3 = require("aws-cdk-lib/aws-s3");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const path = require("path");
const clientBucketNotificationConfig = require("../../services/EventNotification/s3/clientBucket/config.json");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const s3n = require("aws-cdk-lib/aws-s3-notifications");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");

class S3InfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {}
    const {lambdaInfraStack, envName} = props;

    // Create Dashboards S3 Bucket if not exists
    const dashboardsBucketName = getServiceNames.getDashboardsBucketName(envName)
    const dashboardsBucket = new s3.Bucket(this, 'dashboards-bucket', {
      bucketName: dashboardsBucketName,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const oia = new cloudfront.OriginAccessIdentity(this, 'cloudfrontS3DashboardsOIA', {
      comment: "Created by CDK"
    });
    dashboardsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [
          dashboardsBucket.arnForObjects("*")
        ],
        actions: ["s3:GetObject"],
        principals: [oia.grantPrincipal]
      })
    );

    //// Export Dashboard bucket name
    this.exportValue(dashboardsBucket.bucketArn);
    this.stackExports['dashboardsBucketARN'] = dashboardsBucket.bucketArn;
    // new CfnOutput(this, 'dashboardsBucketRef', {
    //   value: dashboardsBucket.bucketArn,
    //   description: 'The ARN of the Dashboards s3 bucket',
    //   exportName: 'dashboardsBucketARN',
    // });
    this.exportValue(oia.originAccessIdentityId);
    this.stackExports['dashboardsBucketRefOia'] = oia.originAccessIdentityId;
    // new CfnOutput(this, 'dashboardsBucketRefOia', {
    //   value: oia.originAccessIdentityId,
    //   description: 'The ARN of the Dashboards s3 bucket',
    //   exportName: 'dashboardsBucketRefOia',
    // });

    const {allEntities = []} = props;
    allEntities.forEach(entity =>{
      const clientId = entity.id;

      const clientBucketName = getServiceNames.getClientBucketName(clientId, props.envName);

      // Create Client Bucket
      const clientBucket = new s3.Bucket(this, `client-bucket-${clientBucketName}`, {
        bucketName: clientBucketName,
        removalPolicy: RemovalPolicy.RETAIN
      });

      Object.keys(clientBucketNotificationConfig).forEach(notificationName => {
        const notificationConfig = clientBucketNotificationConfig[notificationName];

        const clientDataTransformationLambdaName = notificationConfig.notify.lambda;
        const clientDataTransformationLambdaARN = lambdaInfraStack[`lambdaARN${clientDataTransformationLambdaName}`] //Fn.importValue(`lambdaARN${clientDataTransformationLambdaName}`);
        const clientDataTransformationLambda = lambda.Function.fromFunctionArn(this, `client${clientId}S3BucketNotification${notificationName}lambda`, clientDataTransformationLambdaARN);

        const cfnPermission = new lambda.CfnPermission(this, `client${clientId}S3BucketNotification${notificationName}lambdaResourcePermission`, {
          action: "lambda:InvokeFunction",
          principal: "s3.amazonaws.com",
          functionName: clientDataTransformationLambdaName,
          sourceArn: clientBucket.bucketArn
        });

        clientBucket.addEventNotification(
          s3.EventType[notificationConfig.eventType],
          new s3n.LambdaDestination(clientDataTransformationLambda),
          notificationConfig.filters
        )
      })
      //// Export Client bucket name
      this.exportValue(clientBucket.bucketArn);
      this.stackExports[`clientBucketRef${clientId}`] = clientBucket.bucketArn;
      // new CfnOutput(this, `clientBucket${clientId}Ref`, {
      //   value: clientBucket.bucketArn,
      //   description: `The ARN of the Client s3 bucket`,
      //   exportName: `clientBucketRef${clientId}`,
      // });

      //// Create Client Bucket folders
      new s3deploy.BucketDeployment(this, `client-bucket-folders-${clientBucketName}`, {
        sources: [s3deploy.Source.asset(path.join(__dirname, '../../services/s3/clientBucket/folderStructure'))],
        destinationBucket: clientBucket,
      });

      //// Create Dashboards bucket folders
      new s3deploy.BucketDeployment(this, `create-dashboards-bucket-folders${clientId}`, {
        sources: [s3deploy.Source.asset(path.join(__dirname, '../../services/s3/_blank'))],
        destinationBucket: dashboardsBucket,
        destinationKeyPrefix: `dashboards/${clientId}/dashboard`,
      });
    })
  }
}

module.exports = {S3InfraStack}
