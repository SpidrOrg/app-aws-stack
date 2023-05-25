import dfns from "date-fns";
import _ from "lodash";
import {removeTrailingComma, removeEmptyLines} from "/opt/utils.mjs";
import {getSubQueryName, getMetricScaledownTotalMonthlyMarketSizeName, getMetricMonthlyPosSalesName} from "./getPyMs.mjs";
import {getForecastSubQueryMetricName, getActualYagoSubQueryMetricName} from "./getClientGrowthQuery.mjs";
import {getPredictedSubQueryMetricName, getYagoPredictedSubQueryMetricName} from "./getMarketSensingGrowthQuery.mjs";

const ALL_OPTION = "*";
const DB_DATE_FORMAT = "yyyy-MM-dd";
const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";

export const getSubQueryFigureName = (lag)  => `Implied_${lag}_${lag+2}MarketShareGrowth`

export default function(refreshDateP, customers, categories, valueOrQuantity, periodConfig){
  const isMultiCustomer = (_.isArray(customers) && _.size(customers) > 1) || _.get(customers, "[0]") === ALL_OPTION;

  const getCombinedQuery = ()=> {
    let combinedWithQuery = "";
    let combinedSelect = "";
    let combinedFrom = "";

    _.forEach(periodConfig, v => {
      const subQueryFigureName = getSubQueryFigureName(v.lag);
      const kk = `${getSubQueryName(v.lag)}.${getMetricMonthlyPosSalesName(v.lag)}`;
      const ll = `${getSubQueryName(v.lag)}.${getMetricScaledownTotalMonthlyMarketSizeName(v.lag)}`
      const jj = `ROUND(((${getForecastSubQueryMetricName(v.lag, 0)} / ${getActualYagoSubQueryMetricName(v.lag, 0)} - 1) * 100), 2)`;
      let mm;

      if (!isMultiCustomer || (isMultiCustomer && valueOrQuantity === BY_QUANTITY)) {
        mm = `ROUND(((${getPredictedSubQueryMetricName(v.lag, 0)} / ${getYagoPredictedSubQueryMetricName(v.lag, 0)} - 1) * 100), 2)`;
      } else if (isMultiCustomer && valueOrQuantity === BY_VALUE) {
        mm = `ROUND(${getPredictedSubQueryMetricName(v.lag, 0)}, 2)`;
      }
      // (((T1.monthlyPosSales * (1 + ${jdaPredictedGrowth[0]})) / (T1.scaleddownTotalMonthlyMarketSize * (1 + ${marketSensingPredictedGrowth[0]}))) * 100)
      combinedSelect += `ROUND((((${kk} * (1 + ${jj})) / (${ll} * (1 + ${mm}))) * 100),2) AS ${subQueryFigureName},`
    });

    // Remove trailing comma
    combinedWithQuery = removeTrailingComma(combinedWithQuery);
    combinedSelect = removeTrailingComma(combinedSelect);
    combinedFrom = removeTrailingComma(combinedFrom);

    // Compress Query
    [combinedWithQuery, combinedSelect, combinedFrom] = _.reduce([combinedWithQuery, combinedSelect, combinedFrom], (acc, query, i) => {
      const compressedQuery = removeEmptyLines(query)
      _.set(acc, `[${i}]`, compressedQuery);
      return acc;
    }, [])

    return {combinedWithQuery, combinedSelect, combinedFrom};
  };

  const {combinedWithQuery, combinedSelect, combinedFrom} = getCombinedQuery();

  return {combinedWithQuery, combinedSelect, combinedFrom}
}
