import _ from "lodash";
import dfns from "date-fns";
import getClientGrowthQuery, {
  getForecastGrowthFigureName,
  getActualGrowthFigureName,
  getAdjForecastGrowthFigureName
} from "./getClientGrowthQuery.mjs";
import getMarketSensingGrowthQuery, {
  getPredictedGrowthFigureName,
  getKeyDemandDriverFeatureFigureName,
  getKeyDemandDriverFeatureImportanceFigureName
} from "./getMarketSensingGrowthQuery.mjs";
import getPyMs, {getSubQueryFigureName} from "./getPyMs.mjs";
import getImpliedMs, {getSubQueryFigureName as getImpliedSubQueryFigureName} from "./getImpliedMs.mjs";
import {numberOfHistoricPeriods} from "./constants.mjs";

export default function (refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView = false){
  let QUERY = "";

  const marketSensingQueryParts = getMarketSensingGrowthQuery(refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView);

  const clientDataQueryParts = getClientGrowthQuery(refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView);

  const pyMarketShareParts = getPyMs(refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView);

  const ImpliedMarketShareParts = getImpliedMs(refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView);

  QUERY = `
    WITH
      ${marketSensingQueryParts.combinedWithQuery},
      ${clientDataQueryParts.combinedWithQuery},
      ${pyMarketShareParts.combinedWithQuery}
    SELECT
      ${marketSensingQueryParts.combinedSelect},
      ${clientDataQueryParts.combinedSelect},
      ${pyMarketShareParts.combinedSelect},
      ${ImpliedMarketShareParts.combinedSelect}
    FROM
      ${marketSensingQueryParts.combinedFrom},
      ${clientDataQueryParts.combinedFrom},
      ${pyMarketShareParts.combinedFrom};
  `

  return QUERY;
}

const getFromResult = (rawResult, headerName, isNumber = true) => {
  const dataIndex = _.indexOf(_.get(rawResult, "headers"), headerName);
  let val = _.get(rawResult, `data[0][${dataIndex}]`);
  if (isNumber){
    const isNaN = _.isNaN(_.toNumber(val));
    if (isNaN) return null;
    return _.toNumber(val) ?? 0
  }
  return val;
}

export const formatResult = (rawResult, refreshDate, periodConfig, isFixedQuarterView = false) => {
  const UI_DATE_FORMAT = "MMM yy"
  const getPeriodLabel = (month1Add, month2Add) =>{
    return `${dfns.format(dfns.add(refreshDate, {months: month1Add}), UI_DATE_FORMAT)} - ${dfns.format(dfns.add(refreshDate, {months: month2Add}), UI_DATE_FORMAT)}`
  }
  const periods = periodConfig.map(v => {
    return getPeriodLabel(v.lag, v.lag + 2)
  });

  const result = [];
  _.forEach(periods, (v, i) => {
    const keyDemandDriverFeatures = _.split(getFromResult(rawResult, `${getKeyDemandDriverFeatureFigureName(periodConfig[i].ms_model)}`, false), "||");
    const keyDemandDriverFeaturesImportance = _.split(getFromResult(rawResult, `${getKeyDemandDriverFeatureImportanceFigureName(periodConfig[i].ms_model)}`, false), "||");


    const historicProjectionsData = [];
    for (let j = 1; j <= numberOfHistoricPeriods; j++){
      let historicIndex = j;
      if (isFixedQuarterView){
        historicIndex = j * 3;
      }
      historicProjectionsData.push({
        "period": getPeriodLabel(-historicIndex - 2, -historicIndex),
        "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(periodConfig[i].lag, periodConfig[i].ms_model, historicIndex)}`),
        "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(periodConfig[i].lag, historicIndex)}`),
        "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(periodConfig[i].lag, historicIndex)}`),
        "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(periodConfig[i].lag, historicIndex)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(periodConfig[i].lag, historicIndex)}`)
          ? null
          : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(periodConfig[i].lag, historicIndex)}`)
      })
    }
    result.push({
      [v]: {
        metrics: {
          marketSensingGrowth: getFromResult(rawResult, `${getPredictedGrowthFigureName(periodConfig[i].lag, periodConfig[i].ms_model, 0)}`),
          jdaGrowth: getFromResult(rawResult, `${getForecastGrowthFigureName(periodConfig[i].lag, 0)}`),
          pyGrowth: getFromResult(rawResult, `${getSubQueryFigureName(periodConfig[i].lag)}`),
          impliedGrowth: getFromResult(rawResult, `${getImpliedSubQueryFigureName(periodConfig[i].lag)}`),
          "keyDemandDrivers": _.map(keyDemandDriverFeatures, (feature, index) => ({[feature]: _.toNumber(keyDemandDriverFeaturesImportance[index])})),
          "historical": _.reverse(historicProjectionsData)
        },
        "horizon": `${(3*i)+1}_${(3*i)+3}m`
      }
    })
  });
  return result;
}
