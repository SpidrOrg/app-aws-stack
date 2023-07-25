import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {getMultiplierAndUnit} from "/opt/utils.mjs";

// Constants
const DB_DATE_FORMAT = 'yyyy-MM-dd';
//

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  try {
    await servicesConnector.init(event);

    const category = _.get(event, "category");
    const horizon = _.get(event, "horizon");
    const marketSensingRefreshDate = _.get(event, "marketSensingRefreshDate");
    const marketSensingRefreshDateP = dfns.parse(marketSensingRefreshDate, DB_DATE_FORMAT, new Date());
    const results = {
      actual: {},
      forecast: {},
      performance: {}
    };
    const pastClientForecastAccuracy = {};

    if (!_.trim(horizon)) {
      const Query = `
        SELECT horizon,
               Round(Avg(cv_accuracy) * 100, 0) as cv_accuracy,
               Round(Avg(rolling_test_accuracy) * 100, 0) as rolling_test_accuracy
        FROM   market_sensing_model_accuracy
        WHERE  Cast(date AS DATE) IN (SELECT Max(Cast(date AS DATE)) FROM   market_sensing_model_accuracy)
        AND    category = '${category}'
        GROUP  BY date, horizon 
      `
      const res = await servicesConnector.makeAthenQuery(Query);

      _.set(results, "performance.current", _.map( _.get(res, "data", []), row => {
        return _.map(row, (col, index)=>{
          if (index !== 0){
            const numeric = _.toNumber(col);
            return _.isNaN(numeric) ? 0 : numeric
          }
          return col;
        })
      }))
    } else {
      // Historical Prediction Accuracy
      const PREVIOUS_QUARTERS = 8;
      const currentQuaterMaxDateP = dfns.startOfQuarter(marketSensingRefreshDateP);
      const beginQuaterFirstDateP = dfns.add(currentQuaterMaxDateP, {months: -(PREVIOUS_QUARTERS - 1)  * 3});
      const currentQuaterMaxDate = dfns.format(currentQuaterMaxDateP, DB_DATE_FORMAT);
      const beginQuaterFirstDate = dfns.format(beginQuaterFirstDateP, DB_DATE_FORMAT);
      const Query = `
        select model, prediction_start, category, ms_predicted_volume, ms_actual_volume
        from growth_rollup
        where cast(prediction_start as date) >= cast('${beginQuaterFirstDate}' as date)
        and cast(prediction_start as date) <= cast('${currentQuaterMaxDate}' as date)
        and model = '${horizon}'
        and category = '${category}'
        and retailer = 'ALL' 
      `;
      const res = await servicesConnector.makeAthenQuery(Query);

      const indexOfPredictionStart = _.indexOf(_.get(res, "headers"), "prediction_start");
      const indexOfPredictedVolume = _.indexOf(_.get(res, "headers"), "ms_predicted_volume");
      const indexOfActualVolume = _.indexOf(_.get(res, "headers"), "ms_actual_volume");
      for (let i = PREVIOUS_QUARTERS; i >= 1; i--){
        const quarterDate = dfns.add(currentQuaterMaxDateP, {months: -(i - 1)  * 3});
        const quarterStartDate = dfns.format(dfns.startOfQuarter(quarterDate), DB_DATE_FORMAT);
        // const quarterEndDate = dfns.format(dfns.startOfMonth(dfns.endOfQuarter(quarterDate)), DB_DATE_FORMAT);

        const quarterName = `Q${dfns.getQuarter(quarterDate)}-${dfns.getYear(quarterDate)}`;

        pastClientForecastAccuracy[quarterName] = 0;

        const relevantRow = _.find(_.get(res, "data"), row => {
          return row[indexOfPredictionStart] === quarterStartDate;
        })
        results.actual[quarterName] = _.isNaN(_.toNumber(relevantRow[indexOfActualVolume])) ? 0 : _.round(_.toNumber(relevantRow[indexOfActualVolume]));
        results.forecast[quarterName] = _.isNaN(_.toNumber(relevantRow[indexOfPredictedVolume])) ? 0 : _.round(_.toNumber(relevantRow[indexOfPredictedVolume]));
      }
    }



    // Further processing
    // Past Variance
    _.keys(pastClientForecastAccuracy).forEach(quarterName=>{
      const quarterClientPrediction = _.get(results, `forecast.${quarterName}`, 0);
      const quarterClientActual = _.get(results, `actual.${quarterName}`, 0);
      const variance = _.round(100 - _.multiply(_.divide(Math.abs(_.subtract(quarterClientPrediction, quarterClientActual)), quarterClientActual), 100))
      _.set(results, `performance.past.${quarterName}`, variance)
    });

    // Normalize Forecast and Actual Sales figure
    const forecastSalesData = _.get(results, "forecast");
    const actualSalesData = _.get(results, "actual");

    const nonZeroNumbers = _.remove([..._.values(forecastSalesData), ..._.values(actualSalesData)], v => v !== 0);
    const maxValue = _.max(nonZeroNumbers);
    const {multiplier, unit} = getMultiplierAndUnit(maxValue);

    _.forOwn(forecastSalesData, (v, k)=>{
      forecastSalesData[k] = _.round(_.divide(v, multiplier), 2);
    });

    _.forOwn(actualSalesData, (v, k)=>{
      actualSalesData[k] = _.round(_.divide(v, multiplier), 2);
    });

    results.unit = unit;

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': results
    };

  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      'body': err
    };
  }
};
