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
const route53HostedZoneConfig = require("../values/route53HostedZoneConfig.json");

class InfraStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    Object.keys(route53HostedZoneConfig).forEach((hostedZoneName)=>{
      const hostedZoneConfig = route53HostedZoneConfig[hostedZoneName];
      const hostedZone = new route53.PublicHostedZone(this, `HostedZone${hostedZoneName}`, {
        zoneName: hostedZoneName,
      });

      Object.keys(hostedZoneConfig).forEach((recordName)=>{
        const recordValues = hostedZoneConfig[recordName];
        new route53.NsRecord(this, `NSRecord-${hostedZoneName}${recordName}`, {
          zone: hostedZone,
          recordName: `${recordName}`,
          values: recordValues
        });
      })
    })

  }
}

module.exports = { InfraStack }
