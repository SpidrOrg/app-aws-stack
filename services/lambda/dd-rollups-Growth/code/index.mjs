import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {writeFileToS3} from "/opt/s3Utils.mjs";
import {horizonToLagStartLagEndMapping, getPeriodConfig} from "./config.mjs";
import {
  getAllRetailersMsGrowthByValue,
  getAllRetailersMsGrowthByQuantity,
  getOneRetailersMsGrowthByValueAndQuantity,
  getGrowthPerClientDataValues,
  getActualMarketSharePct,
  getPredictedAndActualVolume,
  isNumeric
} from "./helper.mjs";
// Constants
const DB_DATE_FORMAT = 'yyyy-MM-dd';
const ALL = "ALL";
const msModelToClientModelMapping = {
  "1_3m": "1-3 Months",
  "4_6m": "4-6 Months",
  "7_9m": "7-9 Months",
  "10_12m": "10-12 Months"
}
const asOfStart = '2018-01-01';
const asOfEnd = '2018-12-01';

const sanitizeRow = (row)=>{
  // Index 6 to 20 are numeric fields
  for (let i = 6; i <= 20; i++){
    const numericVal = _.toNumber(row[i]);
    if (_.isNaN(numericVal) || (!(row[i] === 0) && !_.trim(row[i])) || !_.isFinite(numericVal)){
      row[i] = ""
    } else {
      row[i] = numericVal;
    }
  }
  return row;
}
const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  let QUERIES = [];
  try {
    await servicesConnector.init(event);
    const periodConfig = getPeriodConfig().default;
    // Get all distinct horizons, category and split1_final (retailers)
    const QUERY1 = `
        SELECT      "ms_time_horizon",
                    "split1_final",
                    "category",
                    "dt_x"
        FROM        "market_sensing"
        GROUP  BY   "ms_time_horizon",
                    "split1_final",
                    "category",
                    "dt_x"
    `
    const QUERY2 = `
        SELECT              *
        FROM                "market_sensing" AS msd
        FULL OUTER JOIN     "client_price_per_unit" AS cppu
                            ON msd."category" = cppu."category"
                            AND msd.dt_y = cppu."date"
    `;
    const QUERY3 = `
      SELECT *
      FROM client_actual
    `;
    const QUERY4 = `
      SELECT * FROM (
         SELECT   *,
                  Rank() OVER (
                    partition BY    category, dt_of_forecast_making, forecast_start_dt, forecast_end_dt, model, retailer
                    ORDER BY        CAST(ts AS DATE) ASC
                  ) AS rank
         FROM client_forecast
       ) WHERE rank = 1
    `;
    const QUERY5 = `
      SELECT * FROM (
         SELECT   *,
                  Rank() OVER (
                    partition BY    category, dt_of_forecast_making, forecast_start_dt, forecast_end_dt, model, retailer
                    ORDER BY        CAST(ts AS DATE) DESC
                  ) AS rank
         FROM client_forecast
       ) WHERE rank = 1
    `;
    const QUERY6 = `
      select "split1", "split1_final" from "market_sensing" group by "split1", "split1_final"
    `;
    const QUERY7 = `
      SELECT * FROM client_market_share
    `;

    const QUERY8 = `
      SELECT      *
      FROM        key_demand_drivers
      LEFT JOIN   variable_treatment
      ON          key_demand_drivers.description = variable_treatment.columns
    `;
    const filters = await servicesConnector.makeAthenQuery(QUERY1);
    console.log("filter query completed");
    const marketSensingData = await servicesConnector.makeAthenQuery(QUERY2);
    console.log("marketSensingData query completed")
    const clientActualData = await servicesConnector.makeAthenQuery(QUERY3);
    console.log("clientActualData query completed")
    const clientForecastOriginal = await servicesConnector.makeAthenQuery(QUERY4);
    console.log("clientForecastOriginal query completed")
    const clientForecastAdjusted = await servicesConnector.makeAthenQuery(QUERY5);
    console.log("clientForecastAdjusted query completed")
    const retailerMappingRes = await servicesConnector.makeAthenQuery(QUERY6);
    console.log("retailerMapping query completed")
    const marketShareData = await servicesConnector.makeAthenQuery(QUERY7);
    console.log("marketShare query completed")
    const keyDemandDriversRes = await servicesConnector.makeAthenQuery(QUERY8);
    console.log("keyDemandDrivers query completed")

    const distinctModels = _.uniq(_.map(filters.data, v => v[0]));
    const distinctRetailers = [ALL, ..._.uniq(_.map(filters.data, v => v[1]))];
    const distinctCategory = [ALL, ..._.uniq(_.map(filters.data, v => v[2]))];
    // const distinctDtX = _.uniq(_.map(filters.data, v => v[3]));
    const currentDateT = dfns.startOfMonth(new Date());
    const distinctDtX = [];
    let dtXRangeStartT = dfns.parse(asOfStart, DB_DATE_FORMAT, new Date());
    const dtXRangeEndT = dfns.parse(asOfEnd, DB_DATE_FORMAT, new Date());

    while(dfns.isBefore(dtXRangeStartT, dtXRangeEndT) || dfns.isEqual(dtXRangeStartT, dtXRangeEndT)){
      distinctDtX.push(dfns.format(dtXRangeStartT, DB_DATE_FORMAT))
      dtXRangeStartT = dfns.add(dtXRangeStartT, {months: 1});
    }
    console.log(distinctDtX);
    // const distinctDtX = _.map(new Array(timeRangeMonths), (v, i)=>{
    //   return dfns.format(dfns.add(currentDateT, {months: -i}), DB_DATE_FORMAT)
    // })
    const retailerMapping = _.reduce(retailerMappingRes.data, (acc, v)=>{
      acc[v[0]] = v[1];
      return acc;
    }, {});

    // console.log(_.get(filters, "data"))
    // console.log(_.get(marketSensingData, "data"))
    // console.log(_.get(clientActualData, "data"))
    // console.log(_.get(clientForecastOriginal, "data"))
    // console.log(_.get(clientForecastAdjusted, "data"))
    // console.log(_.get(retailerMappingRes, "data"))
    // console.log(_.get(marketShareData, "data"))
    // console.log(_.get(keyDemandDriversRes, "data"))
    const growthMatrix = [];
    // return [_.get(filters, "data")]
    try {
      _.forEach(distinctDtX, dtX => {
        console.log(dtX);
        _.forEach(distinctModels, model => {
          const clientModel = _.get(_.find(periodConfig, v => v.ms_model === model), "client_model");
          const lagStart = _.get(horizonToLagStartLagEndMapping, `${model}.lagStart`);
          const lagEnd = _.get(horizonToLagStartLagEndMapping, `${model}.lagEnd`);
          const predictionStartDtP = dfns.add(dfns.parse(dtX, DB_DATE_FORMAT, new Date()), {months: lagStart});
          const predictionEndDtP = dfns.add(dfns.parse(dtX, DB_DATE_FORMAT, new Date()), {months: lagEnd});

          const predictionStartDt = dfns.format(predictionStartDtP, DB_DATE_FORMAT);
          const predictionEndDt = dfns.format(predictionEndDtP, DB_DATE_FORMAT);

          const yAgoStartP = dfns.add(predictionStartDtP, {years: -1});
          const yAgoEndP = dfns.add(predictionEndDtP, {years: -1});
          const yAgoStart = dfns.format(yAgoStartP, DB_DATE_FORMAT);
          const yAgoEnd = dfns.format(yAgoEndP, DB_DATE_FORMAT);

          _.forEach(distinctCategory, category => {
            _.forEach(distinctRetailers, retailer => {
              let msGrowthByValue = null;
              let msGrowthByQuantity = null;
              if (retailer === ALL) {
                msGrowthByValue = getAllRetailersMsGrowthByValue(_.get(marketSensingData, "data", []), predictionStartDt, model, category);
                msGrowthByQuantity = getAllRetailersMsGrowthByQuantity(_.get(marketSensingData, "data", []), predictionStartDt, yAgoStart, model, category)
              } else {
                const growthByValueAndQuantity = getOneRetailersMsGrowthByValueAndQuantity(_.get(marketSensingData, "data", []), predictionStartDt, yAgoStart, model, category, retailer);
                msGrowthByValue = growthByValueAndQuantity.growthByValue;
                msGrowthByQuantity = growthByValueAndQuantity.growthByQuantity;
              }
              msGrowthByValue = isFinite(msGrowthByValue) ? msGrowthByValue : NaN
              msGrowthByQuantity = isFinite(msGrowthByQuantity) ? msGrowthByQuantity : NaN

              const {predictedVolume, actualVolume} = getPredictedAndActualVolume(_.get(marketSensingData, "data", []), predictionStartDt, model, category);
              const {
                sumOfOriginalForecaseGsv,
                sumOfOriginalForecaseQty,
                sumOfActualNetGsv,
                sumOfActualNetQty,
                originalClientForecastGrowthByValue,
                originalClientForecastGrowthByQty,
                adjClientForecastGrowthByValue,
                adjClientForecastGrowthByQty,
                actualGrowthByValue,
                actualGrowthByQty
              } = getGrowthPerClientDataValues(
                dtX,
                _.get(clientForecastOriginal, "data", []),
                _.get(clientForecastAdjusted, "data", []),
                _.get(clientActualData, "data", []),
                retailerMapping,
                predictionStartDt,
                predictionEndDt,
                category,
                retailer,
                clientModel
              );

              const {actualMarketSharePct, sumOfMonthlyPosSales, sumOfScaledDownTotalMonthlyMarketSize} = getActualMarketSharePct(_.get(marketShareData, "data", []), category, yAgoStartP, yAgoEndP);

              let impliedMarketSharePctByValue = null;
              let impliedMarketSharePctByQty = null;

              if (isNumeric(sumOfMonthlyPosSales) && isNumeric(sumOfScaledDownTotalMonthlyMarketSize)){
                if (isNumeric(originalClientForecastGrowthByValue) && isNumeric(msGrowthByValue)){
                  impliedMarketSharePctByValue = _.round((
                    (sumOfMonthlyPosSales * (1 + originalClientForecastGrowthByValue)) / (sumOfScaledDownTotalMonthlyMarketSize * (1 + msGrowthByValue))
                  ) * 100, 2);
                }
                if (isNumeric(originalClientForecastGrowthByQty) && isNumeric(msGrowthByQuantity)){
                  impliedMarketSharePctByQty = _.round((
                    (sumOfMonthlyPosSales * (1 + originalClientForecastGrowthByQty)) / (sumOfScaledDownTotalMonthlyMarketSize * (1 + msGrowthByQuantity))
                  ) * 100, 2);
                }
              }

              const kdd = _.reduce(_.get(keyDemandDriversRes, "data", []), (acc, row)=>{
                if (row[4] === model && row[6] === dtX && (category === ALL ? true : row[5] === category)){
                  acc[row[11]] = _.get(acc, `${row[11]}`, 0) + _.toNumber(row[3]);
                }
                return acc;
              }, {});


              const orderedKeyDemandDrivers =  _.orderBy(_.map(_.keys(kdd), feature => {
                return {
                  feature,
                  importance: _.round(kdd[feature] * 100, 1)
                }
              }), "importance", "desc")

              const row = [
                dtX,
                model,
                category,
                retailer,
                predictionStartDt,
                predictionEndDt,
                msGrowthByValue,
                msGrowthByQuantity,
                originalClientForecastGrowthByValue,
                originalClientForecastGrowthByQty,
                adjClientForecastGrowthByValue,
                adjClientForecastGrowthByQty,
                actualGrowthByValue,
                actualGrowthByQty,
                actualMarketSharePct,
                impliedMarketSharePctByValue,
                impliedMarketSharePctByQty,
                sumOfOriginalForecaseGsv,
                sumOfOriginalForecaseQty,
                sumOfActualNetGsv,
                sumOfActualNetQty,
                msModelToClientModelMapping[model],
                JSON.stringify(orderedKeyDemandDrivers),
                predictedVolume,
                actualVolume
              ]
              const numericSanitizedRow = sanitizeRow(row);
              growthMatrix.push(numericSanitizedRow);
            })
          })
        })
      })
    } catch(e){
      console.log(e);
    }

    const csvOutput = _.join(_.map(growthMatrix, v => _.join(v, "|")), "\n");
    const bucketName = `krny-spi-${servicesConnector.eventTenantId}${servicesConnector.envSuffix}`;
    console.log("bucketName", bucketName)
    const rollupFileKey = () => `rollups/growth/rollups_ason_${asOfStart}_to_${asOfEnd}.csv`
    const s3Res = await writeFileToS3(servicesConnector.getS3Client(), bucketName, rollupFileKey, csvOutput).then(()=>true).catch((e)=>{
      console.log(e);
      return false;
    });

    // Growth for OneCustomerByQuantity

    return {
      'statusCode': 200,
      s3Res
    };

  } catch (err) {
    return {
      'statusCode': 500,
      err
    };
  }
};
