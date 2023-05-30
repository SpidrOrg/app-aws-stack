import _ from "lodash";
import dfns from "date-fns";
import {removeTrailingComma, removeEmptyLines, escapeSqlSingleQuote} from "/opt/utils.mjs";

const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const ALL_OPTION = "*";
const DB_DATE_FORMAT = "yyyy-MM-dd";

export const getPredictedSubQueryName = (periodIndex) => `T_MS_${periodIndex}`.replaceAll('-', '_minus_');
export const getYagoPredictedSubQueryName = (periodIndex) => `T_MS_YAGO_${periodIndex}`.replaceAll('-', '_minus_');
export const getPredictedSubQueryMetricName = (periodIndex) => `Prediction_${periodIndex}`.replaceAll('-', '_minus_');
export const getYagoPredictedSubQueryMetricName = (periodIndex) => `yagoPrediction_${periodIndex}`.replaceAll('-', '_minus_');
export const getPredictedGrowthFigureName = (periodIndex) => `MS_R3mPredictedGrowth_${periodIndex}`.replaceAll('-', '_minus_');

const baseQueryOneCustomerByValue = (dateP, msTimeHorizon, metricName, isYago = false, customersP, categoriesP) => `
        SELECT  SUM(${isYago ? 'actual_allocated_volume_share' : 'allocated_predicted_monthly_volume'}) AS ${metricName}
        FROM    market_sensing
        WHERE   dt_y_start = '${dfns.format(dateP, DB_DATE_FORMAT)}'
                ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                ${customersP ? `AND split1_final IN (${customersP})` : ''}
                ${categoriesP ? `AND category IN (${categoriesP})` : ''}
      `;
const baseQueryOneCustomerByQuantity = (dateP, msTimeHorizon, metricName, isYago = false, customersP, categoriesP) => `
        SELECT      SUM(${isYago ? 'actual_allocated_volume_share' : 'allocated_predicted_monthly_volume'})/AVG(pbc.retail_price) AS ${metricName}
        FROM        market_sensing AS msd
        INNER JOIN  client_price_per_unit AS pbc
        ON          msd.category = pbc.category
                    AND msd.dt_y = pbc.date
                    AND msd.split1 = pbc.retailer
        WHERE       dt_y_start = '${dfns.format(dateP, DB_DATE_FORMAT)}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customersP ? `AND msd.split1_final IN (${customersP})` : ''}
                    ${categoriesP ? `AND msd.category IN (${categoriesP})` : ''}
      `;
const baseQueryMultiCustomerByValue = (dateP, msTimeHorizon, metricName, isYago = false, customersP, categoriesP) => `
        SELECT      avg(cast(predicted_growth as double) * 100) AS ${metricName}
        FROM        market_sensing
        WHERE       dt_y_start = '${dfns.format(dateP, DB_DATE_FORMAT)}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customersP ? `AND split1_final IN (${customersP})` : ''}
                    ${categoriesP ? `AND category IN (${categoriesP})` : ''}
      `;
const baseQueryMultiCustomerByQuantity = (dateP, msTimeHorizon, metricName, isYago = false, customersP, categoriesP) => `
        SELECT      AVG(${isYago ? 'actual_volume' : 'predicted_volume'})/AVG(pac.retail_price) AS ${metricName}
        FROM        market_sensing AS msd
        INNER JOIN  client_price_per_unit AS pac
        ON          msd.category = pac.category
                    AND msd.dt_y = pac.date
        WHERE       msd.dt_y_start = '${dfns.format(dateP, DB_DATE_FORMAT)}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customersP ? `AND msd.split1_final IN (${customersP})` : ''}
                    ${categoriesP ? `AND msd.category IN (${categoriesP})` : ''}
      `;

