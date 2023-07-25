import _ from "lodash";
import {writeFileToS3} from "/opt/s3Utils.mjs";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  // console.log("event", event)
  try {
    await servicesConnector.init(event);

    const QUERY1 = `
      SELECT      Array_join(Array_agg(DISTINCT( category )), '___'),
                  Array_join(Array_agg(DISTINCT( split1_final )), '___'),
                  Array_join(Array_agg(DISTINCT( ms_time_horizon )), '___'),
                  Array_join(Array_agg(DISTINCT( model )), '___')
      FROM        market_sensing 
    `;

    const QUERY2 = `
      SELECT DISTINCT( Cast(dt_x AS DATE) )
      FROM   market_sensing
      ORDER  BY Cast(dt_x AS DATE) DESC 
    `;

    const QUERY3 = `
      SELECT DISTINCT( model )
      FROM   client_forecast 
    `
    let [msDistincts, msDtXs, clientModels] = [
      await servicesConnector.makeAthenQuery(QUERY1),
      await servicesConnector.makeAthenQuery(QUERY2),
      await servicesConnector.makeAthenQuery(QUERY3)
    ]

    msDtXs = _.join(_.get(msDtXs, "data"), ",");
    clientModels = _.join(_.get(clientModels, "data"), ",");

    const row = [..._.get(msDistincts, "data[0]"), msDtXs, clientModels];

    const csvOutput = _.join(row, "|");
    const bucketName = `krny-spi-${servicesConnector.eventTenantId}${servicesConnector.envSuffix}`;
    console.log("bucketName", bucketName)
    const rollupFileKey = () => "rollups/filters/filters.csv"
    const s3Res = await writeFileToS3(servicesConnector.getS3Client(), bucketName, rollupFileKey, csvOutput).then(()=>true).catch((e)=>{
      console.log(e);
      return false;
    });

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      s3Res
    };

  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      err
    };
  }
};
