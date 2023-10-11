import _ from "lodash";
import dfns from 'date-fns';
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);
const ALL = "ALL";
const ALL_MARK = "*";
const UI_DATE_FORMAT = "MMM yy"
const DB_DATE_FORMAT = 'yyyy-MM-dd'
const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const numberOfHistoricPeriods = 12;

const lagToModelNameMapping = {
  1: "1_3m",
  4: "4_6m",
  7: "7_9m",
  10: "10_12m"
}

const getPeriodLabel = (asOnDateP, month1Add, month2Add) =>{
  return `${dfns.format(dfns.add(asOnDateP, {months: month1Add}), UI_DATE_FORMAT)} - ${dfns.format(dfns.add(asOnDateP, {months: month2Add}), UI_DATE_FORMAT)}`
}

const sanitizeNumeric = (val)=>{
  const number = _.toNumber(val);
  if ( (!(val === 0) && !_.trim(val)) || _.isNaN(number) || _.isFinite(number) === false || _.isNumber(number) === false){
    return null;
  }
  return number;
}

const formatResultForDashboard = (queryResult, marketSensingRefreshDateP, category, retailer, valueOrQuantity, lag, headerIndexes)=>{
  const result = {};
  const splitDbVal = `${retailer}___ALL___ALL}`;
  const lookbackMonths = 8;
  for(let i = 0; i < numberOfHistoricPeriods; i++){
    const startDateP = dfns.add(marketSensingRefreshDateP, {months: i - lookbackMonths});
    const endDateP = dfns.add(startDateP, {months: 2});
    const refreshDateP = dfns.add(startDateP, {months: -lag});
    const refreshDate = dfns.format(refreshDateP, DB_DATE_FORMAT);

    const startDate = dfns.format(startDateP, UI_DATE_FORMAT)
    const endDate = dfns.format(endDateP, UI_DATE_FORMAT)

    const relevantResultExtract = _.find(queryResult, v => {
      return _.get(v, `[${_.get(headerIndexes, 'as_on')}]`) === refreshDate
        && _.get(v, `[${_.get(headerIndexes, 'model')}]`) === lagToModelNameMapping[lag]
        && _.get(v, `[${_.get(headerIndexes, 'category')}]`) === category
        && _.get(v, `[${_.get(headerIndexes, 'splits')}]`) === splitDbVal
    });
    const indexOfMsGrowth = valueOrQuantity === BY_VALUE ? _.get(headerIndexes, 'ms_growth_by_val') : _.get(headerIndexes, 'ms_growth_by_qty')
    const indexOfClientGrowth = valueOrQuantity === BY_VALUE ? _.get(headerIndexes, 'original_client_forecast_by_val') : _.get(headerIndexes, 'original_client_forecast_by_qty')
    const indexOfActualGrowth = valueOrQuantity === BY_VALUE ? _.get(headerIndexes, 'actual_growth_by_val') : _.get(headerIndexes, 'actual_growth_by_qty')
    const msForecastGrwoth = _.get(relevantResultExtract, `[${indexOfMsGrowth}]`);
    const internalForecastGrowth = _.get(relevantResultExtract, `[${indexOfClientGrowth}]`);
    const actualGrowth = _.get(relevantResultExtract, `[${indexOfActualGrowth}]`);
    result[`${startDate} - ${endDate}`] = {
      msForecastGrwoth: sanitizeNumeric(msForecastGrwoth),
      internalForecastGrowth: sanitizeNumeric(internalForecastGrowth),
      actualGrowth: sanitizeNumeric(actualGrowth),
    }
  }
  return result;
}

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDate = _.get(event, "marketSensingRefreshDate");
    const category = _.get(event, "category") === ALL_MARK ? ALL : _.get(event, "category");
    const customer = _.get(event, "customer") === ALL_MARK ? ALL : _.get(event, "customer");
    const splitDbVal = `${customer}___ALL___ALL`;
    const valueOrQuantity = _.get(event, "valueORvolume");
    const lag = _.get(event, "lag");

    const marketSensingRefreshDateP = dfns.parse(marketSensingRefreshDate, DB_DATE_FORMAT, new Date());

    let requiredHistoricalAsOnValues = [];
    for (let j = 1; j <= numberOfHistoricPeriods; j++){
      requiredHistoricalAsOnValues.push(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -j + 3 -(lag - 1)}), DB_DATE_FORMAT))
    }
    const asOnDateInCaluseString = requiredHistoricalAsOnValues.map(v => `'${v}'`).join(",");
    QUERY = `
      select * from growth_rollup
      where as_on IN (${asOnDateInCaluseString})
      and category = '${category}'
      and splits = '${splitDbVal}'
      and model = '${lagToModelNameMapping[lag]}'
    `
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    const headerIndexes = _.reduce(_.get(queryResult, "headers", []), (acc, v, i)=>{
      acc[v] = i;
      return acc;
    }, {});

    const result = formatResultForDashboard(_.get(queryResult, "data", []), marketSensingRefreshDateP, category, customer, valueOrQuantity, lag, headerIndexes);
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': result,
      'query': QUERY,
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
