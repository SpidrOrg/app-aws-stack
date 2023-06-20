import dfns from "date-fns";
import _ from "lodash";
import {removeEmptyLines, removeTrailingComma, escapeSqlSingleQuote} from "/opt/utils.mjs";
import {numberOfHistoricPeriods} from "./constants.mjs";

const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const ALL_OPTION = "*";
const DB_DATE_FORMAT = "yyyy-MM-dd";

export const getForecastSubQueryName = () => `t_client_forecast`;
export const getAdjustedForecastSubQueryName = () => `t_client_forecast_adj`;
export const getActualSubQueryName = () => `t_client_actual`;
export const getForecastSubQueryMetricName = (lag, periodIndex) => `forecast${lag}_${lag+2}m_${periodIndex}`;
export const getAdjustedForecastSubQueryMetricName = (lag, periodIndex) => `adjustedForecast${lag}_${lag+2}m_${periodIndex}`;
export const getActualYagoSubQueryMetricName = (lag, periodIndex) => `yagoActual${lag}_${lag+2}m_${periodIndex}`;
export const getActualSubQueryMetricName = (lag, periodIndex) => `actual${lag}_${lag+2}m_${periodIndex}`;
export const getForecastGrowthFigureName = (lag, periodIndex) => `CF_R3mForecastGrowth${lag}_${lag+2}m_${periodIndex}`;
export const getAdjForecastGrowthFigureName = (lag, periodIndex) => `CF_R3mAdjForecastGrowth${lag}_${lag+2}m_${periodIndex}`;
export const getActualGrowthFigureName = (lag, periodIndex) => `CF_R3mActualGrowth${lag}_${lag+2}m_${periodIndex}`;

