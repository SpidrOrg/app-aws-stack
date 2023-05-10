const {Stack, Fn} = require("aws-cdk-lib");
const glueAlpha = require("@aws-cdk/aws-glue-alpha");
const clientDatabaseSchema = require('../../services/glue/client-database-schema.json');
const glueTableColumnTypeMappings = require('./utils/glueTableColumnTypeMappings.json');
const s3 = require("aws-cdk-lib/aws-s3");

class GlueInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {allEntities = [], envName} = props;
    allEntities.forEach(entity =>{
      const clientId = entity.id;
      const clientDatabaseName = `${clientId}-database-${envName}`;

      const clientBucketARN = Fn.importValue(`clientBucketRef${clientId}`);
      const clientBucket = s3.Bucket.fromBucketArn(this, `clientBucketRefForGlue${clientId}`, clientBucketARN);

      const clientDatabaseP = new glueAlpha.Database(this, `clientdb${clientId}`, {
        databaseName: clientDatabaseName
      });

      // Create Tables for Client Database as per schema
      Object.keys(clientDatabaseSchema).forEach(tableName =>{
        const tableConfig = clientDatabaseSchema[tableName];
        const tableColumns = tableConfig.columns.map(v => {
          return {
            name: v.Name,
            type: glueAlpha.Schema[glueTableColumnTypeMappings[v.Type]] ?? glueAlpha.Schema.STRING,
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
    })
  }
}

module.exports = {GlueInfraStack}
