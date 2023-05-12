const { Stack } = require("aws-cdk-lib");
const route53 = require("aws-cdk-lib/aws-route53");
const route53Targets = require("aws-cdk-lib/aws-route53-targets");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");

class Route53InfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};

    const {allEntities = [], domain, cloudfrontInfraStack} = props;
    const zone = route53.HostedZone.fromLookup(this, `route53HostedZone`, {
      domainName: domain
    });

    const cfDistributionId = cloudfrontInfraStack['snpWebAppCloudfrontDistributionID'] //Fn.importValue('snpWebAppCloudfrontDistributionID');
    const cfDistributionDomainName = cloudfrontInfraStack['snpWebAppCloudfrontDistributionDomainName'] // Fn.importValue('snpWebAppCloudfrontDistributionDomainName');

    const cf = cloudfront.Distribution.fromDistributionAttributes(this, "snpWebAppCloudfrontDistribution", {
      distributionId: cfDistributionId,
      domainName: cfDistributionDomainName
    })
    allEntities.forEach(entity => {
      const clientId = entity.id;
      const host = entity.host;

      new route53.ARecord(this, `CDNARecord${clientId}`, {
        zone,
        target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(cf)),
        recordName: host
      });
    })
  }
}

module.exports = {Route53InfraStack}
