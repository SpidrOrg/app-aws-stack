import _ from "lodash";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);
const ALL = "ALL";
const ALL_MARK = "*";
const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";

const growthRollupIdx = {
  as_on: 0,
  model: 1,
  category: 2,
  splits: 3,
  prediction_start: 4,
  prediction_end: 5,
  ms_growth_by_val: 6,
  ms_growth_by_qty: 7,
  original_client_forecast_by_val: 8,
  original_client_forecast_by_qty: 9,
  adj_client_forecast_by_val: 10,
  adj_client_forecast_by_qty: 11,
  actual_growth_by_val: 12,
  actual_growth_by_qty: 13,
  actual_market_share_pct: 14,
  implied_market_share_pct_by_val: 15,
  implied_market_share_pct_by_qty: 16,
  total_forecast_gsv: 17,
  total_forecast_qty: 18,
  actual_gsv: 19,
  actual_qty: 20,
  client_model: 21,
  key_demand_drivers: 22,
  ms_predicted_volume: 23,
  ms_actual_volume: 24
}

const sanitizeNumeric = (val, roundDigits = 0)=>{
  const number = _.toNumber(val);
  if ( (!(val === 0) && !_.trim(val)) || _.isNaN(number) || _.isFinite(number) === false || _.isNumber(number) === false){
    return null;
  }
  return _.round(number, roundDigits);
}

const formatResultForDashboard = (queryResult, valueOrQuantity, categories, customers)=>{
  const varianceArray = _.map(categories, () =>{
    return _.map(customers, () =>{
      return null;
    })
  })
  const variances = _.reduce(queryResult, (acc, v)=>{
    const queryResultRetailerVal = _.get(_.split(v[growthRollupIdx.splits], '___'), '[0]');
    const category = v[growthRollupIdx.category] === ALL ? "*" : v[growthRollupIdx.category];
    const retailer = queryResultRetailerVal === ALL ? "*" : queryResultRetailerVal;

    const indexOfCategory = _.indexOf(categories, category);
    const indexOfCustomer = _.indexOf(customers, retailer);
    if (indexOfCategory === -1 || indexOfCustomer === -1){
      return acc;
    }
    let msGrowth = valueOrQuantity === BY_VALUE ? v[growthRollupIdx.ms_growth_by_val] : v[growthRollupIdx.ms_growth_by_qty];
    let clientGrowth = valueOrQuantity === BY_VALUE ? v[growthRollupIdx.original_client_forecast_by_val] : v[growthRollupIdx.original_client_forecast_by_qty];
    msGrowth = sanitizeNumeric(msGrowth);
    clientGrowth = sanitizeNumeric(clientGrowth);
    let growthVariance = null;
    if (msGrowth !== null && clientGrowth !== null){
      growthVariance = sanitizeNumeric(msGrowth - clientGrowth);
    }

    _.set(acc, `[${indexOfCategory}][${indexOfCustomer}]`, growthVariance);

    return acc;
  }, varianceArray);
  return {
    categories: categories,
    customers: customers,
    variance: variances
  }
}

const lagToModelName = (lag)=>{
  const lagNum = _.toNumber(lag);
  return `${lagNum}_${lagNum + 2}m`
}

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDate = _.get(event, "marketSensingRefreshDate");
    const valueOrQuantity = _.get(event, "valueORvolume");
    const lag = _.toNumber(_.get(event, "lag"));
    const categories = _.split(_.get(event, "categories"), ",");
    const customers = [ALL_MARK, ..._.split(_.get(event, "customers"), ",")];

    const model = lagToModelName(lag);

    QUERY = `
      select * from growth_rollup
      where as_on = '${marketSensingRefreshDate}'
      and model = '${model}'
    `
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    const re = formatResultForDashboard(_.get(queryResult, "data", []), valueOrQuantity, categories, customers)
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': re
    }
  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      'body': err,
      'query': QUERY,
    }
  }
};
