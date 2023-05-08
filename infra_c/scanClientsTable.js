const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const fs = require('fs');
const path = require('path');

(async ()=>{
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
          configObject[key] = `${configObject[key]}`
        }
      });
      clientsToOnboardConfigs.push(configObject)
    })
    fs.writeFileSync(path.join(__dirname, './bin/scannedClientTable.json'), JSON.stringify(clientsToOnboardConfigs, null, 2));
  } catch (e){
    console.log("Error fetch data from clients table", e);
  }

})();
