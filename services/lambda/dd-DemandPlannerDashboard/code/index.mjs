import _ from "lodash";
import dfns from 'date-fns';
import ServicesConnector from "/opt/ServicesConnector.mjs";
import { numberOfHistoricPeriods, growthRollupIdx } from "./constants.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);
const ALL = "ALL";
const ALL_MARK = "*";
const UI_DATE_FORMAT = "MMM yy"
const DB_DATE_FORMAT = 'yyyy-MM-dd'
const BY_VALUE = "BY_VALUE";

const getPeriodLabel = (asOnDateP, month1Add, month2Add) =>{
  const month1UiDateFormat = dfns.format(dfns.add(asOnDateP, {months: month1Add}), UI_DATE_FORMAT);
  const month2UiDateFormat = dfns.format(dfns.add(asOnDateP, {months: month2Add}), UI_DATE_FORMAT);
  if (month2Add) {
    return `${month1UiDateFormat} - ${month2UiDateFormat}`;
  }
  return month1UiDateFormat;
}

const sanitizeNumeric = (val)=>{
  const number = _.toNumber(val);
  if ( (!(val === 0) && !_.trim(val)) || _.isNaN(number) || _.isFinite(number) === false || _.isNumber(number) === false){
    return null;
  }
  return number;
}

const formatResultForDashboard = (queryResult, asOnDateP, valueOrQuantity, availableMsModel, isFixedQuarterView, isMonthlyMode)=>{
  const asOnDate = dfns.format(asOnDateP, DB_DATE_FORMAT);

  const result = [];
  _.forEach(availableMsModel, (msModel, i) => {
    const msHorizonN = _.replace(msModel, 'm', '');
    const [lagStart, lagEnd] = _.split(msHorizonN, '_');
    const periodLabel = getPeriodLabel(asOnDateP, lagStart, lagEnd);

    const historicProjectionsData = [];

    if (!isMonthlyMode){
      for (let j = 1; j <= numberOfHistoricPeriods; j++){
        let historicIndex = j;
        if (isFixedQuarterView){
          historicIndex = (j - 1) * 3;
        }

        const computedAsOnDate = dfns.format(dfns.add(asOnDateP, {months: -historicIndex-2 - lagStart}), DB_DATE_FORMAT);
        let queryResultExtract = _.find(queryResult, v => {
          return v[growthRollupIdx.as_on] === computedAsOnDate && v[growthRollupIdx.model] === msModel
        })
        historicProjectionsData.push({
          "period": getPeriodLabel(asOnDateP, -historicIndex-2, -historicIndex),
          "Market Sensing": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.ms_growth_by_val : growthRollupIdx.ms_growth_by_qty}]`)),
          "Internal": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.original_client_forecast_by_val : growthRollupIdx.original_client_forecast_by_qty}]`)),
          "Actual": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.actual_growth_by_val : growthRollupIdx.actual_growth_by_qty}]`)),
          "Adjusted": sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.adj_client_forecast_by_val : growthRollupIdx.adj_client_forecast_by_qty}]`)),
        });
      }
    }

    let queryResultExtract = _.find(queryResult, v => {
      return v[growthRollupIdx.as_on] === asOnDate && v[growthRollupIdx.model] === msModel
    })
    let keyDemandDriverData = [];
    try {
      keyDemandDriverData = JSON.parse(_.get(queryResultExtract, `[${growthRollupIdx.key_demand_drivers}]`))
    } catch (e){}
    result.push({
      [periodLabel]: {
        metrics: {
          marketSensingGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.ms_growth_by_val : growthRollupIdx.ms_growth_by_qty}]`)),
          "confMarketSensingValues": {
            msGrowthByValueConfLower: _.get(queryResultExtract, `[${growthRollupIdx.msGrowthByValueConfLower}]`),
            msGrowthByValueConfUpper: _.get(queryResultExtract, `[${growthRollupIdx.msGrowthByValueConfUpper}]`),
            msGrowthByQuantityConfLower: _.get(queryResultExtract, `[${growthRollupIdx.msGrowthByQuantityConfLower}]`),
            msGrowthByQuantityConfUpper: _.get(queryResultExtract, `[${growthRollupIdx.msGrowthByQuantityConfUpper}]`),
          },
          jdaGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.original_client_forecast_by_val : growthRollupIdx.original_client_forecast_by_qty}]`)),
          pyGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${growthRollupIdx.actual_market_share_pct}]`)),
          impliedGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? growthRollupIdx.implied_market_share_pct_by_val : growthRollupIdx.implied_market_share_pct_by_qty}]`)),
          keyDemandDrivers: _.map(keyDemandDriverData, d => {
            return {
              [d.feature]: d.importance
            }
          }),
          historical: _.reverse(historicProjectionsData),
        },
        "horizon": msModel
      }
    })
  });
  return result;
}

