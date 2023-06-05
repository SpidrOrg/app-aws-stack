import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {getMultiplierAndUnit} from "/opt/utils.mjs";

// Constants
const DB_DATE_FORMAT = 'yyyy-MM-dd';
//

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERIES = [];
  try {
    await servicesConnector.init(event);

    const category = _.get(event, "category");
    const horizon = _.get(event, "horizon");

    // Accuracy performance data query
    QUERIES.push({
      resultPath: "performance.current",
      resultFormatter:(result)=>{
        return _.map( _.get(result, "data", []), row => {
          return _.map(row, (col, index)=>{
            if (index !== 0){
              const numeric = _.toNumber(col);
              return _.isNaN(numeric) ? 0 : numeric
            }
            return col;
          })
        })
      },
      query: `
        SELECT horizon,
               Round(Avg(cv_accuracy) * 100, 0) as cv_accuracy,
               Round(Avg(rolling_test_accuracy) * 100, 0) as rolling_test_accuracy
        FROM   market_sensing_model_accuracy
        WHERE  Cast(date AS DATE) IN (SELECT Max(Cast(date AS DATE)) FROM   market_sensing_model_accuracy)
        AND    category = '${category}'
        GROUP  BY date, horizon 
      `
    });

    const pastClientForecastAccuracy = {};

    // Historical Prediction Accuracy
    const PREVIOUS_QUARTERS = 8;
    for (let i = PREVIOUS_QUARTERS; i >= 1; i--){
      const quarterDate = dfns.add(new Date(), {months: -3 * i});
      const quarterStartDate = dfns.format(dfns.startOfQuarter(quarterDate), DB_DATE_FORMAT);
      const quarterEndDate = dfns.format(dfns.startOfMonth(dfns.endOfQuarter(quarterDate)), DB_DATE_FORMAT);

      const quarterName = `Q${dfns.getQuarter(quarterDate)}-${dfns.getYear(quarterDate)}`;

      pastClientForecastAccuracy[quarterName] = 0;
      // QUERIES.push({
      //   resultPath: `performance.past.${quarterName}`,
      //   resultFormatter:(result)=>{
      //     return _.get(result, "data[0][0]", "")
      //   },
      //   query: `
      //     SELECT  Round(Avg(rolling_test_accuracy) * 100, 0) as rolling_test_accuracy,
      //             Round(Avg(cv_accuracy) * 100, 0) as cv_accuracy
      //     FROM    market_sensing_model_accuracy
      //     WHERE   Cast(date AS DATE) >= Cast('${quarterStartDate}' AS DATE)
      //     AND     Cast(date AS DATE) <= Cast('${quarterEndDate}' AS DATE)
      //     AND     category = '${category}'
      //     AND     horizon = '${horizon}'
      //   `
      // });

      // Predicted Value
      QUERIES.push({
        resultPath: `forecast.${quarterName}`,
        resultFormatter:(result)=>{
          const val = _.get(result, "data[0][0]", "0")
          return _.isNaN(_.toNumber(val)) ? 0 : _.round(_.toNumber(val))
        },
        query: `
          SELECT    Sum(predicted_volume)
          FROM      market_sensing
          WHERE     Cast(dt_y_start AS DATE) >= Cast('${quarterStartDate}' AS DATE)
          AND       ms_time_horizon = '${horizon}'
          AND       category = '${category}' 
        `
      });

      // Actual
      QUERIES.push({
        resultPath: `actual.${quarterName}`,
        resultFormatter:(result)=>{
          const val = _.get(result, "data[0][0]", "0")
          return _.isNaN(_.toNumber(val)) ? 0 : _.round(_.toNumber(val))
        },
        query: `
          SELECT    Sum(actual_volume)
          FROM      market_sensing
          WHERE     Cast(dt_y_start AS DATE) >= Cast('${quarterStartDate}' AS DATE)
          AND       ms_time_horizon = '${horizon}'
          AND       category = '${category}' 
        `
      });
    }

    const promises = QUERIES.map(query => servicesConnector.makeAthenQuery(query.query));
    const results = await Promise.all(promises).then(_results =>{
      const resultsWithName = {};
      _.forEach(_results, (_result, i) => {
        _.set(resultsWithName, QUERIES[i].resultPath , QUERIES[i].resultFormatter ? QUERIES[i].resultFormatter(_result) : _result);
      });
      return resultsWithName;
    });


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
      'body': results,
      'query': QUERIES
    };

  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      'body': err,
      'query': QUERIES,
    };
  }
};
