const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const fs = require('fs');
const path = require('path');
const {exec} = require("node:child_process");
const getServiceNames = require("./lib/utils/getServiceName");
const getAWSAccountAndRegion = require("./getAWSAccountAndRegion");
const accountConfig = require("./accountConfig.json");

(async ()=>{
  const {awsAccount, awsRegion} = getAWSAccountAndRegion();
  const {envName} = accountConfig[awsAccount][awsRegion];
  const dashboardsBucketName = getServiceNames.getDashboardsBucketName(envName)

  try {
    const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
    const {Items: clientsConfigs} = await ddbClient.send(new ScanCommand({
      TableName: "sensing-solution-tenant",
      AttributesToGet: [
        "id",
        "adminEmail",
        "choosenModel",
        "host",
        "name",
        "selectedDataSources"
      ]
    }));

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
  } catch (e){
    console.log("Error fetch data from clients table", e);
  }

})();
