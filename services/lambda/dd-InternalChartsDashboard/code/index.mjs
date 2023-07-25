import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {getMultiplierAndUnit} from "/opt/utils.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);
const DB_DATE_FORMAT = "yyyy-MM-dd";
const ALL = "ALL";
const ALL_MARK = "*";
const BY_VALUE = "BY_VALUE";
const BY_QUANTITY = "BY_QUANTITY";

const sanitizeNumeric = (val, roundDigits = 0)=>{
  const number = _.toNumber(val);
  if ( (!(val === 0) && !_.trim(val)) || _.isNaN(number) || _.isFinite(number) === false || _.isNumber(number) === false){
    return null;
  }
  return _.round(number, roundDigits);
}
const monthToAddFromTimeHorizon = (msTimeHorizon)=>{
  const s1 = msTimeHorizon.replaceAll("m", "");
  const s2 = _.split(s1, "_");
  if (_.size(s2) === 1){
    return 1
  }
  if (_.size(s2) === 2){
    return _.subtract(_.toNumber(_.get(s2, '[1]')), _.toNumber(_.get(s2, '[0]')))
  }
  return 1
}
const formatResultForDashboard = (rawResult, valueOrQuantity, refreshDate, msTimeHorizon, internalModel)=>{
  const UI_DATE_FORMAT = "MMM yy";

  const getPeriodLabel = (periodIndex) =>{
    const monthToAdd = monthToAddFromTimeHorizon(msTimeHorizon);

    const startDateP = dfns.add(refreshDate, {months: periodIndex});
    const endDateP = dfns.add(refreshDate, {months: periodIndex + monthToAdd});
    const startDate = dfns.format(startDateP, UI_DATE_FORMAT);
    const endDate = dfns.format(endDateP, UI_DATE_FORMAT);
    return {
      uiFormatDate: `${startDate} - ${endDate}`,
      dbFormatStartDate: dfns.format(startDateP, DB_DATE_FORMAT),
      dbFormatEndDate: dfns.format(endDateP, DB_DATE_FORMAT)
    }
  }

  const historicalPeriod = 12;
  const result = {};

  for (let i = -historicalPeriod; i <= historicalPeriod; i++) {
    const periodLabelData = getPeriodLabel(i);
    const queryResultExtract = _.find(rawResult, v => {
      return v[4] === periodLabelData.dbFormatStartDate
    })
    const queryResultExtractForecast = _.find(rawResult, v => {
      return v[4] === periodLabelData.dbFormatStartDate && v[21] === internalModel
    })
    result[periodLabelData.uiFormatDate] = {
      forecastSales: sanitizeNumeric(_.get(queryResultExtractForecast, `[${valueOrQuantity === BY_VALUE ? 17 : 18}]`)),
      forecastGrowth: sanitizeNumeric(_.get(queryResultExtractForecast, `[${valueOrQuantity === BY_VALUE ? 8 : 9}]`)),
      actualSales: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 19 : 20}]`)),
      actualGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 12 : 13}]`)),
      msProjectedGrowth: sanitizeNumeric(_.get(queryResultExtract, `[${valueOrQuantity === BY_VALUE ? 6 : 7}]`)),
    }
  }

  // millify forcast sales and actual sales numbers

  // find Max
  const allForecastSalesFigures = _.map(_.values(result), v => _.toNumber(v["forecastSales"]));
  const allActualSalesFigures = _.map(_.values(result), v => _.toNumber(v["actualSales"]));
  const maxValue = _.max([...allForecastSalesFigures, ...allActualSalesFigures]);
  const {multiplier, unit} = getMultiplierAndUnit(maxValue);

  _.forOwn(result, (v, k)=>{
    result[k]['forecastSales'] = _.round(_.divide(_.toNumber(result[k]['forecastSales']), multiplier), 2);
    result[k]['actualSales'] = _.round(_.divide(_.toNumber(result[k]['actualSales']), multiplier), 2);
  });

  return {
    data: result,
    unit: unit
  };
}

export const handler = async (event) => {
  let QUERY = "";
  try {
    await servicesConnector.init(event);

    const marketSensingRefreshDateP = dfns.parse(_.get(event, "marketSensingRefreshDate"), DB_DATE_FORMAT, new Date());
    const customer = _.get(event, "customer");
    const category = _.get(event, "category");
    const valueOrQuantity = _.get(event, "valueORvolume");
    const msTimeHorizon = _.get(event, "msTimeHorizon");
    const internalModel = _.get(event, "internalModel");

    const predictionStartDate = dfns.format(dfns.add(marketSensingRefreshDateP, {years: -1}), DB_DATE_FORMAT);
    const predictionEndDate = dfns.format(dfns.add(marketSensingRefreshDateP, {years: 1}), DB_DATE_FORMAT);
    QUERY = `
      select * from growth_rollups
      where model = '${msTimeHorizon}'
      and category = '${category}'
      and retailer = '${customer === ALL_MARK ? ALL : customer}'
      and cast(prediction_start as date) >= cast('${predictionStartDate}' as date)
      and cast(prediction_start as date) <= cast('${predictionEndDate}' as date)
    `
    const queryResult = await servicesConnector.makeAthenQuery(QUERY);

    const re = formatResultForDashboard(_.get(queryResult, "data", []), valueOrQuantity, marketSensingRefreshDateP, msTimeHorizon, internalModel)
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': {
        result: re
      },
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