export default function(refreshDateP, customers, categories, valueOrQuantity, periodConfig, isFixedQuarterView = false) {
  const customersP = _.get(customers, "[0]") === ALL_OPTION ? null : _.join(_.map(customers, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",");
  const categoriesP = _.get(categories, "[0]") === ALL_OPTION ? null : _.join(_.map(categories, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",");
  const computedDate = (date, lagConfig) => `${dfns.format(dfns.add(date, lagConfig), DB_DATE_FORMAT)}`

  const getClientForecastSubQuery = (asOnDate, periodIndex, model, lag, metricName, isForForecastAdjusted) => {
    let fStartDate, fLastDate;
    if (periodIndex === 0){
      fStartDate = computedDate(asOnDate, {months: lag});
      fLastDate = computedDate(asOnDate, {months: lag + 2});
    } else {
      fStartDate = computedDate(asOnDate, {months: -periodIndex-2});
      fLastDate = computedDate(asOnDate, {months: -periodIndex});
    }

    let aggregateColumnName;
    if (valueOrQuantity === BY_VALUE) {
      aggregateColumnName = "demand forecast (gsv)"
    }
    if (valueOrQuantity === BY_QUANTITY) {
      aggregateColumnName = "demand forecast (qty)"
    }

    const t_client_forecast_table = isForForecastAdjusted ? getAdjustedForecastSubQueryName() : getForecastSubQueryName();

    return `(
      SELECT    Sum("${aggregateColumnName}") AS ${metricName}
      FROM      ${t_client_forecast_table} ${customersP ? ', t_retailers' : ''}
      WHERE     ${t_client_forecast_table}.model = '${model}'
      AND       Cast(${t_client_forecast_table}.forecast_start_dt AS DATE) >= Cast('${fStartDate}' AS DATE)
      AND       Cast(${t_client_forecast_table}.forecast_end_dt AS   DATE) <= Cast('${fLastDate}' AS DATE)
      ${customersP ?
      `AND       ${t_client_forecast_table}.retailer IN ( t_retailers.split1 )` : ''
    }
      ${categoriesP ?
      `AND       ${t_client_forecast_table}.category IN (${categoriesP})` : ''
    }
    ),
    `
  }

  const getClientActualSubQuery = (asOnDate, periodIndex, lag, metricName, yago) => {
    let aStartDate, aLastDate;
    if (periodIndex === 0){
      aStartDate = computedDate(asOnDate, {months: lag - (yago ? 12 : 0)});
      aLastDate = computedDate(asOnDate, {months: lag - (yago ? 12 : 0) + 2});
    } else {
      aStartDate = computedDate(asOnDate, {months: -periodIndex -2 - (yago ? 12 : 0)});
      aLastDate = computedDate(asOnDate, {months: -periodIndex - (yago ? 12 : 0)});
    }

    let aggregateColumnName;
    if (valueOrQuantity === BY_VALUE) {
      aggregateColumnName = "net_gsv"
    }
    if (valueOrQuantity === BY_QUANTITY) {
      aggregateColumnName = "net_qty"
    }
    const t_client_actual_table = getActualSubQueryName();
    return `(
      SELECT    Sum("${aggregateColumnName}") AS ${metricName}
      FROM      ${t_client_actual_table} ${customersP ? ', t_retailers' : ''}
      WHERE     Cast(${t_client_actual_table}.date AS DATE) >= Cast('${aStartDate}' AS DATE)
      AND       Cast(${t_client_actual_table}.date AS   DATE) <= Cast('${aLastDate}' AS DATE)
      ${customersP ?
      `AND       ${t_client_actual_table}.retailer IN ( t_retailers.split1 )` : ''
    }
      ${categoriesP ?
      `AND       ${t_client_actual_table}.category IN (${categoriesP})` : ''
    }
    ),
    `
  }

  const getCombinedQuery = ()=> {
    const forecastSubQueryName = getForecastSubQueryName();
    const adjustedForecastSubQueryName = getAdjustedForecastSubQueryName();
    const actualSubQueryName = getActualSubQueryName();

    let combinedWithQuery = `
        ${forecastSubQueryName} AS (
           SELECT * FROM (
             SELECT   *,
                      Rank() OVER (
                        partition BY    category, dt_of_forecast_making, forecast_start_dt, forecast_end_dt, model, retailer
                        ORDER BY        CAST(ts AS DATE) ASC
                      ) AS rank
             FROM client_forecast
           ) WHERE rank = 1
           
        ),
        ${adjustedForecastSubQueryName} AS (
           SELECT * FROM (
             SELECT   *,
                      Rank() OVER (
                        partition BY    category, dt_of_forecast_making, forecast_start_dt, forecast_end_dt, model, retailer
                        ORDER BY        CAST(ts AS DATE) DESC
                      ) AS rank
             FROM client_forecast
           ) WHERE rank = 1
        ),
        ${actualSubQueryName} AS (
            SELECT   *
            FROM client_actual
        ),
        t_retailers AS (
           SELECT   split1
           FROM     market_sensing
           WHERE    split1_final IN (${customersP})
        ),
    `;
    let combinedSelect = "";
    let combinedFrom = ""
    _.forEach(periodConfig, v => {
      for(let i = 0; i <= numberOfHistoricPeriods; i++){
        let historicIndex = i;
        if (isFixedQuarterView){
          historicIndex = i * 3;
        }
        const forecastSubQueryMetricName = getForecastSubQueryMetricName(v.lag, historicIndex);
        const adjustedForecastSubQueryMetricName = getAdjustedForecastSubQueryMetricName(v.lag, historicIndex);
        const actualYagoSubQueryMetricName = getActualYagoSubQueryMetricName(v.lag, historicIndex);
        const actualSubQueryMetricName = getActualSubQueryMetricName(v.lag, historicIndex);

        const forecastGrowthFigureName = getForecastGrowthFigureName(v.lag, historicIndex);
        const adjForecastGrowthFigureName = getAdjForecastGrowthFigureName(v.lag, historicIndex);
        const actualGrowthFigureName = getActualGrowthFigureName(v.lag, historicIndex);


        combinedSelect += `ROUND(((${forecastSubQueryMetricName} / ${actualYagoSubQueryMetricName} - 1) * 100), 2) AS ${forecastGrowthFigureName},
        ROUND(((${adjustedForecastSubQueryMetricName} / ${actualYagoSubQueryMetricName} - 1) * 100), 2) AS ${adjForecastGrowthFigureName},
        ROUND(((${actualSubQueryMetricName} / ${actualYagoSubQueryMetricName} - 1) * 100), 2) AS ${actualGrowthFigureName},
        `;

        combinedFrom += `
          ${
          getClientForecastSubQuery(
            refreshDateP,
            historicIndex,
            v.client_model,
            v.lag,
            forecastSubQueryMetricName,
            false
          )
        }
        `;

        combinedFrom += `
          ${
          getClientForecastSubQuery(
            refreshDateP,
            historicIndex,
            v.client_model,
            v.lag,
            adjustedForecastSubQueryMetricName,
            true
          )
        }
        `;

        combinedFrom += `
          ${
          getClientActualSubQuery(
            refreshDateP,
            historicIndex,
            v.lag,
            actualSubQueryMetricName,
            false
          )
        }
        `;

        combinedFrom += `
          ${
          getClientActualSubQuery(
            refreshDateP,
            historicIndex,
            v.lag,
            actualYagoSubQueryMetricName,
            true
          )
        }
        `;
      }
    })

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
//
// const q1 = abc(new Date(2023, 2, 1), ['Harbor Freight Tools'], ['htas'], BY_QUANTITY);
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
