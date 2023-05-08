import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import getMarketSensingBaseQuery from "./getMarketSensingBaseQuery.mjs";
import getForecastBaseQuery from "./getForecastBaseQuery.mjs";

// Constants
const ALL_OPTION = "*";
//

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERIES = [];
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDateP = dfns.parse(_.get(event, "marketSensingRefreshDate"), 'yyyy-MM-dd', new Date());
    const categories = _.split(_.get(event, "categories"), ",");
    const customers = [ALL_OPTION, ..._.split(_.get(event, "customers"), ",")];
    const valueOrQuantity = _.get(event, "valueORvolume");
    const lags = [_.toNumber(_.get(event, "lag"))];

    _.forEach(lags, lag => {
      _.forEach(categories, (category, i) => {
        _.forEach(customers, (customer, j) => {
          QUERIES.push({
            resultPath: `values.msForecastGrwoth[${i}][${j}]`,
            resultFormatter:(result)=>{
              const val = _.get(result, "data[0][0]", "NA")
              return _.isNaN(_.toNumber(val)) || _.trim(val) === "" ? null : _.toNumber(val)
            },
            query: getMarketSensingBaseQuery(marketSensingRefreshDateP, customer, category, valueOrQuantity, lag)
          });
          QUERIES.push({
            resultPath: `values.internalForecastGrowth[${i}][${j}]`,
            resultFormatter:(result)=>{
              const val = _.get(result, "data[0][0]", "NA")
              return _.isNaN(_.toNumber(val)) || _.trim(val) === "" ? null : _.toNumber(val)
            },
            query: getForecastBaseQuery(marketSensingRefreshDateP, customer, category, valueOrQuantity, lag)
          });
        })
      })
    })

    console.log("QUERIES", QUERIES)
    const promises = QUERIES.map(query => servicesConnector.makeAthenQuery(query.query));
    const results = await Promise.all(promises).then(_results =>{
      console.log("_results", _results);
      const resultsWithName = {};
      _.forEach(_results, (_result, i) => {
        _.set(resultsWithName, QUERIES[i].resultPath , QUERIES[i].resultFormatter ? QUERIES[i].resultFormatter(_result) : _result);
      });
      return resultsWithName;
    });

    // Further Processing
    const finalResult = {
      categories,
      customers
    }
    _.forEach(categories, (category, i) => {
      _.forEach(customers, (customer, j) => {
        const msGrowth = _.get(results, `values.msForecastGrwoth[${i}][${j}]`);
        const internalGrowth = _.get(results, `values.internalForecastGrowth[${i}][${j}]`)
        let variance = null;
        if (msGrowth && internalGrowth){
          variance = _.round(_.subtract(msGrowth, internalGrowth))
        }
        _.set(finalResult, `variance[${i}][${j}]`, variance);
      })
    })

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': finalResult,
      'query': QUERIES,
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
