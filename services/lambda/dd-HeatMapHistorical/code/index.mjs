import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import getMarketSensingBaseQuery from "./getMarketSensingBaseQuery.mjs";
import getForecastBaseQuery from "./getForecastBaseQuery.mjs";

// Constants
const UI_DATE_FORMAT = "MMM yy";
const ALL_OPTION = "*";
//
const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERIES = [];
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDateP = dfns.parse(_.get(event, "marketSensingRefreshDate"), 'yyyy-MM-dd', new Date());
    const category = _.get(event, "category");
    const customer = _.get(event, "customer");
    const valueOrQuantity = _.get(event, "valueORvolume");
    const lag = _.toNumber(_.get(event, "lag"));

    const lookbackMonths = 8;
    const numberOfPeriods = 12;

    for(let i = 0; i < numberOfPeriods; i++){
      const startDateP = dfns.add(marketSensingRefreshDateP, {months: i - lookbackMonths});
      const endDateP = dfns.add(startDateP, {months: 2});
      const refreshDateP = dfns.add(startDateP, {months: -1});

      const startDate = dfns.format(startDateP, UI_DATE_FORMAT)
      const endDate = dfns.format(endDateP, UI_DATE_FORMAT)
      QUERIES.push({
        resultPath: `[${startDate} - ${endDate}].msForecastGrwoth`,
        resultFormatter:(result)=>{
          const val = _.get(result, "data[0][0]", "NA")
          return _.isNaN(_.toNumber(val)) || _.trim(val) === "" ? null : _.toNumber(val)
        },
        query: getMarketSensingBaseQuery(refreshDateP, customer, category, valueOrQuantity, lag)
      });

      QUERIES.push({
        resultPath: `[${startDate} - ${endDate}].internalForecastGrowth`,
        resultFormatter:(result)=>{
          const vals = _.get(result, "data[0]", "NA")
          return _.map(vals, val => {
            return _.isNaN(_.toNumber(val)) || _.trim(val) === "" ? null : _.toNumber(val)
          })

        },
        query: getForecastBaseQuery(refreshDateP, customer, category, valueOrQuantity, lag)
      });
    }

    const promises = QUERIES.map(query => servicesConnector.makeAthenQuery(query.query));
    const results = await Promise.all(promises).then(_results =>{
      console.log("_results", _results);
      const resultsWithName = {};
      _.forEach(_results, (_result, i) => {
        _.set(resultsWithName, QUERIES[i].resultPath , QUERIES[i].resultFormatter ? QUERIES[i].resultFormatter(_result) : _result);
      });
      return resultsWithName;
    });

    // Further processing
    _.forOwn(results, (v, k)=>{
      results[k].msForecastGrwoth = v.msForecastGrwoth;
      const internalForecastGrowth = v.internalForecastGrowth;
      results[k].internalForecastGrowth = internalForecastGrowth[0]
      results[k].actualGrowth = internalForecastGrowth[1]
    })

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
