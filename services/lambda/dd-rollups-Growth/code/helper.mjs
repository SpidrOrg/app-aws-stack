import _ from "lodash";
import dfns from "date-fns";

const DB_DATE_FORMAT = 'yyyy-MM-dd';
const ALL = "ALL";

const msIdx = {
  idx: 0,
  ms_time_horizon: 1,
  category: 2,
  geography: 3,
  model: 4,
  dt_y_start: 5,
  dt_y_end: 6,
  period_type: 7,
  dt_x: 8,
  actual_volume: 9,
  actual_growth: 10,
  predicted_volume: 11,
  predicted_growth: 12,
  retailer: 13,
  full_quarter: 14,
  dt_y: 15,
  month: 16,
  monthly_share: 17,
  pct_mnth_allocation: 18,
  predicted_monthly_volume: 19,
  estimated_share: 20,
  allocated_predicted_monthly_volume: 21,
  actual_share: 22,
  actual_allocated_volume_share: 23,
  split_name: 24,
  split1: 25,
  split1_final: 26,
  split2: 27,
  split2_final: 28,
  split3: 29,
  split3_final: 30,
  confidence_1: 31,
  predicted_growth_lower_1: 32,
  predicted_growth_upper_1: 33,
  predicted_volume_lower_1: 34,
  predicted_volume_upper_1: 35,
  allocated_predicted_monthly_volume_lower_1: 36,
  allocated_predicted_monthly_volume_upper_1: 37,
  confidence_2: 38,
  predicted_growth_lower_2: 39,
  predicted_growth_upper_2: 40,
  predicted_volume_lower_2: 41,
  predicted_volume_upper_2: 42,
  allocated_predicted_monthly_volume_lower_2: 43,
  allocated_predicted_monthly_volume_upper_2: 44,
  confidence_3: 45,
  predicted_growth_lower_3: 46,
  predicted_growth_upper_3: 47,
  predicted_volume_lower_3: 48,
  predicted_volume_upper_3: 49,
  allocated_predicted_monthly_volume_lower_3: 50,
  allocated_predicted_monthly_volume_upper_3: 51,
  cpp_ts: 52,
  cpp_category: 53,
  cpp_date: 54,
  cpp_gsv_per_unit: 55,
  cpp_retail_markup_coeff: 56,
  cpp_retail_price: 57,
  cpp_retailer: 58
}

const NUM_OF_CONFIDENCE = 3;

const customLog = (dtYStart, horizon, category, text)=>{
  if (dtYStart === '2021-02-01'
      && horizon === '1_3m'
      && category === 'pta'
  ){
    console.log(text);
  }
}

export const isNumeric = (val)=>{
  return _.isNumber(val) && !_.isNaN(val) && _.isFinite(val);
}
const getPercentage = (a, b, round = 2)=>{
  if (isNumeric(a) && _.isFinite(a) && isNumeric(b) && _.isFinite(b)){
    return _.round(((a / b) - 1) * 100, round)
  }
  return null
}


const getAllRetailersMsGrowthByValue = (msDataRows, dtYStart, horizon, category, split2, split3, predictedGrowthIdx = null)=>{
  let growthByValue = null;
  // const logger = _.partial(customLog, dtYStart, horizon, category);
  // logger(`rowscount: ${_.size(msDataRows)}`);
  const {preGrowth} = _.reduce(msDataRows, (acc, v) => {
    // logger(`outside:${v[5]},${v[1]}, ${v[2]}`)
    if (v[5] === dtYStart
        && v[1] === horizon
        && (category === ALL ? true : v[msIdx.category] === category)
        && (split2 === ALL ? true : v[msIdx.split2_final] === split2)
        && (split3 === ALL ? true : v[msIdx.split3_final] === split3)
    ){
      // logger(`inside:${v[5]},${v[1]}, ${v[2]}, ${v[12]}`)
      acc.preGrowth.sum = _.add(acc.preGrowth.sum, _.toNumber(v[predictedGrowthIdx ? predictedGrowthIdx : msIdx.predicted_growth]));
      acc.preGrowth.count = _.add(acc.preGrowth.count, 1);
    }
    // logger(`Acc: ${acc.preGrowth.sum}, ${acc.preGrowth.count}`)
    return acc;
  }, {
    preGrowth: {
      sum: null,
      count: 0
    }
  });
  // logger(`final: ${preGrowth.sum}, ${preGrowth.count}`)
  if (isNumeric(preGrowth.sum) && isNumeric(preGrowth.count)){
    growthByValue = (preGrowth.sum / preGrowth.count) * 100;
  }
  // logger(`final: ${preGrowth.sum}, ${preGrowth.count}, ${growthByValue}`)
  return growthByValue;
}

