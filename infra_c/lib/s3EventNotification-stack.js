const {Stack, Fn} = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const s3n = require("aws-cdk-lib/aws-s3-notifications");
const lambda = require("aws-cdk-lib/aws-lambda");
const clientBucketNotificationConfig = require("../../services/EventNotification/s3/clientBucket/config.json");

class S3EventNotificationStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {allEntities = []} = props;
    allEntities.forEach(entity => {
      const clientId = entity.id;

      // Get Client Bucket
      const clientBucketARN = Fn.importValue(`clientBucketRef${clientId}`);
      const clientBucket = s3.Bucket.fromBucketArn(this, `eventNotificationClinetS3Bucket${clientId}`, clientBucketARN);
      Object.keys(clientBucketNotificationConfig).forEach(notificationName => {
        const notificationConfig = clientBucketNotificationConfig[notificationName];

        const clientDataTransformationLambdaName = notificationConfig.notify.lambda;
        const clientDataTransformationLambdaARN = Fn.importValue(`lambdaARN${clientDataTransformationLambdaName}`);
        const clientDataTransformationLambda = lambda.Function.fromFunctionArn(this, `client${clientId}S3BucketNotification${notificationName}lambda`, clientDataTransformationLambdaARN);

        new lambda.CfnPermission(this, `client${clientId}S3BucketNotification${notificationName}lambdaResourcePermission`, {
          action: "lambda:InvokeFunction",
          principal: "s3.amazonaws.com",
          functionName: clientDataTransformationLambdaName,
          sourceArn: clientBucketARN
        })

        clientBucket.addEventNotification(
          s3.EventType[notificationConfig.eventType],
          new s3n.LambdaDestination(clientDataTransformationLambda),
          notificationConfig.filters
        )
      })
    })
  }
}

module.exports = {S3EventNotificationStack}
