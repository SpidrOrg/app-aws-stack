const {Stack, RemovalPolicy, Duration, CfnOutput} = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const constants = require("./constants");

const localhostPortMappingByEnv = (env)=>{
  switch (env){
    case constants.ENV.DEV:
      return 3000
    case constants.ENV.QA:
      return 3001
    case constants.ENV.UAT:
      return 3011
    case constants.ENV.PROD:
      return 3111
    default:
      return 3000
  }
}

class CognitoInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const REFRESH_TOKEN_VALIDITY_DURATION = Duration.minutes(60);
    const AUTH_SESSION_VALIDITY_DURATION = Duration.minutes(3);
    const ACCESS_TOKEN_VALIDITY_DURATION = Duration.minutes(5);
    const ID_TOKEN_VALIDITY_DURATION = Duration.minutes(5);

    const {allEntities = [], envName, domain} = props;

    allEntities.forEach(entity =>{
      const clientId = entity.id;
      const host = entity.host;
      const adminEmail = entity.adminEmail;

      const cognitoDomain = `krny-spi-${envName}-${host}`;

      // Cognito user pool
      const userPool = new cognito.UserPool(this, `userpool${clientId}`, {
        userPoolName: `${envName}-${clientId}`,
        selfSignUpEnabled: false,
        signInAliases: {
          email: true,
        },
        autoVerify: {
          email: true,
        },
        standardAttributes: {
          email: {
            required: true,
            mutable: true,
          },
          fullname: {
            required: true,
            mutable: true,
          }
        },
        passwordPolicy: {
          minLength: 6,
          requireLowercase: true,
          requireDigits: true,
          requireUppercase: false,
          requireSymbols: true,
        },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      // Cognito user pool Domain
      const userPoolDomain = userPool.addDomain(`userpool${clientId}domain`, {
        cognitoDomain: {
          domainPrefix: `${envName}-${cognitoDomain.replaceAll(" ", "-")}`,
        }
      });

      // Cognito user pool custom resource server
      const userPoolResourceServerTenantScope = new cognito.ResourceServerScope({ scopeName: `${clientId}`, scopeDescription: 'tenant-id' });
      const userPoolResourceServer = userPool.addResourceServer(`userpool${clientId}ResourceServer`, {
        userPoolResourceServerName: 'tenancy',
        identifier: 'tenant',
        scopes: [userPoolResourceServerTenantScope]
      })

      // Cognito user pool web client
      const userPoolClient = new cognito.UserPoolClient(this, `userpool${clientId}client`, {
        userPool,
        userPoolClientName: "web-client",
        authFlows: {
          custom: true,
          userSrp: true,
        },
        oAuth: {
          callbackUrls: [`https://${host}.${domain}`, `http://localhost:${localhostPortMappingByEnv(envName)}`],
          logoutUrls: [`https://${host}.${domain}`, `http://localhost:${localhostPortMappingByEnv(envName)}`],
          scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE, cognito.OAuthScope.resourceServer(userPoolResourceServer, userPoolResourceServerTenantScope)],
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
        refreshTokenValidity: REFRESH_TOKEN_VALIDITY_DURATION,
        authSessionValidity: AUTH_SESSION_VALIDITY_DURATION,
        accessTokenValidity: ACCESS_TOKEN_VALIDITY_DURATION,
        idTokenValidity: ID_TOKEN_VALIDITY_DURATION,
        enableTokenRevocation: true,
        preventUserExistenceErrors: true,
        generateSecret: false,
      });

      // Create Admin User
      const cfnUserPoolUser = new cognito.CfnUserPoolUser(this, `userpool${clientId}adminUser`, {
        userPoolId: userPool.userPoolId,
        desiredDeliveryMediums: ['EMAIL'],
        forceAliasCreation: false,
        userAttributes: [{
          name: 'email',
          value: `${adminEmail}`,
        }],
        username: `${adminEmail}`
      });

      // Create Admin user pool Group
      const cfnUserPoolGroup = new cognito.CfnUserPoolGroup(this, `userpool${clientId}adminGroup`, {
        userPoolId: userPool.userPoolId,
        description: 'Created by CDK',
        groupName: 'Admin'
      });

      // Attach user to Admin user pool group
      const cfnUserPoolUserToGroupAttachment = new cognito.CfnUserPoolUserToGroupAttachment(this, `userpool${clientId}adminUserToAdminGroupAttachment`, {
        groupName: cfnUserPoolGroup.groupName,
        username: cfnUserPoolUser.username,
        userPoolId: userPool.userPoolId
      });
      cfnUserPoolUserToGroupAttachment.node.addDependency(cfnUserPoolGroup)
      cfnUserPoolUserToGroupAttachment.node.addDependency(cfnUserPoolUser)

      //// Export Cognito IDs
      new CfnOutput(this, `userpool${clientId}ResourceIdsUserPoolId`, {
        value: userPool.userPoolId,
        description: `User Pool ID`,
        exportName: `userpool${clientId}ResourceIdsUserPoolId`,
      });
      new CfnOutput(this, `userpool${clientId}ResourceIdsClientId`, {
        value: userPoolClient.userPoolClientId,
        description: `Web Client ID`,
        exportName: `userpool${clientId}ResourceIdsClientId`,
      });
      new CfnOutput(this, `userpool${clientId}ResourceIdsDomain`, {
        value: userPoolDomain.domainName,
        description: `Domain`,
        exportName: `userpool${clientId}ResourceIdsDomain`,
      });
    })
  }
}

module.exports = {CognitoInfraStack}