const getAllRetailersMsGrowthByValueConfValues = (msDataRows, dtYStart, horizon, category, split2, split3, isLower) => {
  const result = [];

  for (let i = 1; i <= NUM_OF_CONFIDENCE; i++){
    const idx = msIdx[`predicted_growth_${isLower ? 'lower' : 'upper'}_${i}`];
    const growthVal = getAllRetailersMsGrowthByValue(msDataRows, dtYStart, horizon, category, split2, split3, idx);
    result.push(growthVal);
  }

  return result;
}

const getAllRetailersMsGrowthByQuantity = (msDataRows, dtYStart, yAgoDtYStart, horizon, category, split2, split3, predictedVolumeIdx = null) => {
  let growthByQuantity = null;
  const {predictedVolume, actualVolume} = _.reduce(msDataRows, (acc, v) => {
    if (v[msIdx.dt_y_start] === dtYStart
        && v[1] === horizon
        && (category === ALL ? true : v[msIdx.category] === category)
        && (split2 === ALL ? true : v[msIdx.split2_final] === split2)
        && (split3 === ALL ? true : v[msIdx.split3_final] === split3)
    ){
      acc.predictedVolume.sum = _.add(acc.predictedVolume.sum, _.toNumber(v[predictedVolumeIdx ? predictedVolumeIdx : msIdx.predicted_volume]));
      acc.predictedVolume.count = _.add(acc.predictedVolume.count, 1);
      acc.predictedVolume.retailPrice.sum = _.add(acc.predictedVolume.retailPrice.sum, _.toNumber(v[msIdx.cpp_retail_price]));
      acc.predictedVolume.retailPrice.count = _.add(acc.predictedVolume.retailPrice.count, 1);
    }
    if (v[msIdx.dt_y_start] === yAgoDtYStart
        && (category === ALL ? true : v[msIdx.category] === category)
        && (split2 === ALL ? true : v[msIdx.split2_final] === split2)
        && (split3 === ALL ? true : v[msIdx.split3_final] === split3)
    ){
      acc.actualVolume.sum = _.add(acc.actualVolume.sum, _.toNumber(v[msIdx.actual_volume]));
      acc.actualVolume.count = _.add(acc.actualVolume.count, 1);
      acc.actualVolume.retailPrice.sum = _.add(acc.actualVolume.retailPrice.sum, _.toNumber(v[msIdx.cpp_retail_price]));
      acc.actualVolume.retailPrice.count = _.add(acc.actualVolume.retailPrice.count, 1);
    }
    return acc;
  }, {
    predictedVolume: {
      sum: null,
      count: null,
      retailPrice: {
        sum: null,
        count: null
      }
    },
    actualVolume: {
      sum: null,
      count: null,
      retailPrice: {
        sum: null,
        count: null
      }
    }
  });

  const averagePredictedVolume = predictedVolume.sum / predictedVolume.count;
  const averagePredictedVolumeRetailPrice = predictedVolume.retailPrice.sum / predictedVolume.retailPrice.count;
  const averageActualVolume = actualVolume.sum / actualVolume.count;
  const averageActualVolumeRetailPrice = actualVolume.retailPrice.sum / actualVolume.retailPrice.count;

  if (isNumeric(averagePredictedVolume) && _.toNumber(averagePredictedVolume) !== 0
      && isNumeric(averagePredictedVolumeRetailPrice) && _.toNumber(averagePredictedVolumeRetailPrice) !== 0
      && isNumeric(averageActualVolume) && _.toNumber(averageActualVolume) !== 0
      && isNumeric(averageActualVolumeRetailPrice) && _.toNumber(averageActualVolumeRetailPrice) !== 0
  ){
    growthByQuantity = getPercentage((averagePredictedVolume / averagePredictedVolumeRetailPrice), (averageActualVolume / averageActualVolumeRetailPrice));
  }

  return growthByQuantity;
}

