const { Stack, Fn} = require('aws-cdk-lib');
const s3 = require("aws-cdk-lib/aws-s3");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const path = require("path");
const fs = require("fs");

class UiBundleStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const pathToDefaultDashboardBundle = path.join(__dirname, "../../services/DefaultUiBundle");
    const POOLID_PALCEHOLDER = ":POOLID:";
    const POOLWEBCLIENTID_PALCEHOLDER = ":POOLWEBCLIENTID:";
    const POOLOAUTHDOMAIN_PALCEHOLDER = ":POOLOAUTHDOMAIN:";
    const POOLREDIRECTSIGNIN_PALCEHOLDER = ":POOLREDIRECTSIGNIN:";
    const POOLREDIRECTSIGNOUT_PALCEHOLDER = ":POOLREDIRECTSIGNOUT:";
    const APIPREFIX_PALCEHOLDER = ":APIPREFIX:";
    const APISTAGE_PALCEHOLDER = ":APISTAGE:";
    const CLIENTID_PALCEHOLDER = ":CLIENTID:";
    const CLIENTDISPLAYNAME_PALCEHOLDER = ":CLIENTDISPLAYNAME:";

    // Dashboards Bucket
    const dashboardsBucketARN = Fn.importValue(`dashboardsBucketARN`);
    const dashboardsBucket = s3.Bucket.fromBucketArn(this, `dashboardsBundleBucket`, dashboardsBucketARN);
    // API Gateway Imports
    const apiGatewayRootUrl = Fn.importValue(`apiGatewayRootUrl`);
    const apiGatewayBaseDeploymentStage = Fn.importValue(`apiGatewayBaseDeploymentStage`);

    const {allEntities = []} = props;
    allEntities.forEach(entity =>{
      const clientId = entity.id;
      const entityName = entity.name;

      // Cognito Stack Imports
      const cognitoUserPoolId = Fn.importValue(`userpool${clientId}ResourceIdsUserPoolId`);
      const cognitoUserPoolWebClient = Fn.importValue(`userpool${clientId}ResourceIdsClientId`);
      const cognitoUserPoolDomain = Fn.importValue(`userpool${clientId}ResourceIdsDomain`);
      const cognitoUserPoolRedirectSignInPublicUrl = Fn.importValue(`userpool${clientId}redirectSignIn`);
      const cognitoUserPoolRedirectSignOutPublicUrl = Fn.importValue(`userpool${clientId}redirectSignOut`);

      const idpConfigFilePath = path.join(pathToDefaultDashboardBundle, "idpConfig.js");
      let idpConfig = fs.readFileSync(idpConfigFilePath, "utf-8");
      idpConfig = idpConfig.replaceAll(POOLID_PALCEHOLDER, `${cognitoUserPoolId}`);
      idpConfig = idpConfig.replaceAll(POOLWEBCLIENTID_PALCEHOLDER, `${cognitoUserPoolWebClient}`);
      idpConfig = idpConfig.replaceAll(POOLOAUTHDOMAIN_PALCEHOLDER, `${cognitoUserPoolDomain}`);
      idpConfig = idpConfig.replaceAll(POOLREDIRECTSIGNIN_PALCEHOLDER, `${cognitoUserPoolRedirectSignInPublicUrl}`);
      idpConfig = idpConfig.replaceAll(POOLREDIRECTSIGNOUT_PALCEHOLDER, `${cognitoUserPoolRedirectSignOutPublicUrl}`);

      idpConfig = idpConfig.replaceAll(APIPREFIX_PALCEHOLDER, `${apiGatewayRootUrl}`);
      idpConfig = idpConfig.replaceAll(APISTAGE_PALCEHOLDER, `${apiGatewayBaseDeploymentStage}`);
      idpConfig = idpConfig.replaceAll(CLIENTID_PALCEHOLDER, `${clientId}`);
      idpConfig = idpConfig.replaceAll(CLIENTDISPLAYNAME_PALCEHOLDER, `${entityName}`);
      fs.writeFileSync(path.join(pathToDefaultDashboardBundle, "idpConfig.js"), idpConfig);

      new s3deploy.BucketDeployment(this, `dashboard-bundler-${clientId}`, {
        sources: [s3deploy.Source.asset(pathToDefaultDashboardBundle)],
        destinationBucket: dashboardsBucket,
        destinationKeyPrefix: `dashboards/${clientId}/dashboard`
      });
    })
  }
}

module.exports = {UiBundleStack}
