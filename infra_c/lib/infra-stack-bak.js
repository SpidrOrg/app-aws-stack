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
const glue = require('aws-cdk-lib/aws-glue')
const glueAlpha = require('@aws-cdk/aws-glue-alpha');
const athena = require('aws-cdk-lib/aws-athena');
const cognito = require('aws-cdk-lib/aws-cognito');
const apigateway = require('aws-cdk-lib/aws-apigateway');

const fs = require("fs");
const crypto = require('crypto');

const path = require("path");

class InfraStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const parsedInput = eventInputParsed()

    // INPUT
    const clientId = parsedInput.id;
    const certificateArn = "arn:aws:acm:us-east-1:932399466203:certificate/f085089d-f5ab-4286-8feb-08cac18e208e";
    const domain = "trial.dev.testvisd.online";
    const cognitoDomain = "client1visd";
    const host = "client5"
    const hostedZoneId = "Z05023842CSJVZ3JVYYYJ";
    ///
    // Constants
    const lambdaEdgeCloudfrontOriginRequestName = "dd-cf-lambda-edge";
    const CLIENT_ONBOARDING_STATE_SSM_PARAMETER_NAME = 'currentHosts'
    //
    let currentHosts = [];
    try {
      currentHosts = ssm.StringParameter.valueFromLookup(this, CLIENT_ONBOARDING_STATE_SSM_PARAMETER_NAME);
      currentHosts = currentHosts.split(",").filter(v => v.trim()).map(v => v.trim())
    }catch (e){
      currentHosts = [];
    }

    // // Create Client S3 Bucket
    const clientBucketName = getServiceNames.getClientBucketName(clientId, props.envName)
    const clientBucket = new s3.Bucket(this, 'client-bucket', {
      bucketName: clientBucketName,
      removalPolicy: RemovalPolicy.DESTROY, // Todo: Remove this
      autoDeleteObjects: true // Todo: Remove this
    });
    //// Create client bucket folders
    new s3deploy.BucketDeployment(this, `create-client-bucket-folders`, {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../services/s3/clientBucket/folderStructure'))],
      destinationBucket: clientBucket,
    });

    // Create Dashboards S3 Bucket if not exists
    const dashboardsBucketName = getServiceNames.getDashboardsBucketName(props.envName)
    const dashboardsBucket = new s3.Bucket(this, 'dashboards-bucket', {
      bucketName: dashboardsBucketName,
      removalPolicy: RemovalPolicy.DESTROY, // Todo: Remove this
      autoDeleteObjects: true // Todo: Remove this
    });
    //
    // //// Create client bucket folders
    new s3deploy.BucketDeployment(this, `create-dashboards-bucket-folders`, {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../services/s3/_blank'))],
      destinationBucket: dashboardsBucket,
      destinationKeyPrefix: `dashboards/${clientId}/dashboard`,
    });



    // Create IAM Roles
    //// Create all Policies
    const pathToPoliciesFolder = path.join(__dirname, "../../services/IAM/policies");
    const policiesFolders = fs.readdirSync(pathToPoliciesFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));

    const policiesP = {};
    policiesFolders.forEach(policyFolder => {
      let policy = fs.readFileSync(path.join(pathToPoliciesFolder, policyFolder, "policy.json"), "utf-8");
      policy = policy.replaceAll(':123456789012:', `:${props.env.account}:`)
      const policyP = JSON.parse(policy);

      const statements = policyP['Statement'];
      const statementsP = statements.map(statement => {
        return new iam.PolicyStatement({
          effect: statement.Effect,
          actions: statement.Action instanceof Array ? statement.Action : [statement.Action],
          resources: statement.Resource instanceof Array ? statement.Resource : [statement.Resource]
        })
      })

      policiesP[policyFolder] = new iam.ManagedPolicy(this, `${policyFolder}`, {
        managedPolicyName: policyFolder,
        statements: statementsP,
      });
    });

    // //// Create all Roles
    const pathToRolesFolder = path.join(__dirname, "../../services/IAM/roles");
    const rolesFolders = fs.readdirSync(pathToRolesFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
    const rolesP = {};
    rolesFolders.forEach(roleFolder=>{
      let roleText =  fs.readFileSync(path.join(pathToRolesFolder, roleFolder, "config.json"), "utf-8");
      roleText = roleText.replaceAll(':123456789012:', `:${props.env.account}:`);

      const roleP = JSON.parse(roleText);

      rolesP[roleFolder] = new iam.Role(this, `${roleFolder}`, {
        roleName: roleFolder,
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description: roleP.description ?? '',
        managedPolicies: roleP.policies.map(n => iam.ManagedPolicy.fromManagedPolicyName(this, `${roleFolder}-${n}`, n))
      });
    })


    rolesFolders.forEach(roleFolder=>{
      let roleText =  fs.readFileSync(path.join(pathToRolesFolder, roleFolder, "config.json"), "utf-8");
      roleText = roleText.replaceAll(':123456789012:', `:${props.env.account}:`);

      const roleP = JSON.parse(roleText);

      const iamRole = rolesP[roleFolder];

      // Attach Trust Relationship policy
      //// Policy Document
      // const statementsP = roleP.trustRelationship.Statement.map(statement => {
      //   return new iam.PolicyStatement({
      //     effect: statement.Effect,
      //     actions: statement.Action instanceof Array ? statement.Action : [statement.Action],
      //     principals: [new iam.ServicePrincipal()]
      //   })
      // })
      // iamRole.assumeRolePolicy(new iam.PolicyDocument({
      //   statements: statementsP
      // }))
    })

    // Create Lamba@Edge
    const pathToLambdaEdgeCodeFolders = path.join(__dirname, "../../services/lambda@Edge");
    const lambdaFolders = fs.readdirSync(pathToLambdaEdgeCodeFolders).filter(item => !/(^|\/)\.[^/.]/g.test(item));

    const edgeLambdas = {};

    lambdaFolders.forEach(lambdaFolder =>{
      const lambdaConfigurationFilePath = path.join(pathToLambdaEdgeCodeFolders, lambdaFolder, "configuration.json");
      let config = fs.readFileSync(lambdaConfigurationFilePath, "utf-8");
      config = config.replaceAll(':123456789012:', `${props.env.account}`);
      const configP = JSON.parse(config);

      const fn = new lambda.Function(this, `${lambdaFolder}`, {
        functionName: lambdaFolder,
        runtime: lambda.Runtime[configP.runtime],
        architecture: lambda.Architecture[configP.architecture],
        timeout: Duration.seconds(configP.configuration.timeout),
        role: rolesP[configP.configuration.iamRole],
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(pathToLambdaEdgeCodeFolders, lambdaFolder, "code")),
      });

      const lambdaCodeFilePath = path.join(pathToLambdaEdgeCodeFolders, lambdaFolder, "code/index.mjs");
      const lambdacode = fs.readFileSync(lambdaCodeFilePath, "utf-8");
      const versionHash = crypto.createHash('md5').update(`${config}${lambdacode}`).digest('hex');
      const lambdaVersion = new lambda.Version(this, `${lambdaFolder}-${versionHash}`, {
        lambda: fn
      });

      edgeLambdas[lambdaFolder] = {
        lambda: fn,
        lambdaVersion
      }
    })


    // Cloudfront
    //// Get certificate
    const certificate = acm.Certificate.fromCertificateArn(this, "Certificate", certificateArn);


    const oac = new cloudfront.CfnOriginAccessControl(this, 'AOC', {
      originAccessControlConfig: {
        name: 'AOC',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });

    const lambdaFunctionAssociation = {
      eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
      functionVersion: edgeLambdas[lambdaEdgeCloudfrontOriginRequestName].lambdaVersion,
      includeBody: false,
    };
    const oia = new cloudfront.OriginAccessIdentity(this, 'OIA', {
      comment: "Created by CDK"
    });
    dashboardsBucket.grantRead(oia);
    const cf = new cloudfront.Distribution(this, "cdnDistribution", {
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
        originRequestPolicy: new cloudfront.OriginRequestPolicy(this, 'OriginRequestPolicy', {
          originRequestPolicyName: 'MyPolicy',
          comment: 'A default policy',
          headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList("Host"),
        }),
        edgeLambdas: [lambdaFunctionAssociation]
      },
      domainNames: [domain, ...currentHosts.map(v => `${v}.${domain}`), `${host}.${domain}`],
      certificate
    });

    // const cfnDistribution = cf.node.defaultChild
    // cfnDistribution.addOverride('Properties.DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity', "")
    // cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', oac.getAtt('Id'))
    //
    // const s3OriginNode = cf.node.findAll().filter((child) => child.node.id === 'S3Origin');
    // s3OriginNode[0].node.tryRemoveChild('Resource');

    // Get the zone
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, `domain${host}`, {
      zoneName: domain,
      hostedZoneId: hostedZoneId,
    });

    const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(cf));

    // [...currentHosts].forEach((recordName) => {
    //   new route53.CfnRecordSet(this, `CDNARecord${recordName}delete`, {
    //     hostedZoneId: zone.hostedZoneId,
    //     name: `${host}.${domain}`,
    //     type: 'A',
    //     aliasTarget: {
    //       dnsName: 'd7e9gt0qkq093.cloudfront.net',
    //       hostedZoneId: hostedZoneId
    //     },
    //   }).addDeletionOverride('DeletionOverride');
    // });
    //
    // [...currentHosts, host].forEach((recordName) => {
    //   new route53.ARecord(this, `CDNARecord${recordName}`, {
    //     zone,
    //     target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(cf)),
    //     recordName
    //   });
    // });

    // Create Client Database
    const clientDatabaseName = `${clientId}-database-${props.envName}`;

    // const clientDatabaseP = new glue.CfnDatabase(this, `clientdb${clientId}`, {
    //   catalogId: `${props.env.account}`,
    //   databaseInput: {
    //     targetDatabase: {
    //       catalogId: `${props.env.account}`,
    //       databaseName: clientDatabaseName,
    //     },
    //   },
    // });

    const clientDatabaseP = new glueAlpha.Database(this, `clientdb${clientId}`, {
      databaseName: clientDatabaseName
    });

    // Create Tables for Client Database as per schema
    Object.keys(clientDatabaseSchema).forEach(tableName =>{
      const tableConfig = clientDatabaseSchema[tableName];
      const tableColumns = tableConfig.columns.map(v => {
        return {
          name: v.Name,
          type: glueAlpha.Schema[glueTableColumnTypeMappings[v.Type]],
          comment: 'Created by CDK'
        }
      });

      const gt = new glueAlpha.Table(this, `${tableName}-${clientDatabaseName}`, {
        tableName,
        database: clientDatabaseP,
        columns: tableColumns,
        dataFormat: glueAlpha.DataFormat.CSV,
        bucket: clientBucket,
        s3Prefix: tableConfig.prefix
      });

      const glueTableP = gt.node.defaultChild;
      glueTableP.tableInput.storageDescriptor.serdeInfo.parameters = tableConfig.serdeParameters
      glueTableP.tableInput.parameters = {
        classification: "csv"
      }
    })

    // Create Athena Workgroup
    const cfnWorkGroup = new athena.CfnWorkGroup(this, `athenaWorkgroup${clientId}`, {
      name: `${clientId}-athena-workgroup-${props.envName}`,
      description: 'Create by CDK',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${clientBucketName}/athena_results/`,
        },
      },
    });


    // Cognito user pool
    const userPool = new cognito.UserPool(this, `userpool${clientId}${props.envName}`, {
      userPoolName: `${props.envName}-${clientId}`,
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

    const userPoolDomain = userPool.addDomain(`userpool${clientId}domain`, {
      cognitoDomain: {
        domainPrefix: `${props.envName}-${cognitoDomain.replaceAll(" ", "-")}`,
      }
    });

    const userPoolResourceServerTenantScope = new cognito.ResourceServerScope({ scopeName: `${clientId}`, scopeDescription: 'tenant-id' })
    const userPoolResourceServer = userPool.addResourceServer(`userpool${clientId}ResourceServer`, {
      userPoolResourceServerName: 'tenancy',
      identifier: 'tenant',
      scopes: [userPoolResourceServerTenantScope]
    })

    const userPoolClient = new cognito.UserPoolClient(this, `userpool${clientId}client`, {
      userPool,
      userPoolClientName: "web-client",
      authFlows: {
        custom: true,
        userSrp: true,
      },
      oAuth: {
        callbackUrls: [`https://${host}.${domain}`, 'http://localhost:3000'],
        logoutUrls: [`https://${host}.${domain}`, 'http://localhost:3000'],
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE, cognito.OAuthScope.resourceServer(userPoolResourceServer, userPoolResourceServerTenantScope)],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      refreshTokenValidity: Duration.minutes(60),
      authSessionValidity: Duration.minutes(3),
      accessTokenValidity: Duration.minutes(5),
      idTokenValidity: Duration.minutes(5),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      generateSecret: false,
    });

    // Create Admin User
    const cfnUserPoolUser = new cognito.CfnUserPoolUser(this, 'MyCfnUserPoolUser', {
      userPoolId: userPool.userPoolId,
      desiredDeliveryMediums: ['EMAIL'],
      forceAliasCreation: false,
      userAttributes: [{
        name: 'email',
        value: 'vishal.daga@xebia.com',
      }],
      username: 'vishal.daga@xebia.com'
    });

    // Create Admin user pool Group
    const cfnUserPoolGroup = new cognito.CfnUserPoolGroup(this, 'MyCfnUserPoolGroup', {
      userPoolId: userPool.userPoolId,
      description: 'Created by CDK',
      groupName: 'Admin'
    });

    // Attach user to Admin user pool group
    const cfnUserPoolUserToGroupAttachment = new cognito.CfnUserPoolUserToGroupAttachment(this, 'MyCfnUserPoolUserToGroupAttachment', {
      groupName: cfnUserPoolGroup.groupName,
      username: cfnUserPoolUser.username,
      userPoolId: userPool.userPoolId
    });


    // Create API Gateway
    const apiGatewayLambdaAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'booksAuthorizer', {
      cognitoUserPools: [userPool]
    });
    const api = new apigateway.RestApi(this, 'api', {
      description: 'Created by CDK',
      deployOptions: {
        stageName: props.envName,
      },
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
    });

    const todos = api.root.addResource('todos');

    todos.addMethod(
      'GET',
      new apigateway.LambdaIntegration(edgeLambdas[lambdaEdgeCloudfrontOriginRequestName].lambda, {
        proxy: false,
        requestTemplates: { "application/json": JSON.stringify({
            "scope" : "$context.authorizer.claims.scope",
            "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
            "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
            "customer": "$input.params('customer')",
            "category": "$input.params('category')",
            "valueORvolume": "$input.params('valueORvolume')",
            "lag": "$input.params('lag')"
          })
        },
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES
      }),
      {
        authorizer: apiGatewayLambdaAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizationScopes: [`tenant/${clientId}`]
      }
    );


    // Create lambda layer
    const calcLayer = new lambda.LayerVersion(this, 'calc-layer', {
      compatibleRuntimes: [
        lambda.Runtime.NODEJS_18_X
      ],
      code: lambda.Code.fromAsset(path.join(__dirname, '../../services/lambdaLayer/nodeEssentials/layer.zip')),
      description: 'multiplies a number by 2',
    });

    const demoLambda = new lambda.Function(this, 'lambdaFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('export const handler = async(event) => "Hello, CDK";'),
      layers: [calcLayer]
    })
  }
}

module.exports = { InfraStack }
