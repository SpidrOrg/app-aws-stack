import _ from "lodash";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

const formatMsData = (res)=>{
  const categories = _.split(_.get(res, "[0]"), "___");
  const customers = _.split(_.get(res, "[1]"), "___");
  const msTimeHorizon = _.split(_.get(res, "[2]"), "___");
  const msTimeHorizonFormatted = _.map(msTimeHorizon, horizon => {
    let formatted = "";
    try {
      formatted = horizon.replaceAll("_", "-").replaceAll("m", " Months")
    } catch (e){
      console.error(e);
    }
    return formatted
  });
  const msModel = _.split(_.get(res, "[3]"), "___");
  return {categories, customers, msTimeHorizon, msTimeHorizonFormatted, msModel}
}
const formatResultForDashboard = (rawResult)=>{
  const rawData = _.get(rawResult, "[0]");
  const msData = formatMsData(_.slice(rawData, 0, 4));
  const updateDates = _.split(_.get(rawData, "[4]"), ",");
  const clientModels = _.split(_.get(rawData, "[5]"), ",");

  return {
    ms: msData,
    updateDates,
    clientData: {
      models: clientModels
    }
  }
}

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);



    QUERY = `
      select * from filter_rollup
    `
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    const re = formatResultForDashboard(_.get(queryResult, "data", []))
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': re
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
