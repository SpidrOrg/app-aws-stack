const { Stack, RemovalPolicy, Duration } = require("aws-cdk-lib");
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
    this.stackExports = {};

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
        userInvitation: {
          emailSubject: "Kearney's Sensing & Pivot Solution",
          emailBody: `<div style="background-color:#f6f6f6; padding:16px; width: 100%; height: 100%; border:1px solid; font-style:oblique;font-size:21px"><br /> Greetings, <br/><br/> Your account has been created. <br/><br/> Username: {username} <br /> Temporary password: <span style="color: purple"><b> {####}</b></span> <br/> <br/> Application URL: <b><a href="https://${host}.${domain}">https://${host}.${domain}</b> <br /> <br /> </div>`,
          smsMessage: 'Your username is {username} and temporary password is {####}.',
        }
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
      const POOL_CALLBACK_URL_PUBLIC = `https://${host}.${domain}`;
      const POOL_LOGOUT_URL_PUBLIC = `https://${host}.${domain}`;
      const userPoolClient = new cognito.UserPoolClient(this, `userpool${clientId}client`, {
        userPool,
        userPoolClientName: "web-client",
        authFlows: {
          custom: true,
          userSrp: true,
        },
        oAuth: {
          callbackUrls: [POOL_CALLBACK_URL_PUBLIC, `http://localhost:${localhostPortMappingByEnv(envName)}`],
          logoutUrls: [POOL_LOGOUT_URL_PUBLIC, `http://localhost:${localhostPortMappingByEnv(envName)}`],
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
      this.exportValue(userPool.userPoolId);
      this.stackExports[`userpool${clientId}ResourceIdsUserPoolId`] = userPool.userPoolId;
      // new CfnOutput(this, `userpool${clientId}ResourceIdsUserPoolId`, {
      //   value: userPool.userPoolId,
      //   description: `User Pool ID`,
      //   exportName: `userpool${clientId}ResourceIdsUserPoolId`,
      // });

      this.exportValue(userPoolClient.userPoolClientId);
      this.stackExports[`userpool${clientId}ResourceIdsClientId`] = userPoolClient.userPoolClientId;
      // new CfnOutput(this, `userpool${clientId}ResourceIdsClientId`, {
      //   value: userPoolClient.userPoolClientId,
      //   description: `Web Client ID`,
      //   exportName: `userpool${clientId}ResourceIdsClientId`,
      // });

      this.exportValue(userPoolDomain.domainName);
      this.stackExports[`userpool${clientId}ResourceIdsDomain`] = userPoolDomain.domainName;
      // new CfnOutput(this, `userpool${clientId}ResourceIdsDomain`, {
      //   value: userPoolDomain.domainName,
      //   description: `Domain`,
      //   exportName: `userpool${clientId}ResourceIdsDomain`,
      // });

      //// Other exports
      // this.exportValue(POOL_CALLBACK_URL_PUBLIC);
      // this.stackExports[`userpool${clientId}redirectSignIn`] = POOL_CALLBACK_URL_PUBLIC;
      // new CfnOutput(this, `userpool${clientId}redirectSignIn`, {
      //   value: POOL_CALLBACK_URL_PUBLIC,
      //   description: `UserPool Redirect SignIn`,
      //   exportName: `userpool${clientId}redirectSignIn`,
      // });

      // this.exportValue(POOL_LOGOUT_URL_PUBLIC);
      // this.stackExports[`userpool${clientId}redirectSignOut`] = POOL_LOGOUT_URL_PUBLIC;
      // new CfnOutput(this, `userpool${clientId}redirectSignOut`, {
      //   value: POOL_LOGOUT_URL_PUBLIC,
      //   description: `UserPool Redirect SignOut`,
      //   exportName: `userpool${clientId}redirectSignOut`,
      // });
    })
  }
}

module.exports = {CognitoInfraStack}
