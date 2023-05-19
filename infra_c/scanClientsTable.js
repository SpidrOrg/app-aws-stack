const fs = require('fs');
const path = require('path');
const {exec} = require("node:child_process");
const getServiceNames = require("./lib/utils/getServiceName");
const clientBucketEventNotificationConfig = require("../services/EventNotification/s3/clientBucket/config.json");

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
    clientsConfigs.forEach(clientConfig =>{
      const configObject = {};
      Object.keys(clientConfig).forEach(key =>{
        const firstKey = Object.keys(clientConfig[key])[0]
        configObject[key] = clientConfig[key][firstKey];

        if (key === 'id'){
          configObject[key] = `${configObject[key]}`;
          exec(`aws s3api head-object --bucket ${dashboardsBucketName} --key dashboards/${configObject[key]}/dashboard/index.html`, (error, exists)=>{
            if (!exists){
              exec(`aws dynamodb update-item --table-name "sensing-solution-tenant" --key '{"id": {"N": "${configObject[key]}"}}' --update-expression "SET #H = :h" --expression-attribute-names '{"#H":"onboardDt"}' --expression-attribute-values '{":h":{"S":"processing"}}'`, (err, output) => {
                if (err){
                  console.log("Failed to update dyanmodb item with onboarding start status.", err);
                } else {
                  console.log("Updated dynamodb with onboarding start status", output)
                }
              })
            }
          })
        }
      });
      clientsToOnboardConfigs.push(configObject)
    })
    fs.writeFileSync(path.join(__dirname, './bin/scannedClientTable.json'), JSON.stringify(clientsToOnboardConfigs, null, 2));
  })


  exec('aws lambda get-function --function-name ingestion-similarweb-client', (err, out)=>{
    if (err){
      console.log("ingestion-similarweb-client lambda not found, removing notification config for the lambda");
      delete clientBucketEventNotificationConfig.similarWebIngestion

      fs.writeFileSync(path.join(__dirname, "../services/EventNotification/s3/clientBucket/config.json"), JSON.stringify(clientBucketEventNotificationConfig))
    }
  })


})();
