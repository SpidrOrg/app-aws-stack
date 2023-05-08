import _ from "lodash";
import dfns from "date-fns";
import getClientGrowthQuery, {
  periodConfig as cgPeriodConfig,
  getForecastGrowthFigureName,
  getActualGrowthFigureName,
  getAdjForecastGrowthFigureName
} from "./getClientGrowthQuery.mjs";
import getMarketSensingGrowthQuery1, {
  periodConfig as msPeriodConfig,
  getPredictedGrowthFigureName,
  getKeyDemandDriverFeatureFigureName,
  getKeyDemandDriverFeatureImportanceFigureName
} from "./getMarketSensingGrowthQuery1.mjs";
import getPyMs, {periodConfig as pyPeriodConfig, getSubQueryFigureName} from "./getPyMs.mjs";
import getImpliedMs, {periodConfig as impliedPeriodConfig, getSubQueryFigureName as getImpliedSubQueryFigureName} from "./getImpliedMs.mjs";

export default function (refreshDateP, customers, categories, valueOrQuantity){
  let QUERY = "";

  const marketSensingQueryParts = getMarketSensingGrowthQuery1(refreshDateP, customers, categories, valueOrQuantity);

  const clientDataQueryParts = getClientGrowthQuery(refreshDateP, customers, categories, valueOrQuantity);

  const pyMarketShareParts = getPyMs(refreshDateP, customers, categories, valueOrQuantity);

  const ImpliedMarketShareParts = getImpliedMs(refreshDateP, customers, categories, valueOrQuantity);

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

export const formatResult = (rawResult, refreshDate) => {
  const UI_DATE_FORMAT = "MMM yy"
  const getPeriodLabel = (month1Add, month2Add) =>{
    return `${dfns.format(dfns.add(refreshDate, {months: month1Add}), UI_DATE_FORMAT)} - ${dfns.format(dfns.add(refreshDate, {months: month2Add}), UI_DATE_FORMAT)}`
  }
  const periods = [
    getPeriodLabel(1, 3),
    getPeriodLabel(4, 6),
    getPeriodLabel(7, 9),
    getPeriodLabel(10, 12)
  ];
  const result = [];
  _.forEach(periods, (v, i) => {
    const keyDemandDriverFeatures = _.split(getFromResult(rawResult, `${getKeyDemandDriverFeatureFigureName(msPeriodConfig[i].model)}`, false), "||");
    const keyDemandDriverFeaturesImportance = _.split(getFromResult(rawResult, `${getKeyDemandDriverFeatureImportanceFigureName(msPeriodConfig[i].model)}`, false), "||");

    result.push({
      [v]: {
        metrics: {
          marketSensingGrowth: getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 0)}`),
          jdaGrowth: getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 0)}`),
          pyGrowth: getFromResult(rawResult, `${getSubQueryFigureName(pyPeriodConfig[i].lag)}`),
          impliedGrowth: getFromResult(rawResult, `${getImpliedSubQueryFigureName(impliedPeriodConfig[i].lag)}`),
          "keyDemandDrivers": _.map(keyDemandDriverFeatures, (feature, index) => ({[feature]: _.toNumber(keyDemandDriverFeaturesImportance[index])})),
          "historical": [{
            "period": getPeriodLabel(-8, -6),
            "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 6)}`),
            "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 6)}`),
            "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(cgPeriodConfig[i].lag, 6)}`),
            "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 6)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 6)}`)
              ? null
              : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 6)}`)
          },{
            "period": getPeriodLabel(-7, -5),
            "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 5)}`),
            "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 5)}`),
            "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(cgPeriodConfig[i].lag, 5)}`),
            "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 5)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 5)}`)
              ? null
              : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 5)}`)
          },{
            "period": getPeriodLabel(-6, -4),
            "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 4)}`),
            "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 4)}`),
            "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(cgPeriodConfig[i].lag, 4)}`),
            "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 4)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 4)}`)
              ? null
              : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 4)}`)
          },{
            "period": getPeriodLabel(-5, -3),
            "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 3)}`),
            "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 3)}`),
            "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(cgPeriodConfig[i].lag, 3)}`),
            "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 3)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 3)}`)
              ? 0
              : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 3)}`)
          },{
            "period": getPeriodLabel(-4, -2),
            "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 2)}`),
            "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 2)}`),
            "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(cgPeriodConfig[i].lag, 2)}`),
            "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 2)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 2)}`)
              ? null
              : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 2)}`)
          },{
            "period": getPeriodLabel(-3, -1),
            "Market Sensing": getFromResult(rawResult, `${getPredictedGrowthFigureName(msPeriodConfig[i].lag, msPeriodConfig[i].model, 1)}`),
            "Internal": getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 1)}`),
            "Actual": getFromResult(rawResult, `${getActualGrowthFigureName(cgPeriodConfig[i].lag, 1)}`),
            "Adjusted": getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 1)}`) === getFromResult(rawResult, `${getForecastGrowthFigureName(cgPeriodConfig[i].lag, 1)}`)
              ? null
              : getFromResult(rawResult, `${getAdjForecastGrowthFigureName(cgPeriodConfig[i].lag, 1)}`)
          }]
        },
        "horizon": `${(3*i)+1}_${(3*i)+3}m`
      }
    })
  });
  return result;
}
