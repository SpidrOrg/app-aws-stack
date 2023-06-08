import _ from "lodash";
import ServicesConnector from "/opt/ServicesConnector.mjs";

// Constants
//
const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERIES = [];
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDate = _.get(event, "marketSensingRefreshDate");
    const category = _.get(event, "category");
    const horizon = _.get(event, "horizon");
    const driverCategory = _.get(event, "driver");

    QUERIES.push({
      resultPath: `data`,
      resultFormatter:(result)=>{
        return _.get(result, "data", [])
      },
      query: `
        SELECT      key_demand_drivers.description as data_point,
                    variable_treatment.dataset as source,
                    ROUND(Sum(feature_importance) * 100, 2) AS imp
        FROM        key_demand_drivers
        LEFT JOIN   variable_treatment
        ON          key_demand_drivers.description = variable_treatment.columns
        WHERE       key_demand_drivers.horizon = '${horizon}'
        AND         key_demand_drivers.date = '${marketSensingRefreshDate}'
        AND         key_demand_drivers.category = '${category}'
        AND         variable_treatment.category = '${driverCategory}'
        GROUP  BY   key_demand_drivers.description,
                    variable_treatment.dataset
        ORDER  BY   variable_treatment.dataset,
                    imp DESC 
      `
    });

    const promises = QUERIES.map(query => servicesConnector.makeAthenQuery(query.query));
    const results = await Promise.all(promises).then(_results =>{
      const resultsWithName = {};
      _.forEach(_results, (_result, i) => {
        _.set(resultsWithName, QUERIES[i].resultPath , QUERIES[i].resultFormatter ? QUERIES[i].resultFormatter(_result) : _result);
      });
      return resultsWithName;
    });

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': results,
      'query': QUERIES
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
