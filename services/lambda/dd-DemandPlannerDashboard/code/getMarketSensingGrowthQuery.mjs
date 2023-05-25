import _ from "lodash";
import dfns from "date-fns";
import {removeTrailingComma, removeEmptyLines, escapeSqlSingleQuote} from "/opt/utils.mjs";
import {numberOfHistoricPeriods} from "./constants.mjs";

const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const ALL_OPTION = "*";
const DB_DATE_FORMAT = "yyyy-MM-dd";

export const getPredictedSubQueryName = (lag, periodIndex) => `T_MS_${lag}_${lag + 2}LagPrediction_${periodIndex}`;
export const getYagoPredictedSubQueryName = (lag, periodIndex) => `T_MS_${lag}_${lag + 2}LagYagoPrediction_${periodIndex}`;
export const getPredictedSubQueryMetricName = (lag, periodIndex) => `Prediction${lag}_${lag + 2}m_${periodIndex}`;
export const getYagoPredictedSubQueryMetricName = (lag, periodIndex) => `yagoPrediction${lag}_${lag + 2}m_${periodIndex}`;
export const getPredictedGrowthFigureName = (lag, model, periodIndex) => `MS_R3mPredictedGrowth${lag}_${lag + 2}_${model}_${periodIndex}`;
export const getKeyDemandDriverQueryName = (model) => `keyDemandDrivers_${model}`;
export const getKeyDemandDriverFeatureMetricName = (model) => `keyDemandDrivers_${model}_feature_name`;
export const getKeyDemandDriverFeatureImportanceMetricName = (model) => `keyDemandDrivers_${model}_importance_name`;
export const getKeyDemandDriverFeatureFigureName = (model) => `keyDemandDrivers_${model}_feature`;
export const getKeyDemandDriverFeatureImportanceFigureName = (model) => `keyDemandDrivers_${model}_importance`;

const baseQueryOneCustomerByValue = (dtYStart, msTimeHorizon, metricName,  isYago = false, customersP, categoriesP) => `
        SELECT  SUM(${isYago ? 'actual_allocated_volume_share' : 'allocated_predicted_monthly_volume'}) AS ${metricName}
        FROM    market_sensing
        WHERE   dt_y_start = '${dtYStart}'
                ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                ${customersP ? `AND split1_final IN (${customersP})` : ''}
                ${categoriesP ? `AND category IN (${categoriesP})` : ''}
      `;
const baseQueryOneCustomerByQuantity = (dtYStart, msTimeHorizon, metricName,  isYago = false, customersP, categoriesP) => `
        SELECT      SUM(${isYago ? 'actual_allocated_volume_share' : 'allocated_predicted_monthly_volume'})/AVG(pbc.retail_price) AS ${metricName}
        FROM        market_sensing AS msd
        INNER JOIN  client_price_per_unit AS pbc
        ON          msd.category = pbc.category
                    AND msd.dt_y = pbc.date
                    AND msd.split1 = pbc.retailer
        WHERE       dt_y_start = '${dtYStart}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customersP ? `AND msd.split1_final IN (${customersP})` : ''}
                    ${categoriesP ? `AND msd.category IN (${categoriesP})` : ''}
      `;
const baseQueryMultiCustomerByValue = (dtYStart, msTimeHorizon, metricName,  isYago = false, customersP, categoriesP) => `
        SELECT      avg(cast(predicted_growth as double) * 100) AS ${metricName}
        FROM        market_sensing
        WHERE       dt_y_start = '${dtYStart}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customersP ? `AND split1_final IN (${customersP})` : ''}
                    ${categoriesP ? `AND category IN (${categoriesP})` : ''}
      `;
const baseQueryMultiCustomerByQuantity = (dtYStart, msTimeHorizon, metricName, isYago = false, customersP, categoriesP) => `
        SELECT      AVG(${isYago ? 'actual_volume' : 'predicted_volume'})/AVG(pac.retail_price) AS ${metricName}
        FROM        market_sensing AS msd
        INNER JOIN  client_price_per_unit AS pac
        ON          msd.category = pac.category
                    AND msd.dt_y = pac.date
        WHERE       msd.dt_y_start = '${dtYStart}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customersP ? `AND msd.split1_final IN (${customersP})` : ''}
                    ${categoriesP ? `AND msd.category IN (${categoriesP})` : ''}
      `;

