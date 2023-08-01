import _ from "lodash";
import dfns from 'date-fns';
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {getPeriodConfig, numberOfHistoricPeriods} from "./constants.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);
const ALL = "ALL";
const ALL_MARK = "*";
const UI_DATE_FORMAT = "MMM yy"
const DB_DATE_FORMAT = 'yyyy-MM-dd'
const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";

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

const formatResultForDashboard = (queryResult, asOnDateP, valueOrQuantity, isFixedQuarterView)=>{
  const asOnDate = dfns.format(asOnDateP, DB_DATE_FORMAT);
  const periodConfig = getPeriodConfig().default;
  const periods = periodConfig.map(v => {
    return getPeriodLabel(asOnDateP, v.lag, v.lag + 2)
  });
  const result = [];
  _.forEach(periods, (v, i) => {
    const model = periodConfig[i].ms_model;
    const lag = periodConfig[i].lag;

    const historicProjectionsData = [];
    for (let j = 1; j <= numberOfHistoricPeriods; j++){
      let historicIndex = j;
      if (isFixedQuarterView){
        historicIndex = (j - 1) * 3;
      }

      const computedAsOnDate = dfns.format(dfns.add(asOnDateP, {months: -historicIndex-2 - lag}), DB_DATE_FORMAT);
      let queryResultExtract = _.find(queryResult, v => {
        return v[0] === computedAsOnDate && v[1] === model
      })
      historicProjectionsData.push({
        "period": getPeriodLabel(asOnDateP, -historicIndex-2, -historicIndex),
        "Market Sensing": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 6 : 7}]`)),
        "Internal": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 8 : 9}]`)),
        "Actual": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 12 : 13}]`)),
        "Adjusted": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 10 : 11}]`)),
      })
    }
    let queryResultExtract = _.find(queryResult, v => {
      return v[0] === asOnDate && v[1] === model
    })
    let keyDemandDriverData = [];
    try {
      keyDemandDriverData = JSON.parse(_.get(queryResultExtract, `[22]`))
    } catch (e){}
    result.push({
      [v]: {
        metrics: {
          marketSensingGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 6 : 7}]`)),
          jdaGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 8 : 9}]`)),
          pyGrowth: sanitizeNumeric(_.get(queryResultExtract, `[14]`)),
          impliedGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 15 : 16}]`)),
          keyDemandDrivers: _.map(keyDemandDriverData, d => {
            return {
              [d.feature]: d.importance
            }
          }),
          historical: _.reverse(historicProjectionsData),
        },
        "horizon": `${(3*i)+1}_${(3*i)+3}m`
      }
    })
  });
  return result;
}

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDate = _.get(event, "marketSensingRefreshDate");
    const category = _.get(event, "categories");
    const customer = _.get(event, "customers");
    const valueOrQuantity = _.get(event, "valueORvolume");
    const isFixedQuarterView = _.get(event, "isFixed", false);

    const marketSensingRefreshDateP = dfns.parse(marketSensingRefreshDate, DB_DATE_FORMAT, new Date());

    let requiredHistoricalAsOnValues = new Set();
    for (let j = 1; j <= numberOfHistoricPeriods; j++){
      // 1_3m
      requiredHistoricalAsOnValues.add(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -(j + 3)}), DB_DATE_FORMAT));
      // 4_6m
      requiredHistoricalAsOnValues.add(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -(j + 3 + 3)}), DB_DATE_FORMAT));
      // 7_9m
      requiredHistoricalAsOnValues.add(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -(j + 6 + 3)}), DB_DATE_FORMAT));
      // 10_12m
      requiredHistoricalAsOnValues.add(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -(j + 9 + 3)}), DB_DATE_FORMAT));
      // // 13_15m
      // requiredHistoricalAsOnValues.add(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -(j + 12 + 3)}), DB_DATE_FORMAT));
    }
    requiredHistoricalAsOnValues = Array.from(requiredHistoricalAsOnValues);
    const asOnDateInCaluseString = [marketSensingRefreshDate, ...requiredHistoricalAsOnValues].map(v => `'${v}'`).join(",");
    QUERY = `
      select * from growth_rollup
      where as_on IN (${asOnDateInCaluseString})
      and category = '${category === ALL_MARK ? ALL : category}'
      and retailer = '${customer === ALL_MARK ? ALL : customer}'
    `
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': {
        result: formatResultForDashboard(_.get(queryResult, "data", []), marketSensingRefreshDateP, valueOrQuantity, isFixedQuarterView),
        'query': QUERY,
      }
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
