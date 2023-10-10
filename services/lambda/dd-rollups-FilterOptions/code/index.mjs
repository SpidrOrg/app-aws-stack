import _ from "lodash";
import {writeFileToS3, readFileAsString} from "/opt/s3Utils.mjs";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  // console.log("event", event)
  try {
    await servicesConnector.init(event);

    // Client Bucket Name
    const bucketName = `krny-spi-${servicesConnector.eventTenantId}${servicesConnector.envSuffix}`;

    // Read configuration file stored in client bucket
    const reviewsFileKey = () => "rollups/uiSettings.json"
    const configurationString = await readFileAsString(servicesConnector.getS3Client(), bucketName, reviewsFileKey).catch(() => "");
    const configuration = JSON.parse(configurationString);

    const PIVOT = _.map(configuration.splits, v => v.dataName);


    const QUERY1 = `
      SELECT      Array_join(Array_agg(DISTINCT( category )), '___'),
                  Array_join(Array_agg(DISTINCT( ms_time_horizon )), '___'),
                  Array_join(Array_agg(DISTINCT( model )), '___')
      FROM        market_sensing 
    `;

    const QUERY1a = `
      SELECT    Array_join(Array_agg(DISTINCT( split1_final )), '___'),
                Array_join(Array_agg(DISTINCT( split2_final )), '___'),
                Array_join(Array_agg(DISTINCT( split3_final )), '___')
      FROM      market_sensing 
    `;

    const QUERY2 = `
      SELECT DISTINCT( Cast(dt_x AS DATE) )
      FROM   market_sensing
      ORDER  BY Cast(dt_x AS DATE) DESC 
    `;

    const QUERY3 = `
      SELECT DISTINCT( model )
      FROM   client_forecast 
    `;

    let [msDistincts, splitDistincts, msDtXs, clientModels] = [
      await servicesConnector.makeAthenQuery(QUERY1),
      await servicesConnector.makeAthenQuery(QUERY1a),
      await servicesConnector.makeAthenQuery(QUERY2),
      await servicesConnector.makeAthenQuery(QUERY3)
    ]

    msDtXs = _.join(_.get(msDtXs, "data"), ",");
    clientModels = _.join(_.get(clientModels, "data"), ",");
    const splitDistinctsColVal = _.reduce(_.get(splitDistincts, "data[0]"), (acc, v, i)=>{
      const VAL_SEP = "___";
      const values = _.filter(_.split(v, VAL_SEP), k => _.size(_.trim(k)) > 0);
      return `${acc}${PIVOT[i]}&^${_.join(values, VAL_SEP)}%^`
    }, "")

    const row = [..._.get(msDistincts, "data[0]"), splitDistinctsColVal, msDtXs, clientModels];

    const csvOutput = _.join(row, "|");
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