const getAllRetailersMsGrowthByQuantityConfValues = (msDataRows, dtYStart, yAgoDtYStart, horizon, category, split2, split3, isLower)=>{
  const result = [];

  for (let i = 1; i <= NUM_OF_CONFIDENCE; i++){
    const idx = msIdx[`predicted_volume_${isLower ? 'lower' : 'upper'}_${i}`];
    const growthVal = getAllRetailersMsGrowthByQuantity(msDataRows, dtYStart, yAgoDtYStart, horizon, category, split2, split3, idx);
    result.push(growthVal);
  }

  return result;
}

const getOneRetailersMsGrowthByValueAndQuantity = (msDataRows, dtYStart, yAgoDtYStart, horizon, category, retailer, split2, split3, allocatedPredictedMonthlyVolumeIdx) => {
  let growthByValue = null;
  let growthByQuantity = null;

  const {sumOfAllocatedPredictedMonthlyVolume, sumOfActualAllocatedVolumeShare, avgRetailPrice} = _.reduce(msDataRows, (acc, v)=>{
    if (
        v[msIdx.split1_final] === retailer
        && (category === ALL ? true : v[msIdx.category] === category)
        && (split2 === ALL ? true : v[msIdx.split2_final] === split2)
        && (split3 === ALL ? true : v[msIdx.split3_final] === split3)
    ){
      if (v[msIdx.dt_y_start] === dtYStart && v[msIdx.ms_time_horizon] === horizon){
        acc.sumOfAllocatedPredictedMonthlyVolume = _.add(acc.sumOfAllocatedPredictedMonthlyVolume, _.toNumber(v[allocatedPredictedMonthlyVolumeIdx ? allocatedPredictedMonthlyVolumeIdx : msIdx.allocated_predicted_monthly_volume]))
      }
      if (v[msIdx.dt_y_start] === yAgoDtYStart){
        acc.sumOfActualAllocatedVolumeShare = _.add(acc.sumOfActualAllocatedVolumeShare, _.toNumber(v[msIdx.actual_allocated_volume_share]))
      }
    }

    if (v[msIdx.cpp_retailer] === retailer){
      acc.avgRetailPrice.sum = _.add(acc.avgRetailPrice.sum, _.toNumber(v[msIdx.cpp_retail_price]));
      acc.avgRetailPrice.count = _.add(acc.avgRetailPrice.count, 1)
    }
    return acc;
  }, {
    sumOfAllocatedPredictedMonthlyVolume: null,
    sumOfActualAllocatedVolumeShare: null,
    avgRetailPrice: {
      sum: null,
      count: null
    }
  })


  const averageRetailPrice = avgRetailPrice.sum / avgRetailPrice.count;

  growthByValue = getPercentage(sumOfAllocatedPredictedMonthlyVolume, sumOfActualAllocatedVolumeShare);
  const a = sumOfAllocatedPredictedMonthlyVolume/averageRetailPrice;
  const b = sumOfActualAllocatedVolumeShare/averageRetailPrice;
  if (a !== 0 && b !== 0){
    growthByQuantity = getPercentage(a, b);
  }

  return {growthByValue, growthByQuantity}
}

