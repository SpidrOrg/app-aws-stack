import _ from "lodash";
import dfns from "date-fns";
import {escapeSqlSingleQuote} from "/opt/utils.mjs";

const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";
const ALL_OPTION = "*";
const DB_DATE_FORMAT = "yyyy-MM-dd";

const VIEW_TYPES = {
  R3M: "r3m",
  FIXED: "fixed"
}

const lagToHorizonByViewTypeMapping = {
  [VIEW_TYPES.R3M]: {
    1: "1_3m",
    4: "4_6m",
    7: "7_9m",
    10: "10_12m",
  },
  [VIEW_TYPES.FIXED]: {
    1: "1_3m",
    4: "4_6m",
    7: "7_9m",
    10: "10_12m",
  }
}


const baseQueryOneCustomerByValue = (dtYStart, msTimeHorizon, isYago = false, customerP, categoryP) => `
        SELECT  SUM(${isYago ? 'actual_allocated_volume_share' : 'allocated_predicted_monthly_volume'}) AS val
        FROM    market_sensing
        WHERE   dt_y_start = '${dtYStart}'
                ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                ${customerP === ALL_OPTION ? '' : `AND split1 = '${customerP}'`}
                ${categoryP ? `AND category = '${categoryP}'` : ''}
      `;
const baseQueryOneCustomerByQuantity = (dtYStart, msTimeHorizon, isYago = false, customerP, categoryP) => `
        SELECT      SUM(${isYago ? 'actual_allocated_volume_share' : 'allocated_predicted_monthly_volume'})/AVG(retail_price) AS val
        FROM        market_sensing AS msd
        INNER JOIN  client_price_per_unit AS pbc
        ON          msd."category" = pbc.category
                    AND msd.dt_y = pbc.date
                    AND msd.split1 = pbc.retailer
        WHERE       dt_y_start = '${dtYStart}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${customerP === ALL_OPTION ? '' : `AND split1 = '${customerP}'`}
                    ${categoryP ? `AND msd.category = '${categoryP}'` : ''}
      `;
const baseQueryMultiCustomerByValue = (dtYStart, msTimeHorizon, isYago = false, customersP, categoryP) => `
        SELECT      avg(cast(predicted_growth as double) * 100) AS val
        FROM        market_sensing
        WHERE       dt_y_start = '${dtYStart}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${categoryP ? `AND category = '${categoryP}'` : ''}
      `;
const baseQueryMultiCustomerByQuantity = (dtYStart, msTimeHorizon, isYago = false, customersP, categoryP) => `
        SELECT      AVG(${isYago ? 'actual_volume' : 'predicted_volume'})/AVG(pac.retail_price) AS val
        FROM        market_sensing AS msd
        INNER JOIN  client_price_per_unit AS pac
        ON          msd.category = pac.category
                    AND msd.dt_y = pac.date
        WHERE       msd.dt_y_start = '${dtYStart}'
                    ${isYago ? '' : `AND     ms_time_horizon = '${msTimeHorizon}'`}
                    ${categoryP ? `AND msd.category = '${categoryP}'` : ''}
      `;

export default function (refreshDateP, customer, category, valueOrQuantity, lag, forecastPeriodType = VIEW_TYPES.R3M) {
  const isMultiCustomer = customer === ALL_OPTION;
  const customerP = _.trim(escapeSqlSingleQuote(customer)) === ALL_OPTION ? "" : _.trim(escapeSqlSingleQuote(customer))
  const categoryP = _.trim(escapeSqlSingleQuote(category))

  let baseQuery;

  if (!isMultiCustomer) {
    if (valueOrQuantity === BY_VALUE) {
      baseQuery = baseQueryOneCustomerByValue;
    } else if (valueOrQuantity === BY_QUANTITY) {
      baseQuery = baseQueryOneCustomerByQuantity;
    }
  } else if (isMultiCustomer) {
    if (valueOrQuantity === BY_VALUE) {
      baseQuery = baseQueryMultiCustomerByValue;
    } else if (valueOrQuantity === BY_QUANTITY) {
      baseQuery = baseQueryMultiCustomerByQuantity;
    }
  }

  const msTimeHorizon = lagToHorizonByViewTypeMapping[forecastPeriodType][lag];

  const lagDateYStart = dfns.add(dfns.startOfMonth(refreshDateP), {months: lag});
  const lagYagoDateYStart = dfns.add(lagDateYStart, {years: -1});
  if (isMultiCustomer && valueOrQuantity === BY_VALUE) {
    return `WITH
    T1 AS (${baseQuery(dfns.format(lagDateYStart, DB_DATE_FORMAT), msTimeHorizon, false, customerP, categoryP)})
    SELECT ROUND(T1.val, 2)
    FROM T1
    `
  } else {
    return `WITH
    T1 AS (${baseQuery(dfns.format(lagDateYStart, DB_DATE_FORMAT), msTimeHorizon, false, customerP, categoryP)}),
    T2 AS (${baseQuery(dfns.format(lagYagoDateYStart, DB_DATE_FORMAT), msTimeHorizon, true, customerP, categoryP)})
    SELECT ROUND(((T1.val / T2.val - 1) * 100), 2)
    FROM T1, T2
    `
  }
}
