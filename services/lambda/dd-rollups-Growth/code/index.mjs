import _ from "lodash";
import dfns from "date-fns";
import ServicesConnector from "/opt/ServicesConnector.mjs";
import {writeFileToS3, readFileAsString} from "/opt/s3Utils.mjs";
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
  console.log(event);
  const asOfStart = _.get(event, "asOfStart");
  const asOfEnd = _.get(event, "asOfEnd");
  const model = _.get(event, "model");
  let QUERIES = [];
  try {
    await servicesConnector.init(event);

    // Client Bucket Name
    const bucketName = `krny-spi-${servicesConnector.eventTenantId}${servicesConnector.envSuffix}`;

    // Read configuration file stored in client bucket
    const reviewsFileKey = () => "rollups/uiSettings.json"
    const configurationString = await readFileAsString(servicesConnector.getS3Client(), bucketName, reviewsFileKey).catch(() => "");
    const configuration = JSON.parse(configurationString);

    const splits = _.map(configuration.splits, v => v.dataName);

    const periodConfig = getPeriodConfig().default;
    // Get all distinct horizons, category and split1_final (retailers)
    const QUERY1 = `
        SELECT * FROM filter_rollup
    `
    const QUERY1a = `
      select split1_final, split2_final, split3_final, category
      from market_sensing
      group by split1_final, split2_final, split3_final, category
    `;
    const QUERY2 = `
        SELECT              *
        FROM                "market_sensing" AS msd
        FULL OUTER JOIN     "client_price_per_unit" AS cppu
                            ON msd."category" = cppu."category"
                            AND msd.dt_y = cppu."date"
        WHERE               "ms_time_horizon" = '${model}'
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
      SELECT        "split1",
                    "split1_final"    
      FROM          "market_sensing"
      GROUP BY      "split1",
                    "split1_final"
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
    const splitsCombinations = await servicesConnector.makeAthenQuery(QUERY1a);
    console.log("splitsCombinations query completed");
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

    // const distinctModels = _.split(_.get(filters.data, "[0][1]"), "___");
    const splitsData = _.reduce(_.split(_.get(filters.data, "[0][3]"), '%^'), (acc, v, i)=>{
      const [splitName, optionString] = _.split(v, "&^");
      acc[splitName] = _.split(optionString, "___");
      return acc;
    }, {});


    const distinctRetailers = [..._.get(splitsData, `${_.get(splits, "[0]")}`, [])];
    const distinctSplit2 = [..._.get(splitsData, `${_.get(splits, "[1]")}`, [])];
    const distinctSplit3 = [..._.get(splitsData, `${_.get(splits, "[2]")}`, [])];
    const distinctCategory = [..._.split(_.get(filters.data, "[0][0]"), "___")];
    // const distinctDtX = _.uniq(_.map(filters.data, v => v[3]));
    const currentDateT = dfns.startOfMonth(new Date());
    const distinctDtX = [];

    const combinations = [];
    _.forEach(distinctCategory, v => {
      combinations.push({
        category: v,
        retailer: ALL,
        split2_final: ALL,
        split3_final: ALL
      })
    })
    _.forEach(splitsCombinations.data, v => {
      const combination = {
        category: v[3],
        retailer: ALL,
        split2_final: ALL,
        split3_final: ALL
      }

      if (_.indexOf(distinctRetailers, v[0]) !== -1 && !_.isEmpty(_.trim(v[0]))){
        combination.retailer = v[0]
      }

      if (_.indexOf(distinctSplit2, v[1]) !== -1 && !_.isEmpty(_.trim(v[1]))){
        combination.split2_final = v[1]
      }

      if (_.indexOf(distinctSplit3, v[2]) !== -1 && !_.isEmpty(_.trim(v[1]))){
        combination.split3_final = v[2]
      }

      combinations.push(combination);
    });

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
        _.forEach(combinations, ({category, retailer, split2_final, split3_final})=>{
          const clientModel = _.get(_.find(periodConfig, v => v.ms_model === model), "client_model");
          const lagStart = _.get(horizonToLagStartLagEndMapping, `${model}.lagStart`);
          const lagEnd = _.get(horizonToLagStartLagEndMapping, `${model}.lagEnd`);
          const predictionStartDtP = dfns.add(dfns.parse(dtX, DB_DATE_FORMAT, new Date()), {months: lagStart + 1});
          const predictionEndDtP = dfns.add(dfns.parse(dtX, DB_DATE_FORMAT, new Date()), {months: lagEnd + 1});

          const predictionStartDt = dfns.format(predictionStartDtP, DB_DATE_FORMAT);
          const predictionEndDt = dfns.format(predictionEndDtP, DB_DATE_FORMAT);

          const yAgoStartP = dfns.add(predictionStartDtP, {years: -1});
          const yAgoEndP = dfns.add(predictionEndDtP, {years: -1});
          const yAgoStart = dfns.format(yAgoStartP, DB_DATE_FORMAT);
          const yAgoEnd = dfns.format(yAgoEndP, DB_DATE_FORMAT);

          // console.log(category, retailer, split2_final, split3_final)
          let msGrowthByValue = null;
          let msGrowthByQuantity = null;
          if (retailer === ALL) {
            msGrowthByValue = getAllRetailersMsGrowthByValue(_.get(marketSensingData, "data", []), predictionStartDt, model, category, split2_final, split3_final);
            msGrowthByQuantity = getAllRetailersMsGrowthByQuantity(_.get(marketSensingData, "data", []), predictionStartDt, yAgoStart, model, category, split2_final, split3_final)
          } else {
            const growthByValueAndQuantity = getOneRetailersMsGrowthByValueAndQuantity(_.get(marketSensingData, "data", []), predictionStartDt, yAgoStart, model, category, retailer, split2_final, split3_final);
            msGrowthByValue = growthByValueAndQuantity.growthByValue;
            msGrowthByQuantity = growthByValueAndQuantity.growthByQuantity;
          }
          msGrowthByValue = isFinite(msGrowthByValue) ? msGrowthByValue : NaN
          msGrowthByQuantity = isFinite(msGrowthByQuantity) ? msGrowthByQuantity : NaN

          const {predictedVolume, actualVolume} = getPredictedAndActualVolume(_.get(marketSensingData, "data", []), predictionStartDt, model, category, split2_final, split3_final);
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
            `${retailer}___${split2_final}___${split3_final}`,
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
    } catch(e){
      console.log(e);
    }

    const csvOutput = _.join(_.map(growthMatrix, v => _.join(v, "|")), "\n");
    console.log("bucketName", bucketName)
    const rollupFileKey = () => `rollups/growth/rollups_ason_${asOfStart}_to_${asOfEnd}__Model_${model}.csv`
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
    console.log(err);
    return {
      'statusCode': 500,
      err
    };
  }
};