const getOneRetailersMsGrowthByValueAndQuantityConfValues = (msDataRows, dtYStart, yAgoDtYStart, horizon, category, retailer, split2, split3)=>{
  const result = {
    msGrowthByValueConfLower: [],
    msGrowthByValueConfUpper: [],
    msGrowthByQuantityConfLower: [],
    msGrowthByQuantityConfUpper: []
  };

  for (let i = 1; i <= NUM_OF_CONFIDENCE; i++){
    // Lower
    let idx = msIdx[`allocated_predicted_monthly_volume_lower_${i}`];
    let growthVal = getOneRetailersMsGrowthByValueAndQuantity(msDataRows, dtYStart, horizon, category, split2, split3, idx);
    result.msGrowthByValueConfLower.push(growthVal.growthByValue);
    result.msGrowthByQuantityConfLower.push(growthVal.growthByQuantity);


    // Upper
    idx = msIdx[`allocated_predicted_monthly_volume_upper_${i}`];
    growthVal = getOneRetailersMsGrowthByValueAndQuantity(msDataRows, dtYStart, horizon, category, split2, split3, idx);
    result.msGrowthByValueConfUpper.push(growthVal.growthByValue);
    result.msGrowthByQuantityConfUpper.push(growthVal.growthByQuantity);
  }

  return result;
}

const getPredictedAndActualVolume = (msDataRows, dtYStart, horizon, category, split2, split3) => {
  const {predictedVolume, actualVolume} = _.reduce(msDataRows, (acc, v) => {
    if (v[msIdx.dt_y_start] === dtYStart
        && v[1] === horizon
        && (category === ALL ? true : v[msIdx.category] === category)
        && (split2 === ALL ? true : v[msIdx.split2_final] === split2)
        && (split3 === ALL ? true : v[msIdx.split3_final] === split3)
    ){
      acc.predictedVolume = _.add(acc.predictedVolume, _.toNumber(v[msIdx.predicted_volume]));
      acc.actualVolume = _.add(acc.actualVolume, _.toNumber(v[msIdx.actual_volume]));
    }
    return acc;
  }, {
    predictedVolume: null,
    actualVolume: null
  });
  return {predictedVolume, actualVolume}
}

const clientForecastIdx = {
  ts: 0,
  comparison_version: 1,
  category: 2,
  dt_of_forecast_making: 3,
  forecast_start_dt: 4,
  forecast_end_dt: 5,
  min_lag: 6,
  max_lag: 7,
  actualDemandNetQty: 8,
  demandForecastQty: 9,
  actualDemandNetGsv: 10,
  demandForecastGsv: 11,
  mnth_cnt: 12,
  model: 13,
  retailer: 14,
  time_horizon_mapping: 15,
  model_mapping: 16
}

const clientActualIdx = {
  ts: 0,
  category: 1,
  date: 2,
  net_qty: 3,
  net_gsv: 4,
  unique_items: 5,
  retailer: 6,
  net_qty_py: 7,
  dt_year: 8,
  dt_month: 9,
  net_gsv_py: 10
};

