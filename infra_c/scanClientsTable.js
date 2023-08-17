const fs = require('fs');
const path = require('path');
const {exec} = require("node:child_process");
const getServiceNames = require("./lib/utils/getServiceName");
const clientBucketEventNotificationConfig = require("../services/EventNotification/s3/clientBucket/config.json");
const getAWSAccountAndRegion = require("./getAWSAccountAndRegion");

const {awsAccount, awsRegion} = getAWSAccountAndRegion();

function listDirRecursively(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((file) => file.isDirectory() ? listDirRecursively(path.join(dir, file.name)) : path.join(dir, file.name))
}

(async ()=>{
  const envName = process.env.ENV_NAME;
  const dashboardsBucketName = getServiceNames.getDashboardsBucketName(envName)

  exec(`aws dynamodb scan --table-name sensing-solution-tenant --attributes-to-get '["id", "adminEmail", "host", "name"]'`, (e, o)=>{
    if (e){
      throw e
    }
    const clientsConfigs = JSON.parse(o).Items;
    console.log(clientsConfigs, o)
    const clientsToOnboardConfigs = [];
    const pathToIamDefinitions = path.join(__dirname, "../services/IAM");
    clientsConfigs.forEach(clientConfig =>{
      const configObject = {};
      Object.keys(clientConfig).forEach(key =>{
        const firstKey = Object.keys(clientConfig[key])[0]
        configObject[key] = clientConfig[key][firstKey];

        if (key === 'id'){
          const clientId = `${configObject[key]}`;
          exec(`aws s3api head-object --bucket ${dashboardsBucketName} --key dashboards/${clientId}/dashboard/index.html`, (error, exists)=>{
            if (!exists){
              exec(`aws dynamodb update-item --table-name "sensing-solution-tenant" --key '{"id": {"N": "${clientId}"}}' --update-expression "SET #H = :h" --expression-attribute-names '{"#H":"onboardDt"}' --expression-attribute-values '{":h":{"S":"processing"}}'`, (err, output) => {
                if (err){
                  console.log("Failed to update dyanmodb item with onboarding start status.", err);
                } else {
                  console.log("Updated dynamodb with onboarding start status", output)
                }
              })
            }
          });

          // Create Per client Roles and Policies
          // Create Per client Policies
          const pathToDynamicPoliciesFolder = path.join(pathToIamDefinitions, "perTenantPolicies");
          const perClientPolicyNames = fs.readdirSync(pathToDynamicPoliciesFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
          perClientPolicyNames.forEach(policyConfigFileName =>{
            let policyConfig = fs.readFileSync(path.join(pathToDynamicPoliciesFolder, policyConfigFileName), "utf-8");

            // Replace Account ID
            policyConfig = policyConfig.replaceAll("123456789012", `${awsAccount}`);

            // Replace Account Region
            policyConfig = policyConfig.replaceAll(":AWS_REGION:", `${awsRegion}`);

            // Replace Env Name
            policyConfig = policyConfig.replaceAll(":ENV_NAME:", `${envName}`);

            // Replace Tenant ID
            policyConfig = policyConfig.replaceAll(":TENANT_ID:", `${clientId}`);

            const policyConfigP = JSON.parse(policyConfig);
            const policyName = policyConfigP.policyName;
            const policy = policyConfigP.policy;


            // Create a directory named as policy name
            const policyDirectory = `${pathToIamDefinitions}/policies/${policyName}`
            fs.existsSync(policyDirectory) || fs.mkdirSync(policyDirectory);

            // Write policy.json in the created Direcotry
            fs.writeFileSync(`${policyDirectory}/policy.json`, JSON.stringify(policy));

            console.log(`Written ${policyDirectory}/policy.json`);
          });

          // Create per client roles
          const pathToDynamicRolesFolder = path.join(pathToIamDefinitions, "perTenantRoles");
          const perClientRoleConfigFileNames = fs.readdirSync(pathToDynamicRolesFolder).filter(item => !/(^|\/)\.[^/.]/g.test(item));
          perClientRoleConfigFileNames.forEach(perClientRoleConfigFileName =>{
            let roleConfig = fs.readFileSync(path.join(pathToDynamicRolesFolder, perClientRoleConfigFileName), "utf-8");

            // Replace Account ID
            roleConfig = roleConfig.replaceAll("123456789012", `${awsAccount}`);

            // Replace Account Region
            roleConfig = roleConfig.replaceAll(":AWS_REGION:", `${awsRegion}`);

            // Replace Env Name
            roleConfig = roleConfig.replaceAll(":ENV_NAME:", `${envName}`);

            // Replace Tenant ID
            roleConfig = roleConfig.replaceAll(":TENANT_ID:", `${clientId}`);

            const roleConfigP = JSON.parse(roleConfig);

            const roleName = roleConfigP.roleName;
            const roleConfiguration = roleConfigP.roleConfig;

            // Create a directory named as role name
            const roleDirectory = `${pathToIamDefinitions}/roles/${roleName}`
            fs.existsSync(roleDirectory) || fs.mkdirSync(roleDirectory);

            // Write role config.json in the created Directory
            fs.writeFileSync(`${roleDirectory}/config.json`, JSON.stringify(roleConfiguration));
            console.log(`Written ${roleDirectory}/config.json`);
          });
        }
      });
      clientsToOnboardConfigs.push(configObject)
    })
    fs.writeFileSync(path.join(__dirname, './bin/scannedClientTable.json'), JSON.stringify(clientsToOnboardConfigs, null, 2));

    console.log("IAM Service listing:-");
    listDirRecursively(pathToIamDefinitions);
  })


  exec('aws lambda get-function --function-name ingestion-similarweb-client', (err, out)=>{
    if (err){
      console.log("ingestion-similarweb-client lambda not found, removing notification config for the lambda");
      delete clientBucketEventNotificationConfig.similarWebIngestion

      fs.writeFileSync(path.join(__dirname, "../services/EventNotification/s3/clientBucket/config.json"), JSON.stringify(clientBucketEventNotificationConfig))
    }
  })
})();
