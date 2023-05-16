const { Stack, Duration} = require("aws-cdk-lib");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfrontOrigins = require("aws-cdk-lib/aws-cloudfront-origins");
const path = require("path");
const fs = require("fs");
const constants = require("./constants");
const iam = require("aws-cdk-lib/aws-iam");
const crypto = require("crypto");

class CloudfrontInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};

    const {s3InfraStack, iamInfraStack} = props;

    const lambdaEdgeCloudfrontOriginRequestName = "dd-cf-lambda-edge";
    const {allEntities, certificateArn, domain} = props;


    const pathToLambdaEdgeCodeFolders = path.join(__dirname, "../../services/lambda@Edge");
    const lambdaEdgeFolders = fs.readdirSync(pathToLambdaEdgeCodeFolders).filter(item => !/(^|\/)\.[^/.]/g.test(item));

    const lambdaEdgeArnByName = {};
    lambdaEdgeFolders.forEach(lambdaEdgeFolder =>{
      const lambdaConfigurationFilePath = path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "configuration.json");
      let config = fs.readFileSync(lambdaConfigurationFilePath, "utf-8");
      config = config.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `${props.env.account}`);
      const configP = JSON.parse(config);

      const lambdaCodeFilePath = path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "code/index.mjs");
      let lambdacode = fs.readFileSync(lambdaCodeFilePath, "utf-8");
      lambdacode = lambdacode.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `${props.env.account}`);
      fs.writeFileSync(path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "code/index.mjs"), lambdacode);
      const iamRoleName = iamInfraStack[`iamRoleRef_bs${configP.configuration.iamRole}`] //Fn.importValue(`iamRoleRef${configP.configuration.iamRole}`);

      const lambdaEdgeFunction = new lambda.Function(this, `${lambdaEdgeFolder}`, {
        runtime: lambda.Runtime[configP.runtime],
        architecture: lambda.Architecture[configP.architecture],
        timeout: Duration.seconds(configP.configuration.timeout),
        role: iam.Role.fromRoleName(this, `lambdaEdgeRole${lambdaEdgeFolder}`, iamRoleName),
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(pathToLambdaEdgeCodeFolders, lambdaEdgeFolder, "code")),
      });

      const versionHash = crypto.createHash('md5').update(`${config}${lambdacode}`).digest('hex');
      const lambdaVersion = new lambda.Version(this, `${lambdaEdgeFolder}-${versionHash}`, {
        lambda: lambdaEdgeFunction
      });

      lambdaEdgeArnByName[`lambdaEdgeVersionArnRef${lambdaEdgeFolder}`] = lambdaVersion.functionArn

      // Export Lambda@Edge Version ARN
      // this.exportValue(lambdaVersion.functionArn);
      // this.stackExports[`lambdaEdgeVersionArnRef${lambdaEdgeFolder}`] = lambdaVersion.functionArn;
      // new CfnOutput(this, `lambdaEdgeVersionRef${lambdaEdgeFolder}`, {
      //   value: lambdaVersion.edgeArn,
      //   exportName: `lambdaEdgeVersionArnRef${lambdaEdgeFolder}`
      // })
    })



    const lambdaEdgeVersionArn = lambdaEdgeArnByName[`lambdaEdgeVersionArnRef${lambdaEdgeCloudfrontOriginRequestName}`]; //Fn.importValue(`lambdaEdgeVersionArnRef${lambdaEdgeCloudfrontOriginRequestName}`);
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