const getGrowthPerClientDataValues = (
    dtX,
    clientForecastOriginalData,
    clientForecastAdjustedData,
    clientActualData,
    retailerMapping,
    predictionStartDt,
    predictionEndDt,
    category,
    retailer,
    clientModel
)=>{
  const predictionStartDtP = dfns.parse(predictionStartDt, DB_DATE_FORMAT, new Date());
  const predictionEndDtP = dfns.parse(predictionEndDt, DB_DATE_FORMAT, new Date());
  const yAgoStartP = dfns.add(predictionStartDtP, {years: -1});
  const yAgoEndP = dfns.add(predictionEndDtP, {years: -1});

  const {sumOfOriginalForecaseGsv, sumOfOriginalForecaseQty} = _.reduce(clientForecastOriginalData, (acc, row) =>{
    if (row[clientForecastIdx.forecast_start_dt] === predictionStartDt
        && row[clientForecastIdx.forecast_end_dt] === predictionEndDt
        && row[clientForecastIdx.model] === clientModel
        && (category === ALL ? true : row[clientForecastIdx.category] === category)){
      const rowRetailer = row[clientForecastIdx.retailer];
      const filterNamedRetailer = _.get(retailerMapping, `${rowRetailer}`);
      if (retailer === ALL || (filterNamedRetailer && filterNamedRetailer === retailer)){
        acc.sumOfOriginalForecaseGsv = _.add(acc.sumOfOriginalForecaseGsv, _.toNumber(row[11]));
        acc.sumOfOriginalForecaseQty = _.add(acc.sumOfOriginalForecaseQty, _.toNumber(row[9]))
      }
    }
    return acc;
  }, {
    sumOfOriginalForecaseGsv: null,
    sumOfOriginalForecaseQty: null
  });

  const {sumOfAdjForecastGsv, sumOfAdjForecastQty} = _.reduce(clientForecastAdjustedData, (acc, row) =>{
    if (row[clientForecastIdx.forecast_start_dt] === predictionStartDt
        && row[clientForecastIdx.forecast_end_dt] === predictionEndDt
        && row[clientForecastIdx.model] === clientModel
        && (category === ALL ? true : row[clientForecastIdx.category] === category)){
      const rowRetailer = row[clientForecastIdx.retailer];
      const filterNamedRetailer = _.get(retailerMapping, `${rowRetailer}`);
      if (retailer === ALL || (filterNamedRetailer && filterNamedRetailer === retailer)){
        acc.sumOfAdjForecastGsv = _.add(acc.sumOfAdjForecastGsv, _.toNumber(row[clientForecastIdx.demandForecastGsv]));
        acc.sumOfAdjForecastQty = _.add(acc.sumOfAdjForecastQty, _.toNumber(row[clientForecastIdx.demandForecastQty]))
      }
    }
    return acc;
  }, {
    sumOfAdjForecastGsv: null,
    sumOfAdjForecastQty: null
  })

  let {sumOfActualNetGsv, sumOfActualNetQty, sumOfActualYagoNetGsv, sumOfActualYagoNetQty} = _.reduce(clientActualData, (acc, row) =>{
    const dtP = dfns.parse(row[clientActualIdx.date], DB_DATE_FORMAT, new Date());
    const rowRetailer = row[clientActualIdx.retailer];
    const filterNamedRetailer = _.get(retailerMapping, `${rowRetailer}`);

    if (
        (category === ALL ? true : row[clientActualIdx.category] === category)
        && (retailer === ALL || (filterNamedRetailer && filterNamedRetailer === retailer))
    ){
      const isDateInCurrentRange = !(dfns.isBefore(dtP, predictionStartDtP) || dfns.isAfter(dtP, predictionEndDtP));
      const isDateInYagoRange = !(dfns.isBefore(dtP, yAgoStartP) || dfns.isAfter(dtP, yAgoEndP));
      if (isDateInCurrentRange){
        acc.sumOfActualNetGsv = _.add(acc.sumOfActualNetGsv, _.toNumber(row[clientActualIdx.net_gsv]));
        acc.sumOfActualNetQty = _.add(acc.sumOfActualNetQty, _.toNumber(row[clientActualIdx.net_qty]))
      }
      if (isDateInYagoRange){
        acc.sumOfActualYagoNetGsv = _.add(acc.sumOfActualYagoNetGsv, _.toNumber(row[clientActualIdx.net_gsv]));
        acc.sumOfActualYagoNetQty = _.add(acc.sumOfActualYagoNetQty, _.toNumber(row[clientActualIdx.net_qty]))
      }
    }
    return acc;
  }, {
    sumOfActualNetGsv: null,
    sumOfActualNetQty: null,
    sumOfActualYagoNetGsv: null,
    sumOfActualYagoNetQty: null
  });

  const originalClientForecastGrowthByValue = getPercentage(sumOfOriginalForecaseGsv, sumOfActualYagoNetGsv);
  const originalClientForecastGrowthByQty = getPercentage(sumOfOriginalForecaseQty, sumOfActualYagoNetQty);
  let adjClientForecastGrowthByValue = getPercentage(sumOfAdjForecastGsv, sumOfActualYagoNetGsv);
  let adjClientForecastGrowthByQty = getPercentage(sumOfAdjForecastQty, sumOfActualYagoNetQty);
  const actualGrowthByValue = getPercentage(sumOfActualNetGsv, sumOfActualYagoNetGsv);
  const actualGrowthByQty = getPercentage(sumOfActualNetQty, sumOfActualYagoNetQty);

  if (sumOfOriginalForecaseGsv === adjClientForecastGrowthByValue){
    adjClientForecastGrowthByValue = null;
  }
  if (sumOfOriginalForecaseQty === adjClientForecastGrowthByQty){
    adjClientForecastGrowthByQty = null;
  }

  return {
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
  }
}

