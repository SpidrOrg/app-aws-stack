const { Stack, Duration } = require('aws-cdk-lib');
const path = require("path");
const fs = require("fs");
const getServiceNames = require("../../infra_c/lib/utils/getServiceName");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const s3 = require("aws-cdk-lib/aws-s3");
const accountConfig = require("../../infra_c/bin/accountConfig.json");
const stackExports = require("../../infra_c/stackexports.json");
const {getExportName} = require("../../infra_c/lib/utils/stackExportsName");

class InfraDashboardsStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const awsAccountId = Stack.of(this).account;
    const awsRegion = Stack.of(this).region;
    const {envName, domain} = accountConfig[awsAccountId][awsRegion];
    const { clientsToOnboardConfigs = [] } = props;

    const REGION_PALCEHOLDER = ":REGION:";
    const POOLID_PALCEHOLDER = ":POOLID:";
    const POOLWEBCLIENTID_PALCEHOLDER = ":POOLWEBCLIENTID:";
    const POOLOAUTHDOMAIN_PALCEHOLDER = ":POOLOAUTHDOMAIN:";
    const POOLREDIRECTSIGNIN_PALCEHOLDER = ":POOLREDIRECTSIGNIN:";
    const POOLREDIRECTSIGNOUT_PALCEHOLDER = ":POOLREDIRECTSIGNOUT:";
    const APIPREFIX_PALCEHOLDER = ":APIPREFIX:";
    const APISTAGE_PALCEHOLDER = ":APISTAGE:";
    const CLIENTID_PALCEHOLDER = ":CLIENTID:";
    const CLIENTDISPLAYNAME_PALCEHOLDER = ":CLIENTDISPLAYNAME:";

    const cognitoStackExportsStartKey = 'krnysnpapplicationstackCognitoInfraStack';
    const cognitoStackExportsKey = Object.keys(stackExports).filter(k => k.startsWith(cognitoStackExportsStartKey));
    const cognitoExports = stackExports[cognitoStackExportsKey];

    const apiGatewayStackExportsStartKey = 'krnysnpapplicationstackApiGatewayInfraStack';
    const apiGatewayStackExportsKey = Object.keys(stackExports).filter(k => k.startsWith(apiGatewayStackExportsStartKey));
    const apiGatewayExports = stackExports[apiGatewayStackExportsKey];

    const dashboardsBucketName = getServiceNames.getDashboardsBucketName(envName)
    const dashboardsBucket = s3.Bucket.fromBucketName(this, `infraDashboardsBucketName`, dashboardsBucketName);

    let sourcePath = path.join(__dirname, '../../services/uiBundles/DefaultUiBundle');
    const defaultIDPTemplate = fs.readFileSync(`${sourcePath}/idpConfig.js`, 'utf-8');

    clientsToOnboardConfigs.forEach((entity, iter) => {
      const clientId = entity.id;
      const host = entity.host;
      const clientName = entity.name;

      let idpConfigTemplateContents = `${defaultIDPTemplate}`;
      if (fs.existsSync(path.join(__dirname, `../../services/uiBundles/${clientId}`))){
        sourcePath = path.join(__dirname, `../../services/uiBundles/${clientId}`);
        idpConfigTemplateContents = fs.readFileSync(`${sourcePath}/idpConfig.js`, 'utf-8');
      }

      console.log(`idpConfigTemplateContents-${iter}`, idpConfigTemplateContents);
      //// Modify idpConfig file
      const clientWebAppFQDN = `https://${host}.${domain}`;
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(REGION_PALCEHOLDER, awsRegion);
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(POOLID_PALCEHOLDER, cognitoExports[`Export${getExportName('userPoolId', {clientId})}`]);
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(POOLWEBCLIENTID_PALCEHOLDER, cognitoExports[`Export${getExportName('userPoolClient', {clientId})}`]);
      const oauthDomainFQDN = `${cognitoExports[`Export${getExportName('userPoolDomain', {clientId})}`]}.auth.us-east-1.amazoncognito.com`;
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(POOLOAUTHDOMAIN_PALCEHOLDER, oauthDomainFQDN);
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(POOLREDIRECTSIGNIN_PALCEHOLDER, clientWebAppFQDN);
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(POOLREDIRECTSIGNOUT_PALCEHOLDER, clientWebAppFQDN);

      const gatewayRestApiId = apiGatewayExports[`Export${getExportName('apiGatewayRestApiId', {clientId})}`];
      const gatewayStageName = apiGatewayExports[`Export${getExportName('apiGatewayDeploymentStage', {clientId})}`];
      const clientApiRootResourcePath = apiGatewayExports[`Export${getExportName('apiGatewayRootResourcePath', {clientId})}`];
      const apiPrefix = `${gatewayRestApiId}.execute-api.${awsRegion}.amazonaws.com`;
      const stageRootResourcePath = `${gatewayStageName}${clientApiRootResourcePath}`;

      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(APIPREFIX_PALCEHOLDER, apiPrefix);
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(APISTAGE_PALCEHOLDER, stageRootResourcePath);

      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(CLIENTID_PALCEHOLDER, clientId);
      idpConfigTemplateContents = idpConfigTemplateContents.replaceAll(CLIENTDISPLAYNAME_PALCEHOLDER, clientName);

      console.log(`wiriting - ${iter} idpConfigTemplateContents: `, idpConfigTemplateContents)
      fs.writeFileSync(`${sourcePath}/idpConfig.js`, idpConfigTemplateContents)

      new s3deploy.BucketDeployment(this, `infraDashboards-create-bucket-folders${clientId}`, {
        sources: [s3deploy.Source.asset(sourcePath)],
        destinationBucket: dashboardsBucket,
        destinationKeyPrefix: `dashboards/${clientId}/dashboard`,
      });
    })
  }
}

module.exports = { InfraDashboardsStack }