export default function(refreshDateP, customers, categories, msTimeHorizon, valueOrQuantity) {
  const isMultiCustomer = (_.isArray(customers) && _.size(customers) > 1) || _.get(customers, "[0]") === ALL_OPTION;

  const customersP = _.get(customers, "[0]") === ALL_OPTION ? null : _.join(_.map(customers, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",")
  const categoriesP = _.get(categories, "[0]") === ALL_OPTION ? null : _.join(_.map(categories, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",")

  const getCombinedQuery = () => {
    let combinedWithQuery = "";
    let combinedSelect = "";
    let combinedFrom = ""
    const historicalPeriod = 12;

    const growthDerivedByCalcPath = (refreshDate, periodIndex, baseQueryFun, predictedGrowthFigureName) => {
      const predictedSubQueryName = getPredictedSubQueryName(periodIndex);
      const yagoPredictedSubQueryName = getYagoPredictedSubQueryName(periodIndex);

      const predictedSubQueryMetricName = getPredictedSubQueryMetricName(periodIndex);
      const yagoPredictedSubQueryMetricName = getYagoPredictedSubQueryMetricName(periodIndex);

      if (baseQueryFun){
        combinedWithQuery += `${predictedSubQueryName} AS (
            ${baseQueryFun(
          dfns.add(refreshDate, {months: periodIndex}),
          msTimeHorizon,
          predictedSubQueryMetricName,
          false
        )
        }
            ),`;
        combinedWithQuery += `${yagoPredictedSubQueryName} AS (
            ${baseQueryFun(
          dfns.add(refreshDate, {months: periodIndex, years: -1}),
          msTimeHorizon,
          yagoPredictedSubQueryMetricName,
          true
        )
        }
            ),`;

        combinedSelect += `ROUND(((${predictedSubQueryMetricName} / ${yagoPredictedSubQueryMetricName} - 1) * 100), 2) AS ${predictedGrowthFigureName},
        `;

        combinedFrom += `${predictedSubQueryName},${yagoPredictedSubQueryName},
        `;
      }
    }

    const growthDerivedDirectlyPath = (refreshDate, periodIndex, baseQueryFun, predictedGrowthFigureName)=>{
      const predictedSubQueryName = getPredictedSubQueryName(periodIndex);
      const predictedSubQueryMetricName = getPredictedSubQueryMetricName(periodIndex);
      combinedWithQuery += `${predictedSubQueryName} AS (
              ${baseQueryFun(
        dfns.add(refreshDate, {months: periodIndex}),
        msTimeHorizon,
        predictedSubQueryMetricName,
        false
      )}
          ),`;
      combinedSelect += `ROUND(${predictedSubQueryMetricName}, 2) AS ${predictedGrowthFigureName},
        `;

      combinedFrom += `${predictedSubQueryName},
        `;
    }

    let baseQueryFun = null;
    if (!isMultiCustomer) {
      if (valueOrQuantity === BY_VALUE) {
        baseQueryFun = baseQueryOneCustomerByValue;
      } else if (valueOrQuantity === BY_QUANTITY) {
        baseQueryFun = baseQueryOneCustomerByQuantity;
      }
    } else if (isMultiCustomer) {
      if (valueOrQuantity === BY_VALUE) {
        baseQueryFun = baseQueryMultiCustomerByValue;
      } else if (valueOrQuantity === BY_QUANTITY) {
        baseQueryFun = baseQueryMultiCustomerByQuantity;
      }
    }

    let queryPath = null;
    if (!isMultiCustomer || (isMultiCustomer && valueOrQuantity === BY_QUANTITY)) {
      queryPath = growthDerivedByCalcPath;
    } else if (isMultiCustomer && valueOrQuantity === BY_VALUE) {
      queryPath = growthDerivedDirectlyPath;
    }

    if (baseQueryFun && queryPath) {
      baseQueryFun = _.curryRight(baseQueryFun)(customersP, categoriesP);

      for (let i = -historicalPeriod; i <= historicalPeriod; i++) {
        const predictedGrowthFigureName = getPredictedGrowthFigureName(i);
        queryPath(refreshDateP, i, baseQueryFun, predictedGrowthFigureName)
      }
    }

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
  }

  const {combinedWithQuery, combinedSelect, combinedFrom} = getCombinedQuery();

  return {combinedWithQuery, combinedSelect, combinedFrom}
}

// refreshDateP, customers, categories, msTimeHorizon, valueOrQuantity
// const q1 = abc(new Date(2023, 1, 1),  ['Harbor Freight Tools'], ['htas'], "1_3m", "htas_1_3m", BY_QUANTITY);
// const quer = `with ${q1.combinedWithQuery} select ${q1.combinedSelect} from ${q1.combinedFrom}`
// console.log(quer);
// const q1 = abc(new Date(2023, 2, 1), ALL_OPTION, ALL_OPTION, BY_VALUE);
// const q2 = abc(new Date(2023, 2, 1), ALL_OPTION, ALL_OPTION, BY_QUANTITY);
// const q3 = abc(new Date(2023, 2, 1), ['Harbor Freight Tools'], ALL_OPTION, BY_VALUE);
// const q4 = abc(new Date(2023, 2, 1), ['Harbor Freight Tools'], ALL_OPTION, BY_QUANTITY);
// const q5 = abc(new Date(2023, 2, 1), ALL_OPTION, ['htas'], BY_VALUE);
// const q6 = abc(new Date(2023, 2, 1), ALL_OPTION, ['htas'], BY_QUANTITY);
// const q7 = abc(new Date(2023, 2, 1), ['Harbor Freight Tools'], ['htas'], BY_VALUE);
// const q8 = abc(new Date(2023, 2, 1), ['Harbor Freight Tools'], ['htas'], BY_QUANTITY);
//
// console.log(q1, q2, q3, q4, q5, q6, q7, q8)
