const { Stack } = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const cr = require('aws-cdk-lib/custom-resources');
const path = require("path");
const fs = require("fs");
const constants = require("./constants");

class IamInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    this.stackExports = {};

    // Create IAM Roles
    //// Create all Policies
    const pathToPoliciesFolder = path.join(__dirname, "../../services/IAM/policies");
    const policiesFolders = fs.readdirSync(pathToPoliciesFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));

    const policiesP = {};
    policiesFolders.forEach(policyFolder => {
      let policy = fs.readFileSync(path.join(pathToPoliciesFolder, policyFolder, "policy.json"), "utf-8");
      policy = policy.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `:${props.env.account}:`)
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
    const allRoles = {};
    rolesFolders.forEach(roleFolder=>{
      let roleText =  fs.readFileSync(path.join(pathToRolesFolder, roleFolder, "config.json"), "utf-8");
      roleText = roleText.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `:${props.env.account}:`);

      const roleP = JSON.parse(roleText);

      const iamRole = new iam.Role(this, `${roleFolder}`, {
        roleName: roleFolder,
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description: roleP.description ?? '',
        managedPolicies: roleP.policies.map(n => iam.ManagedPolicy.fromManagedPolicyName(this, `${roleFolder}-${n}`, n))
      });

      allRoles[roleFolder] = iamRole;

      Object.keys(policiesP).forEach(policyName => {
        const policy = policiesP[policyName];
        iamRole.node.addDependency(policy);
      });

      // Export Role
      this.exportValue(iamRole.roleName);
      this.stackExports[`iamRoleRef${roleFolder}`] = iamRole.roleName;
      // new CfnOutput(this, `iamRoleRef${roleFolder}`, {
      //   value: iamRole.roleName,
      //   description: `IAM Role Name: ${roleFolder}`,
      //   exportName: `iamRoleRef${roleFolder}`,
      // });
    })

    rolesFolders.forEach(roleFolder=> {
      let roleText = fs.readFileSync(path.join(pathToRolesFolder, roleFolder, "config.json"), "utf-8");
      roleText = roleText.replaceAll(constants.ACCOUNT_ID_PALCEHOLDER, `:${props.env.account}:`);

      const roleP = JSON.parse(roleText);

      const iamRole = allRoles[roleFolder];
      const customResource = new cr.AwsCustomResource(this, `ModifyTrustPolicy${roleFolder}`, {
        onCreate: {
          service: 'IAM',
          action: 'updateAssumeRolePolicy',
          parameters: {
            RoleName: iamRole.roleName,
            PolicyDocument: JSON.stringify(roleP.trustRelationship)
          },
          physicalResourceId: cr.PhysicalResourceId.of(`ModifyTrustPolicy${roleFolder}`)
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE
        })
      });

      Object.keys(allRoles).forEach(roleFolder => {
        customResource.node.addDependency(allRoles[roleFolder]);
      })
    })


  }
}
module.exports = {IamInfraStack};
