const {Stack, Fn} = require("aws-cdk-lib");
const athena = require("aws-cdk-lib/aws-athena");
const s3 = require("aws-cdk-lib/aws-s3");

class AthenaInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {allEntities = [], envName} = props;

    allEntities.forEach(entity =>{
      const clientId = entity.id;

      const clientBucketARN = Fn.importValue(`clientBucketRef${clientId}`);
      const clientBucket = s3.Bucket.fromBucketArn(this, `clientBucketRefForGlue${clientId}`, clientBucketARN);

      // Create Athena Workgroup
      const cfnWorkGroup = new athena.CfnWorkGroup(this, `athenaWorkgroup${clientId}`, {
        name: `${clientId}-athena-workgroup-${envName}`,
        description: 'Create by CDK',
        workGroupConfiguration: {
          resultConfiguration: {
            outputLocation: `s3://${clientBucket.bucketName}/athena_results/`,
          },
        },
      });
    })
  }
}

module.exports = {AthenaInfraStack}