const SPLIT_SEP = "^%";
const SPLIT_NAME_OPT_SEP = "_._";
const SPLIT_OPTIONS_SEP = "___";
const MS_HORIZON_SEP = "___"

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);

    console.log(event);
    const marketSensingRefreshDate = _.get(event, "marketSensingRefreshDate");
    const category = _.get(event, "categories");
    const availableMsModels = _.split(_.get(event, "msModels"), MS_HORIZON_SEP);
    const splits = _.get(event, "splits");
    const splitStringArray = _.reduce(_.split(splits, SPLIT_SEP), (acc, v)=>{
      const [splitName, optionsString] = _.split(v, SPLIT_NAME_OPT_SEP);
      const optionsSelected = _.split(optionsString, SPLIT_OPTIONS_SEP);
      const newAcc = [];
      _.forEach(acc, j => {
        _.forEach(optionsSelected, k => {
          if (k === ALL_MARK){
            k = ALL
          }
          const toPush = _.isEmpty(j) ? `${k}` : `${j}___${k}`
          newAcc.push(toPush)
        })
      })
      return newAcc;
    }, [""]);

    const splitStringArrayForQuery = _.reduce(splitStringArray, (acc, v, i) => {
      v = _.replace(v, "'", "''");
      acc = `${acc}${i === 0 ? "" : ","}'${v}'`;
      return acc;
    }, "")

    const valueOrQuantity = _.get(event, "valueORvolume");
    const isFixedQuarterView = _.get(event, "isFixed", false);
    const isMonthlyMode = _.get(event, "isMonthlyMode") === 'true' || _.get(event, "isMonthlyMode") === true;

    const marketSensingRefreshDateP = dfns.parse(marketSensingRefreshDate, DB_DATE_FORMAT, new Date());

    let requiredHistoricalAsOnValues = new Set();
    if (isMonthlyMode === false){
      for (let j = 1; j <= numberOfHistoricPeriods; j++){
        _.forEach(availableMsModels, msHorizon =>{
          const horizonLagEnd = _.get(_.split(msHorizon, '_'), '[1]');
          if (horizonLagEnd){
            const horizonLagEndVal = _.toNumber(_.replace(horizonLagEnd, 'm', ''));
            requiredHistoricalAsOnValues.add(dfns.format(dfns.add(marketSensingRefreshDateP, {months: -(j + horizonLagEndVal)}), DB_DATE_FORMAT));
          }
        });
      }
    }

    requiredHistoricalAsOnValues = Array.from(requiredHistoricalAsOnValues);
    const asOnDateInCaluseString = [marketSensingRefreshDate, ...requiredHistoricalAsOnValues].map(v => `'${v}'`).join(",");
    QUERY = `
            SELECT * FROM growth_rollup
            WHERE as_on IN  (${asOnDateInCaluseString})
            AND category = '${category === ALL_MARK ? ALL : category}'
            AND splits IN (${splitStringArrayForQuery})
        `;

    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': {
        result: formatResultForDashboard(_.get(queryResult, "data", []), marketSensingRefreshDateP, valueOrQuantity, availableMsModels, isFixedQuarterView, isMonthlyMode),
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
