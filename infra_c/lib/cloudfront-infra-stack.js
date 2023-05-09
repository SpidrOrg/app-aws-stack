const {Stack, Fn, CfnOutput} = require("aws-cdk-lib");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfrontOrigins = require("aws-cdk-lib/aws-cloudfront-origins");
const cr = require("aws-cdk-lib/custom-resources");
const iam = require('aws-cdk-lib/aws-iam');

class CloudfrontInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const lambdaEdgeCloudfrontOriginRequestName = "dd-cf-lambda-edge";
    const {allEntities, certificateArn, domain} = props;

    const lambdaEdgeVersionArn = Fn.importValue(`lambdaEdgeVersionArnRef${lambdaEdgeCloudfrontOriginRequestName}`);
    const dashboardsBucketARN = Fn.importValue('dashboardsBucketARN');
    const dashboardsBucket = s3.Bucket.fromBucketArn(this, 'cfS3DashboardsBucket', dashboardsBucketARN)

    const lambdaVersion = lambda.Version.fromVersionArn(this, "cloudfrontOriginRequestEdgeLambda", lambdaEdgeVersionArn)

    const certificate = acm.Certificate.fromCertificateArn(this, "webappTlsCert", certificateArn);

    const lambdaFunctionAssociation = {
      eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
      functionVersion: lambdaVersion,
      includeBody: false,
    };

    const oia = new cloudfront.OriginAccessIdentity(this, 'cloudfrontS3DashboardsOIA', {
      comment: "Created by CDK"
    });
    dashboardsBucket.grantRead(oia);

    const originRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'webappCdnDistributionOriginRequestPolicy', {
      originRequestPolicyName: 'webappCdnDistributionOriginRequestPolicy',
      comment: 'Dashboards Buckets Access - Created by CDK',
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList("Host"),
    })

    const cachePolicy = new cloudfront.CachePolicy(this, 'webappCdnDistributionCachePolicy', {
      cachePolicyName: 'webappCdnDistributionCachePolicy',
      comment: 'Dashboards Buckets Access - Created by CDK',
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Host"),
    })


    const cf = new cloudfront.Distribution(this, `webappCdnDistribution`, {
      comment: `SNP Dashboards - Managed by CDK`,
      defaultRootObject: "index.html",
      httpVersion: cloudfront.HttpVersion.HTTP2,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2016,
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(dashboardsBucket, {
          originAccessIdentity: oia,
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: originRequestPolicy,
        cachePolicy: cachePolicy,
        edgeLambdas: [lambdaFunctionAssociation]
      },
      domainNames: [domain, ...allEntities.map(v => `${v.host}.${domain}`)],
      certificate
    });

    new CfnOutput(this, `snpWebAppCloudfrontDistributionID`, {
      value: cf.distributionId,
      description: `WebApp Cloudfront Distribution ID`,
      exportName: `snpWebAppCloudfrontDistributionID`,
    });

    new CfnOutput(this, `snpWebAppCloudfrontDistributionDomainName`, {
      value: cf.distributionDomainName,
      description: `WebApp Cloudfront Distribution Domain Name`,
      exportName: `snpWebAppCloudfrontDistributionDomainName`,
    });
  }
}

module.exports = {CloudfrontInfraStack}
