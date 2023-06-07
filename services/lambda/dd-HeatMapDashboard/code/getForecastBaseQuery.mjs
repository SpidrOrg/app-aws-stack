import _ from "lodash";
import {escapeSqlSingleQuote} from "/opt/utils.mjs";
import dfns from "date-fns";

const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const DB_DATE_FORMAT = "yyyy-MM-dd";
const ALL_OPTION = "*";

const VIEW_TYPES = {
  R3M: "r3m",
  FIXED: "fixed"
}

const lagToModelByViewTypeMapping = {
  [VIEW_TYPES.R3M]: {
    1: "1-3 Months",
    4: "4-6 Months",
    7: "1-3 Months",
    10: "4-6 Months",
  },
  [VIEW_TYPES.FIXED]: {
    1: "1-3 Months",
    4: "4-6 Months",
    7: "1-3 Months",
    10: "4-6 Months",
  }
}

const lagToHorizonByViewTypeMapping = {
  [VIEW_TYPES.R3M]: {
    1: "JDA_lag1-3",
    4: "JDA_lag4-6",
    7: "JDA_lag1-3",
    10: "JDA_lag4-6",
  },
  [VIEW_TYPES.FIXED]: {
    1: "JDA_lag1-3",
    4: "JDA_lag4-6",
    7: "JDA_lag1-3",
    10: "JDA_lag4-6",
  }
}

const getClientForecastSubQuery = (asOnDate, customerP, categoryP, valueOrQuantity, lag, viewType) => {
  const clientModel = lagToModelByViewTypeMapping[viewType][lag];
  const clientTimeHorizon = lagToHorizonByViewTypeMapping[viewType][lag];

  const fStartDate = dfns.format(dfns.add(asOnDate, {months: lag}), DB_DATE_FORMAT);
  const fLastDate = dfns.format(dfns.add(asOnDate, {months: lag + 2}), DB_DATE_FORMAT);

  let aggregateColumnName;
  if (valueOrQuantity === BY_VALUE) {
    aggregateColumnName = "demand forecast (gsv)"
  }
  if (valueOrQuantity === BY_QUANTITY) {
    aggregateColumnName = "demand forecast (qty)"
  }

  return `
      SELECT    Sum("${aggregateColumnName}") AS forecast
      FROM      t_client_forecast ${customerP === ALL_OPTION ? "" : ", t_retailers"}
      WHERE     t_client_forecast.model = '${clientModel}'
      AND       t_client_forecast.comparison_version = '${clientTimeHorizon}'
      AND       Cast(t_client_forecast.forecast_start_dt AS DATE) >= Cast('${fStartDate}' AS DATE)
      AND       Cast(t_client_forecast.forecast_end_dt AS   DATE) <= Cast('${fLastDate}' AS DATE)
      ${customerP === ALL_OPTION ? "" : `AND       t_client_forecast.retailer IN (t_retailers.split1)`}
      AND       t_client_forecast.category = '${categoryP}'
    `
}

const getJdaActualSubQuery = (asOnDate, customerP, categoryP, valueOrQuantity, lag, viewType) => {
  const aStartDate = dfns.format(dfns.add(asOnDate, {months: lag, years: -1}), DB_DATE_FORMAT);
  const aLastDate = dfns.format(dfns.add(asOnDate, {months: lag + 2, years: -1}), DB_DATE_FORMAT);

  let aggregateColumnName;
  if (valueOrQuantity === BY_VALUE) {
    aggregateColumnName = "net_gsv"
  }
  if (valueOrQuantity === BY_QUANTITY) {
    aggregateColumnName = "net_qty"
  }
  return `
      SELECT    Sum("${aggregateColumnName}") AS actual
      FROM      client_actual ${customerP === ALL_OPTION ? "" : ", t_retailers"}
      WHERE     Cast(client_actual.date AS DATE) >= Cast('${aStartDate}' AS DATE)
      AND       Cast(client_actual.date AS   DATE) <= Cast('${aLastDate}' AS DATE)
      ${customerP === ALL_OPTION ? "" : `AND       client_actual.retailer IN (t_retailers.split1)`}
      AND       client_actual.category = '${categoryP}'
    `
}

export default function(refreshDateP, customer, category, valueOrQuantity, lag, forecastPeriodType = VIEW_TYPES.R3M){
  const customerP = _.trim(escapeSqlSingleQuote(customer))
  const categoryP = _.trim(escapeSqlSingleQuote(category))

  const QUERY = `
    WITH t_client_forecast AS (
        SELECT * FROM (
             SELECT   *,
                      Rank() OVER (
                        partition BY    category, dt_of_forecast_making, forecast_start_dt, forecast_end_dt, model, retailer
                        ORDER BY        CAST(ts AS DATE) ASC
                      ) AS rank
             FROM client_forecast
           )
        WHERE rank = 1
    ) ${customerP === ALL_OPTION ? '' : `,
      t_retailers AS (
         SELECT   split1
         FROM     market_sensing
         WHERE    split1_final = '${customerP}'
      )
     `
    }
    SELECT  ROUND(((forecast / actual - 1) * 100), 2)
    FROM (
        ${getClientForecastSubQuery(refreshDateP, customerP, categoryP, valueOrQuantity, lag, forecastPeriodType)}
    ), (
        ${getJdaActualSubQuery(refreshDateP, customerP, categoryP, valueOrQuantity, lag, forecastPeriodType)}
    )
  `

  return QUERY
}
// //
// const q1 = abc(new Date(2023, 1, 1),  'Amazon.com', 'htas', BY_VALUE, 1);
// // const quer = `with ${q1.combinedWithQuery} select ${q1.combinedSelect} from ${q1.combinedFrom}`
// console.log(q1);
