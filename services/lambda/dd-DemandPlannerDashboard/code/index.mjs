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
    const customers = _.split(_.get(event, "customers"), ",");
    const categories = _.split(_.get(event, "categories"), ",");
    const valueOrQuantity = _.get(event, "valueORvolume");

    QUERY = getCompositeQuery(marketSensingRefreshDateP, customers, categories, valueOrQuantity);
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': {
        result: formatResult(queryResult, marketSensingRefreshDateP),
        'query': QUERY,
      }
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