const clientMarketShareIdx = {
  ts: 0,
  category: 1,
  monthly_date: 2,
  year: 3,
  month: 4,
  quarter: 5,
  hh_monthly_spend: 6,
  monthly_weight: 7,
  qtrly_market_share: 8,
  monthly_pos_sales: 9,
  qtrly_pos_sales: 10,
  total_qtrly_market_size: 11,
  scaledown_total_monthly_market_size: 12,
  monthly_market_share: 13,
  total_monthly_market_size: 14,
  date: 15
}

const getActualMarketSharePct = (marketShareData, category, yAgoStartP, yAgoEndP)=>{
  const {sumOfMonthlyPosSales, sumOfScaledDownTotalMonthlyMarketSize} = _.reduce(marketShareData, (acc, row)=>{
    if ((category === ALL ? true : row[clientMarketShareIdx.category] === category)){
      const dtP = dfns.parse(row[clientMarketShareIdx.date], DB_DATE_FORMAT, new Date());
      const isDateInCurrentRange = !(dfns.isBefore(dtP, yAgoStartP) || dfns.isAfter(dtP, yAgoEndP));
      if (isDateInCurrentRange){
        acc.sumOfMonthlyPosSales = _.add(acc.sumOfMonthlyPosSales, _.toNumber(row[clientMarketShareIdx.monthly_pos_sales]));
        acc.sumOfScaledDownTotalMonthlyMarketSize = _.add(acc.sumOfScaledDownTotalMonthlyMarketSize, _.toNumber(row[clientMarketShareIdx.scaledown_total_monthly_market_size]));
      }
    }
    return acc;
  }, {
    sumOfMonthlyPosSales: null,
    sumOfScaledDownTotalMonthlyMarketSize: null
  });

  let actualMarketSharePct = null;
  if (isNumeric(sumOfMonthlyPosSales) && isNumeric(sumOfScaledDownTotalMonthlyMarketSize)){
    actualMarketSharePct = _.round((sumOfMonthlyPosSales / sumOfScaledDownTotalMonthlyMarketSize) * 100, 2);
  }
  return {actualMarketSharePct, sumOfMonthlyPosSales, sumOfScaledDownTotalMonthlyMarketSize};
}

export {
  getAllRetailersMsGrowthByValue,
  getAllRetailersMsGrowthByValueConfValues,
  getAllRetailersMsGrowthByQuantity,
  getAllRetailersMsGrowthByQuantityConfValues,
  getOneRetailersMsGrowthByValueAndQuantity,
  getOneRetailersMsGrowthByValueAndQuantityConfValues,
  getGrowthPerClientDataValues,
  getActualMarketSharePct,
  getPredictedAndActualVolume
}
