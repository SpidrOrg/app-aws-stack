import _ from "lodash";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  // console.log("event", event)
  let QUERIES = [];

  try {
    await servicesConnector.init(event);

    // Categories
    QUERIES.push({
      resultPath: "ms",
      resultFormatter:(result)=>{
        const res = _.get(result, "data[0]");
        const categories = _.split(_.get(res, "[0]"), "||");
        const customers = _.split(_.get(res, "[1]"), "||");
        const msTimeHorizon = _.split(_.get(res, "[2]"), "||");
        const msTimeHorizonFormatted = _.map(msTimeHorizon, horizon => {
          let formatted = "";
          try {
            formatted = horizon.replaceAll("_", "-").replaceAll("m", " Months")
          } catch (e){
            console.error(e);
          }
          return formatted
        });
        const msModel = _.split(_.get(res, "[3]"), "||");
        return {categories, customers, msTimeHorizon, msTimeHorizonFormatted, msModel}
      },
      query: `
        SELECT      Array_join(Array_agg(DISTINCT( category )), '||'),
                    Array_join(Array_agg(DISTINCT( split1_final )), '||'),
                    Array_join(Array_agg(DISTINCT( ms_time_horizon )), '||'),
                    Array_join(Array_agg(DISTINCT( model )), '||')
        FROM        market_sensing 
      `
    });

    QUERIES.push({
      resultPath: "updateDates",
      resultFormatter:(result)=>{
        return _.flatten(_.get(result, "data"))
      },
      query: `
        SELECT DISTINCT( Cast(dt_x AS DATE) )
        FROM   market_sensing
        ORDER  BY Cast(dt_x AS DATE) DESC 
      `
    });

    QUERIES.push({
      resultPath: "clientData.models",
      resultFormatter:(result)=>{
        return _.flatten(_.get(result, "data"))
      },
      query: `
            SELECT DISTINCT( model )
            FROM   client_forecast 
      `
    });

    const promises = QUERIES.map(query => servicesConnector.makeAthenQuery(query.query));
    const results = await Promise.all(promises).then(_results =>{
      const resultsWithName = {};
      _.forEach(_results, (_result, i) => {
        // console.log(_.get(_result, "logs"))
        _.set(resultsWithName, QUERIES[i].resultPath , QUERIES[i].resultFormatter ? QUERIES[i].resultFormatter(_result) : _result);
      });
      return resultsWithName;
    });
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': results
    };

  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      'body': err,
      'query': QUERIES,
    };
  }
};
