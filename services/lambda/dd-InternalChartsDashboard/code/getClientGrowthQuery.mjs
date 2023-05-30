import dfns from "date-fns";
import _ from "lodash";
import {removeEmptyLines, removeTrailingComma, escapeSqlSingleQuote} from "/opt/utils.mjs";

const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const ALL_OPTION = "*";
const DB_DATE_FORMAT = "yyyy-MM-dd";
// export const periodConfig = [{
//   lag: 1,
//   model: "1-3 Months"
// }, {
//   lag: 4,
//   model: "4-6 Months"
// }, {
//   lag: 7,
//   model: "1-3 Months"
// }, {
//   lag: 10,
//   model: "4-6 Months"
// }];
export const getForecastSubQueryName = () => `t_client_forecast`;
export const getActualSubQueryName = () => `t_client_actual`;
export const getForecastSubQueryMetricName = (periodIndex) => `forecast_${periodIndex}`;
export const getForecastForwardSubQueryMetricName = (periodIndex) => `forecast_forward_${periodIndex}`;
export const getActualYagoSubQueryMetricName = (periodIndex) => `yagoActual_${periodIndex}`;
export const getActualForwardYagoSubQueryMetricName = (periodIndex) => `yagoForwardActual_${periodIndex}`;
export const getActualSubQueryMetricName = (periodIndex) => `actual_${periodIndex}`;
export const getForecastGrowthFigureName = (periodIndex) => `CF_R3mForecastGrowth_${periodIndex}`;
export const getForecastForwardGrowthFigureName = (periodIndex) => `CF_R3mForecastForwardGrowth_${periodIndex}`;
export const getActualGrowthFigureName = (periodIndex) => `CF_R3mActualGrowth_${periodIndex}`;

const monthToAddFromTimeHorizon = (msTimeHorizon)=>{
  const s1 = msTimeHorizon.replaceAll("m", "");
  const s2 = _.split(s1, "_");
  if (_.size(s2) === 1){
    return 1
  }
  if (_.size(s2) === 2){
    return _.subtract(_.toNumber(_.get(s2, '[1]')), _.toNumber(_.get(s2, '[0]')))
  }
  return 1
}

export default function (refreshDateP, customers, categories, msTimeHorizon, model, valueOrQuantity) {
  const customersP = _.get(customers, "[0]") === ALL_OPTION ? null : _.join(_.map(customers, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",");
  const categoriesP = _.get(categories, "[0]") === ALL_OPTION ? null : _.join(_.map(categories, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",");
  const computedDate = (date, lagConfig) => `${dfns.format(dfns.add(date, lagConfig), DB_DATE_FORMAT)}`
  const monthToAdd = monthToAddFromTimeHorizon(msTimeHorizon);

  const getClientForecastSubQuery = (asOnDate, model, horizon, metricName) => {
    const fStartDate = computedDate(asOnDate, {});
    const fLastDate = computedDate(asOnDate, {months: monthToAdd});

    let aggregateColumnName;
    if (valueOrQuantity === BY_VALUE) {
      aggregateColumnName = "demand forecast (gsv)"
    }
    if (valueOrQuantity === BY_QUANTITY) {
      aggregateColumnName = "demand forecast (qty)"
    }

    const t_client_forecast_table = getForecastSubQueryName();

    return `(
      SELECT    Sum("${aggregateColumnName}") AS ${metricName}
      FROM      ${t_client_forecast_table}${customersP ? ', t_retailers' : ''}
      WHERE     ${t_client_forecast_table}.model = '${model}'
      AND       ${t_client_forecast_table}.time_horizon_mapping = '${msTimeHorizon}'
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

  const getJdaActualSubQuery = (asOnDate, metricName, yago) => {
    const aStartDate = computedDate(asOnDate, {months: (yago ? -12 : 0)});
    const aLastDate = computedDate(asOnDate, {months: (yago ? -12 : 0) + monthToAdd});

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
        ${actualSubQueryName} AS (
            SELECT   *
            FROM client_actual
        ),
        t_retailers AS (
           SELECT   distinct(split1)
           FROM     market_sensing
           WHERE    split1_final IN (${customersP})
        ),
    `;
    let combinedSelect = "";
    let combinedFrom = ""
    const historicalPeriod = 12;
    for(let i = 0; i <= historicalPeriod; i++){
      const forecastSubQueryMetricName = getForecastSubQueryMetricName(i);
      const forecastForwardSubQueryMetricName = getForecastForwardSubQueryMetricName(i);
      const actualYagoSubQueryMetricName = getActualYagoSubQueryMetricName(i);
      const actualForwardYagoSubQueryMetricName = getActualForwardYagoSubQueryMetricName(i);
      const actualSubQueryMetricName = getActualSubQueryMetricName(i);

      const forecastGrowthFigureName = getForecastGrowthFigureName(i);
      const forecastForwardGrowthFigureName = getForecastForwardGrowthFigureName(i);
      const actualGrowthFigureName = getActualGrowthFigureName(i);


      combinedSelect += `${forecastSubQueryMetricName}, ROUND(((${forecastSubQueryMetricName} / ${actualYagoSubQueryMetricName} - 1) * 100), 2) AS ${forecastGrowthFigureName},
        ${forecastForwardSubQueryMetricName}, ROUND(((${forecastForwardSubQueryMetricName} / ${actualForwardYagoSubQueryMetricName} - 1) * 100), 2) AS ${forecastForwardGrowthFigureName},
        ${actualSubQueryMetricName}, ROUND(((${actualSubQueryMetricName} / ${actualYagoSubQueryMetricName} - 1) * 100), 2) AS ${actualGrowthFigureName},
        `;

      combinedFrom += `
          ${
        getClientForecastSubQuery(
          dfns.add(refreshDateP, {months: -i}),
          model,
          msTimeHorizon,
          forecastSubQueryMetricName
        )
      }
        `;
      combinedFrom += `
          ${
        getClientForecastSubQuery(
          dfns.add(refreshDateP, {months: i+1}),
          model,
          msTimeHorizon,
          forecastForwardSubQueryMetricName
        )
      }
        `;

      combinedFrom += `
          ${
        getJdaActualSubQuery(
          dfns.add(refreshDateP, {months: -i}),
          actualSubQueryMetricName,
          false
        )
      }
        `;

      combinedFrom += `
          ${
        getJdaActualSubQuery(
          dfns.add(refreshDateP, {months: -i}),
          actualYagoSubQueryMetricName,
          true
        )
      }
        `;

      combinedFrom += `
          ${
        getJdaActualSubQuery(
          dfns.add(refreshDateP, {months: i+1}),
          actualForwardYagoSubQueryMetricName,
          true
        )
      }
        `;
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
  };

  const {combinedWithQuery, combinedSelect, combinedFrom} = getCombinedQuery();

  return {combinedWithQuery, combinedSelect, combinedFrom}
}
// refreshDateP, categories, customers, msTimeHorizon, model, valueOrQuantity
// const q1 = abc(new Date(2023, 1, 1),  ALL_OPTION, ALL_OPTION, "1_3m", "htas_1_3m", BY_QUANTITY);
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
