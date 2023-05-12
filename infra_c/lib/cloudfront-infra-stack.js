const { Stack } = require("aws-cdk-lib");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfrontOrigins = require("aws-cdk-lib/aws-cloudfront-origins");

class CloudfrontInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};

    const {lambdaEdgeInfraStack, s3InfraStack} = props;

    const lambdaEdgeCloudfrontOriginRequestName = "dd-cf-lambda-edge";
    const {allEntities, certificateArn, domain} = props;

    const lambdaEdgeVersionArn = lambdaEdgeInfraStack[`lambdaEdgeVersionArnRef${lambdaEdgeCloudfrontOriginRequestName}`]; //Fn.importValue(`lambdaEdgeVersionArnRef${lambdaEdgeCloudfrontOriginRequestName}`);
    const dashboardsBucketARN = s3InfraStack['dashboardsBucketARN']; //Fn.importValue('dashboardsBucketARN');
    const dashboardsBucket = s3.Bucket.fromBucketArn(this, 'cfS3DashboardsBucket', dashboardsBucketARN)

    const lambdaVersion = lambda.Version.fromVersionArn(this, "cloudfrontOriginRequestEdgeLambda", lambdaEdgeVersionArn)

    const certificate = acm.Certificate.fromCertificateArn(this, "webappTlsCert", certificateArn);

    const lambdaFunctionAssociation = {
      eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
      functionVersion: lambdaVersion,
      includeBody: false,
    };

    const oiaId = s3InfraStack['dashboardsBucketRefOia'] //Fn.importValue('dashboardsBucketRefOia');
    const oia = cloudfront.OriginAccessIdentity.fromOriginAccessIdentityId(this, 'cloudfrontS3DashboardsOIA', oiaId)

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

    this.exportValue(cf.distributionId);
    this.stackExports['snpWebAppCloudfrontDistributionID'] = cf.distributionId;
    // new CfnOutput(this, `snpWebAppCloudfrontDistributionID`, {
    //   value: cf.distributionId,
    //   description: `WebApp Cloudfront Distribution ID`,
    //   exportName: `snpWebAppCloudfrontDistributionID`,
    // });

    this.exportValue(cf.distributionDomainName);
    this.stackExports['snpWebAppCloudfrontDistributionDomainName'] = cf.distributionDomainName;
    // new CfnOutput(this, `snpWebAppCloudfrontDistributionDomainName`, {
    //   value: cf.distributionDomainName,
    //   description: `WebApp Cloudfront Distribution Domain Name`,
    //   exportName: `snpWebAppCloudfrontDistributionDomainName`,
    // });
  }
}

module.exports = {CloudfrontInfraStack}
