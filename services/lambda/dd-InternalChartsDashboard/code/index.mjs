import _ from "lodash";
import dfns from 'date-fns';
import ServicesConnector from "/opt/ServicesConnector.mjs";
import getCompositeQuery, {formatResult} from "./getCompositeQuery.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDateP = dfns.parse(_.get(event, "marketSensingRefreshDate"), 'yyyy-MM-dd', new Date());
    const customers = _.split(_.get(event, "customer"), ",");
    const categories = _.split(_.get(event, "category"), ",");
    const valueOrQuantity = _.get(event, "valueORvolume");
    const msTimeHorizon = _.get(event, "msTimeHorizon");
    const internalModel = _.get(event, "internalModel");

    QUERY = getCompositeQuery(marketSensingRefreshDateP, customers, categories, msTimeHorizon, internalModel, valueOrQuantity);
    console.log("QUERY", QUERY)
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);
    console.log("queryResult", queryResult)
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': {
        result: formatResult(queryResult, marketSensingRefreshDateP, msTimeHorizon)
      },
      'query': QUERY,
      'rawResult': queryResult
    }
  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      'body': err,
      'query': QUERY,
    }
  }
};
