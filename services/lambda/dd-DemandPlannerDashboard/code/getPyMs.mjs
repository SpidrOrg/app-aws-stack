import dfns from "date-fns";
import _ from "lodash";
import {removeTrailingComma, removeEmptyLines, escapeSqlSingleQuote} from "/opt/utils.mjs";

const DB_DATE_FORMAT = "yyyy-MM-dd";
const ALL_OPTION = "*";

export const periodConfig = [{
  lag: 1
}, {
  lag: 4
}, {
  lag: 7
}, {
  lag: 10
}];
export const getSubQueryName = (lag) => `PY_${lag}_${lag+2}MarketShare`;
export const getMetricMonthlyPosSalesName = () => "monthlyPosSales";
export const getMetricScaledownTotalMonthlyMarketSizeName = () => "scaleddownTotalMonthlyMarketSize"
export const getSubQueryFigureName = (lag) => `PY_${lag}_${lag+2}MarketShareGrowth`

export default function (refreshDateP, customers, categories){
  const categoriesP = _.get(categories, "[0]") === ALL_OPTION ? null : _.join(_.map(categories, v => `'${_.trim(escapeSqlSingleQuote(v))}'`), ",");
  const getCombinedQuery = ()=> {
    let combinedWithQuery = "";
    let combinedSelect = "";
    let combinedFrom = "";

    _.forEach(periodConfig, v => {
      const subQueryName = getSubQueryName(v.lag);
      const queryMetricMonthlyPosSalesName = getMetricMonthlyPosSalesName();
      const queryMetricScaledownTotalMonthlyMarketSizeName = getMetricScaledownTotalMonthlyMarketSizeName();
      const queryFigureName = getSubQueryFigureName(v.lag);

      combinedWithQuery += `${subQueryName} AS (
        SELECT  Sum(monthly_pos_sales)                      AS ${queryMetricMonthlyPosSalesName},
                sum(scaledown_total_monthly_market_size)    AS ${queryMetricScaledownTotalMonthlyMarketSizeName}
        FROM    client_market_share
        WHERE   cast(date AS date) >= cast('${dfns.format(dfns.add(refreshDateP, {months: v.lag - 12}), DB_DATE_FORMAT)}' AS date)
        AND     cast(date AS date) <= cast('${dfns.format(dfns.add(refreshDateP, {months: v.lag - 10}), DB_DATE_FORMAT)}' AS date)
        ${categoriesP ? `AND category IN (${categoriesP})` : ''}
      ),`;

      combinedSelect +=  `ROUND(((${subQueryName}.${queryMetricMonthlyPosSalesName} / ${subQueryName}.${queryMetricScaledownTotalMonthlyMarketSizeName}) * 100), 2) AS ${queryFigureName},`;

      combinedFrom += `${subQueryName},`
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
