import _ from "lodash";
import dfns from "date-fns";
import getClientGrowthQuery, {
  getForecastSubQueryMetricName,
  getActualSubQueryMetricName,
  getForecastForwardSubQueryMetricName,
  getForecastGrowthFigureName,
  getForecastForwardGrowthFigureName,
  getActualGrowthFigureName
} from "./getClientGrowthQuery.mjs";
import getMarketSensingGrowthQuery, {getPredictedGrowthFigureName} from "./getMarketSensingGrowthQuery.mjs"
import {getMultiplierAndUnit} from "/opt/utils.mjs";

export default function (refreshDateP, customers, categories, msTimeHorizon, model, valueOrQuantity){
  let QUERY = "";

  const clientDataQueryParts = getClientGrowthQuery(refreshDateP, customers, categories, msTimeHorizon, model, valueOrQuantity);
  const marketSensingQueryParts = getMarketSensingGrowthQuery(refreshDateP, customers, categories, msTimeHorizon, valueOrQuantity);

  QUERY = `
    WITH
      ${marketSensingQueryParts.combinedWithQuery},
      ${clientDataQueryParts.combinedWithQuery}
    SELECT
      ${marketSensingQueryParts.combinedSelect},
      ${clientDataQueryParts.combinedSelect}
    FROM
      ${marketSensingQueryParts.combinedFrom},
      ${clientDataQueryParts.combinedFrom};
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
  const getPeriodLabel = (periodIndex) =>{
    return `${dfns.format(dfns.add(refreshDate, {months: periodIndex}), UI_DATE_FORMAT)} - ${dfns.format(dfns.add(refreshDate, {months: periodIndex + 1}), UI_DATE_FORMAT)}`
  }

  const historicalPeriod = 12;
  const result = {};

  for (let i = -historicalPeriod; i <= historicalPeriod; i++) {
    result[getPeriodLabel(i)] = {
      forecastSales: i <= 0 ? getFromResult(rawResult, `${getForecastSubQueryMetricName(Math.abs(i))}`) : getFromResult(rawResult, `${getForecastForwardSubQueryMetricName(i-1)}`),
      forecastGrowth: i <= 0 ? getFromResult(rawResult, `${getForecastGrowthFigureName(Math.abs(i))}`) : getFromResult(rawResult, `${getForecastForwardGrowthFigureName(i-1)}`),
      actualSales: i <= 0 ? getFromResult(rawResult, `${getActualSubQueryMetricName(Math.abs(i))}`) : "",
      actualGrowth: i <= 0 ? getFromResult(rawResult, `${getActualGrowthFigureName(Math.abs(i))}`) : "",
      msProjectedGrowth: getFromResult(rawResult, `${getPredictedGrowthFigureName(i)}`),
    }
    // result[getPeriodLabel(i+1)] = {
    //   forecastSales: getFromResult(rawResult, `${getForecastForwardSubQueryMetricName(i)}`),
    //   forecastGrowth: getFromResult(rawResult, `${getForecastForwardGrowthFigureName(i)}`),
    //   actualSales: "",
    //   actualGrowth: "",
    //   msProjectedGrowth: "",
    // }
  }

  // millify forcast sales and actual sales numbers

  // find Max
  const allForecastSalesFigures = _.map(_.values(result), v => _.toNumber(v["forecastSales"]));
  const allActualSalesFigures = _.map(_.values(result), v => _.toNumber(v["actualSales"]));
  const maxValue = _.max([...allForecastSalesFigures, ...allActualSalesFigures]);
  const {multiplier, unit} = getMultiplierAndUnit(maxValue);

  _.forOwn(result, (v, k)=>{
    result[k]['forecastSales'] = _.round(_.divide(_.toNumber(result[k]['forecastSales']), multiplier), 2);
    result[k]['actualSales'] = _.round(_.divide(_.toNumber(result[k]['actualSales']), multiplier), 2);
  })

  return {
    data: result,
    unit: unit
  };
}

//
// const queryResult =  {
//   headers: [
//     'forecast_0',
//     'CF_R3mForecastGrowth_0',
//     'forecast_forward_0',
//     'CF_R3mForecastForwardGrowth_0',
//     'actual_0',
//     'CF_R3mActualGrowth_0',
//     'forecast_1',
//     'CF_R3mForecastGrowth_1',
//     'forecast_forward_1',
//     'CF_R3mForecastForwardGrowth_1',
//     'actual_1',
//     'CF_R3mActualGrowth_1',
//     'forecast_2',
//     'CF_R3mForecastGrowth_2',
//     'forecast_forward_2',
//     'CF_R3mForecastForwardGrowth_2',
//     'actual_2',
//     'CF_R3mActualGrowth_2',
//     'forecast_3',
//     'CF_R3mForecastGrowth_3',
//     'forecast_forward_3',
//     'CF_R3mForecastForwardGrowth_3',
//     'actual_3',
//     'CF_R3mActualGrowth_3',
//     'forecast_4',
//     'CF_R3mForecastGrowth_4',
//     'forecast_forward_4',
//     'CF_R3mForecastForwardGrowth_4',
//     'actual_4',
//     'CF_R3mActualGrowth_4',
//     'forecast_5',
//     'CF_R3mForecastGrowth_5',
//     'forecast_forward_5',
//     'CF_R3mForecastForwardGrowth_5',
//     'actual_5',
//     'CF_R3mActualGrowth_5',
//     'forecast_6',
//     'CF_R3mForecastGrowth_6',
//     'forecast_forward_6',
//     'CF_R3mForecastForwardGrowth_6',
//     'actual_6',
//     'CF_R3mActualGrowth_6',
//     'forecast_7',
//     'CF_R3mForecastGrowth_7',
//     'forecast_forward_7',
//     'CF_R3mForecastForwardGrowth_7',
//     'actual_7',
//     'CF_R3mActualGrowth_7',
//     'forecast_8',
//     'CF_R3mForecastGrowth_8',
//     'forecast_forward_8',
//     'CF_R3mForecastForwardGrowth_8',
//     'actual_8',
//     'CF_R3mActualGrowth_8',
//     'forecast_9',
//     'CF_R3mForecastGrowth_9',
//     'forecast_forward_9',
//     'CF_R3mForecastForwardGrowth_9',
//     'actual_9',
//     'CF_R3mActualGrowth_9',
//     'forecast_10',
//     'CF_R3mForecastGrowth_10',
//     'forecast_forward_10',
//     'CF_R3mForecastForwardGrowth_10',
//     'actual_10',
//     'CF_R3mActualGrowth_10',
//     'forecast_11',
//     'CF_R3mForecastGrowth_11',
//     'forecast_forward_11',
//     'CF_R3mForecastForwardGrowth_11',
//     'actual_11',
//     'CF_R3mActualGrowth_11',
//     'forecast_12',
//     'CF_R3mForecastGrowth_12',
//     'forecast_forward_12',
//     'CF_R3mForecastForwardGrowth_12',
//     'actual_12',
//     'CF_R3mActualGrowth_12'
//   ],
//     data: [
//     [
//       '4.2182146017939997E9', '29.46',                '4.145131833793E9',
//       '20.39',                '4.842855204214002E9',  '48.63',
//       '4.439264771369E9',     '25.9',                 '4.72373777365E9',
//       '29.1',                 '4.2937683481740007E9', '21.77',
//       '4.026067258528E9',     '8.46',                 '5.126776760333E9',
//       '44.4',                 '4.247504722280001E9',  '14.42',
//       '4.0214592920080004E9', '-3.19',                '5.133835236086E9',
//       '46.72',                '4.494651170997001E9',  '8.2',
//       '3.5813209955650005E9', '-25.78',               '4.2072093295570006E9',
//       '24.52',                '5.594274506706999E9',  '15.93',
//       '4.0036910804690003E9', '-16.99',               '4.233601847184E9',
//       '-12.33',               '5.269250338950998E9',  '9.25',
//       '3.9176809758760004E9', '-10.83',               '4.2435476899240007E9',
//       '-19.47',               '4.828882743376998E9',  '9.91',
//       undefined,              undefined,              '3.7732360689839997E9',
//       '-32.55',               '3.378640594737E9',     '0.97',
//       undefined,              undefined,              '3.7078688887E8',
//       '-91.75',               '3.498983966353E9',     '12.28',
//       undefined,              undefined,              undefined,
//       undefined,              '3.55043430969E9',      '8.1',
//       undefined,              undefined,              undefined,
//       undefined,              '3.6588939034184012E9', '12.29',
//       undefined,              undefined,              undefined,
//       undefined,              '3.443187252492601E9',  '1.54',
//       undefined,              undefined,              undefined,
//       undefined,              '3.2582933684576E9',    '-1.9'
//     ]
//   ]
// }
//
// const fr = formatResult(queryResult, dfns.parse('2023-01-01', "yyyy-MM-dd", new Date()))
//
// console.log(fr)
