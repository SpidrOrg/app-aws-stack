import _ from "lodash";
import {escapeSqlSingleQuote} from '/opt/utils.mjs'

export default async function(params, servicesConnector){
  const {refreshDate, customer, category, valueOrQuantity, periodStart, periodEnd, forecastPeriodType} = params;
  const QUERY = `
    SELECT id, date, user_id, user_name, user_display_name, action, comment
    FROM snp_client_review
    WHERE as_on = '${refreshDate}'
    AND customer = '${escapeSqlSingleQuote(customer)}'
    AND category = '${category}'
    AND by_value_by_volume = '${valueOrQuantity}'
    AND period_start_date = '${periodStart}'
    AND period_end_date = '${periodEnd}'
    AND forecast_period_type = '${forecastPeriodType}'
    ORDER BY from_iso8601_timestamp(date) DESC
  `
  const queryRes = await servicesConnector.makeAthenQuery(QUERY);
  return {data: _.get(queryRes, "data"), headers: _.get(queryRes, "headers")}
}