export default function (refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView = false) {
  const isMultiCustomer = (_.isArray(customers) && _.size(customers) > 1) || _.get(customers, "[0]") === ALL_OPTION;

  const customersP = _.get(customers, "[0]") === ALL_OPTION ? null : _.join(_.map(customers, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",")
  const categoriesP = _.get(categories, "[0]") === ALL_OPTION ? null : _.join(_.map(categories, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",")



  const getCombinedQuery = () => {
    let combinedWithQuery = "";
    let combinedSelect = "";
    let combinedFrom = ""

    const growthDerivedByCalcPath = (refreshDate, lagConfig, periodIndex, baseQueryFun, predictedGrowthFigureName) => {
      const predictedSubQueryName = getPredictedSubQueryName(lagConfig.lag, periodIndex);
      const yagoPredictedSubQueryName = getYagoPredictedSubQueryName(lagConfig.lag, periodIndex);

      const predictedSubQueryMetricName = getPredictedSubQueryMetricName(lagConfig.lag, periodIndex);
      const yagoPredictedSubQueryMetricName = getYagoPredictedSubQueryMetricName(lagConfig.lag, periodIndex);

      let dtYStart, dtYStartYago, dtYStartP;
      if (periodIndex === 0){
        dtYStartP = dfns.add(refreshDate, {months: lagConfig.lag})
      } else {
        dtYStartP = dfns.add(refreshDate, {months: 1-periodIndex})
      }
      dtYStart = dfns.format(dtYStartP, DB_DATE_FORMAT)
      dtYStartYago = dfns.format(dfns.add(dtYStartP, {years: -1}), DB_DATE_FORMAT)
      if (baseQueryFun){
        combinedWithQuery += `${predictedSubQueryName} AS (
            ${baseQueryFun(
          dtYStart,
          `${lagConfig.lag}_${lagConfig.lag + 2}m`,
          predictedSubQueryMetricName,
          false
        )
        }
            ),`;
        combinedWithQuery += `${yagoPredictedSubQueryName} AS (
            ${baseQueryFun(
          dtYStartYago,
          `${lagConfig.lag}_${lagConfig.lag + 2}m`,
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

    const growthDerivedDirectlyPath = (refreshDate, lagConfig, periodIndex, baseQueryFun, predictedGrowthFigureName)=>{
      const predictedSubQueryName = getPredictedSubQueryName(lagConfig.lag, periodIndex);
      const predictedSubQueryMetricName = getPredictedSubQueryMetricName(lagConfig.lag, periodIndex);

      let dtYStart;
      if (periodIndex === 0){
        dtYStart = dfns.format(dfns.add(refreshDate, {months: lagConfig.lag}), DB_DATE_FORMAT)
      } else {
        dtYStart = dfns.format(dfns.add(refreshDate, {months: 1-periodIndex}), DB_DATE_FORMAT)
      }
      combinedWithQuery += `${predictedSubQueryName} AS (
              ${baseQueryFun(
        dtYStart,
        `${lagConfig.lag}_${lagConfig.lag + 2}m`,
        predictedSubQueryMetricName,
        false
      )}
          ),`;
      combinedSelect += `ROUND(${predictedSubQueryMetricName}, 2) AS ${predictedGrowthFigureName},
        `;

      combinedFrom += `${predictedSubQueryName},
        `;
    }

    const keyDemandDriversQuery = (modelName) => {
      const queryName = getKeyDemandDriverQueryName(modelName);
      const featureMetricName = getKeyDemandDriverFeatureMetricName(modelName);
      const featureImportanceMetricName = getKeyDemandDriverFeatureImportanceMetricName(modelName);
      const featureFigureName = getKeyDemandDriverFeatureFigureName(modelName);
      const featureImportanceFigureName = getKeyDemandDriverFeatureImportanceFigureName(modelName);

      // Skip if already added for the model
      if (combinedWithQuery.includes(queryName)) return;

      // Else
      combinedWithQuery += `${queryName} AS (
            WITH t1 AS (
              SELECT      variable_treatment.category                AS fname,
                          ROUND(Sum(key_demand_drivers.feature_importance) * 100, 2) AS imp
              FROM        key_demand_drivers
              LEFT JOIN   variable_treatment
              ON          key_demand_drivers.feature_name = variable_treatment.columns
              WHERE       key_demand_drivers.horizon = '${modelName}'
              AND         key_demand_drivers.date = '${dfns.format(refreshDateP, DB_DATE_FORMAT)}'
              ${categoriesP ? `AND key_demand_drivers.category IN (${categoriesP})` : ''}
              GROUP  BY   variable_treatment.category
              ORDER  BY   imp DESC
            )
            SELECT      Array_join(Array_agg(fname), '||') AS ${featureMetricName},
                        Array_join(Array_agg(imp), '||')   AS ${featureImportanceMetricName}
            FROM   t1 
          ),`;
      combinedSelect += `${queryName}.${featureMetricName} AS ${featureFigureName},
      ${queryName}.${featureImportanceMetricName} AS ${featureImportanceFigureName},`;

      combinedFrom += `${queryName},`;
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

      _.forEach(periodConfig, v => {
        for (let i = 0; i <= numberOfHistoricPeriods; i++) {
          let historicIndex = i;
          if (isFixedQuarterView){
            historicIndex = i * 3;
          }
          const predictedGrowthFigureName = getPredictedGrowthFigureName(v.lag, v.ms_model, historicIndex);
          queryPath(refreshDateP, v, historicIndex, baseQueryFun, predictedGrowthFigureName)
        }
        // Add Key Demand Drivers Query
        keyDemandDriversQuery(v.ms_model);
      })
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
