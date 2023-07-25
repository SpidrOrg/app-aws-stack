import _ from "lodash";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);
const ALL = "ALL";
const ALL_MARK = "*";
const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";

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
    const category = v[2] === ALL ? "*" : v[2];
    const retailer = v[3] === ALL ? "*" : v[3];

    const indexOfCategory = _.indexOf(categories, category);
    const indexOfCustomer = _.indexOf(customers, retailer);
    if (indexOfCategory === -1 || indexOfCustomer === -1){
      return acc;
    }
    let msGrowth = valueOrQuantity === BY_VALUE ? v[6] : v[7];
    let clientGrowth = valueOrQuantity === BY_VALUE ? v[8] : v[9];
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
