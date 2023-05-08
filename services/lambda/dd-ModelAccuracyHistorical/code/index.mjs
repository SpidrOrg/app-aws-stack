import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {getNumeric} from "/opt/utils.mjs";

// Constants
const DB_DATE_FORMAT = 'yyyy-MM-dd';

const VIEW_TYPES = {
  R3M: "r3m",
  FIXED: "fixed"
}
//

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERIES = [];
  try {
    await servicesConnector.init(event);

    const category = _.get(event, "category");
    const horizon = _.get(event, "horizon");
    const viewType = _.get(event, "viewType");
    const marketSensingRefreshDateP = dfns.parse(_.get(event, "marketSensingRefreshDate"), 'yyyy-MM-dd', new Date());

    // Historical Prediction Accuracy
    const PREVIOUS_QUARTERS = 6;
    for (let i = PREVIOUS_QUARTERS; i >= 0; i--){
      const quarterDate = dfns.add(marketSensingRefreshDateP, {months: -1 * i});
      const quarterEndDateP = dfns.startOfMonth(quarterDate);
      const quarterEndDate = dfns.format(quarterEndDateP, DB_DATE_FORMAT);
      const quarterStartDateP = dfns.add(quarterEndDateP, {months: -2});
      const quarterStartDate = dfns.format(quarterStartDateP, DB_DATE_FORMAT);

      const quarterName = `${dfns.format(quarterStartDateP, 'MMM-yy')}-${dfns.format(quarterEndDateP, 'MMM-yy')}`;

      QUERIES.push({
        resultPath: `performance[${PREVIOUS_QUARTERS - i}]`,
        resultFormatter:(result)=>{
          if (viewType === VIEW_TYPES.R3M){
            return [quarterName, getNumeric(_.get(result, `data[0][0]`, ""))]
          }
          if (viewType === VIEW_TYPES.FIXED){
            return [quarterName, getNumeric(_.get(result, `data[0][1]`, ""))]
          }
          return ""
        },
        query: `
          SELECT  Round(Avg(rolling_test_accuracy) * 100, 0) as rolling_test_accuracy,
                  Round(Avg(cv_accuracy) * 100, 0) as cv_accuracy
          FROM    market_sensing_model_accuracy
          WHERE   Cast(date AS DATE) >= Cast('${quarterStartDate}' AS DATE)
          AND     Cast(date AS DATE) <= Cast('${quarterEndDate}' AS DATE)
          AND     category = '${category}'
          AND     horizon = '${horizon}'
        `
      });
    }

    console.log("QUERIES", QUERIES);
    const promises = QUERIES.map(query => servicesConnector.makeAthenQuery(query.query));
    const results = await Promise.all(promises).then(_results =>{
      const resultsWithName = {};
      _.forEach(_results, (_result, i) => {
        _.set(resultsWithName, QUERIES[i].resultPath , QUERIES[i].resultFormatter ? QUERIES[i].resultFormatter(_result) : _result);
      });
      return resultsWithName;
    });

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': results
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
