import _ from "lodash";
import dfns from "date-fns";

const DB_DATE_FORMAT = 'yyyy-MM-dd';
const ALL = "ALL";

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


const getAllRetailersMsGrowthByValue = (msDataRows, dtYStart, horizon, category)=>{
  let growthByValue = null;
  // const logger = _.partial(customLog, dtYStart, horizon, category);
  // logger(`rowscount: ${_.size(msDataRows)}`);
  const {preGrowth} = _.reduce(msDataRows, (acc, v) => {
    // logger(`outside:${v[5]},${v[1]}, ${v[2]}`)
    if (v[5] === dtYStart && v[1] === horizon && (category === ALL ? true : v[2] === category)){
      // logger(`inside:${v[5]},${v[1]}, ${v[2]}, ${v[12]}`)
      acc.preGrowth.sum = _.add(acc.preGrowth.sum, _.toNumber(v[12]));
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

const getAllRetailersMsGrowthByQuantity = (msDataRows, dtYStart, yAgoDtYStart, horizon, category) => {
  let growthByQuantity = null;
  const {predictedVolume, actualVolume} = _.reduce(msDataRows, (acc, v) => {
    if (v[5] === dtYStart && v[1] === horizon && (category === ALL ? true : v[2] === category)){
      acc.predictedVolume.sum = _.add(acc.predictedVolume.sum, _.toNumber(v[11]));
      acc.predictedVolume.count = _.add(acc.predictedVolume.count, 1);
      acc.predictedVolume.retailPrice.sum = _.add(acc.predictedVolume.retailPrice.sum, _.toNumber(v[31]));
      acc.predictedVolume.retailPrice.count = _.add(acc.predictedVolume.retailPrice.count, 1);
    }
    if (v[5] === yAgoDtYStart && (category === ALL ? true : v[2] === category)){
      acc.actualVolume.sum = _.add(acc.actualVolume.sum, _.toNumber(v[9]));
      acc.actualVolume.count = _.add(acc.actualVolume.count, 1);
      acc.actualVolume.retailPrice.sum = _.add(acc.actualVolume.retailPrice.sum, _.toNumber(v[31]));
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

  if (isNumeric(averagePredictedVolume)
    && isNumeric(averagePredictedVolumeRetailPrice)
    && isNumeric(averageActualVolume)
    && isNumeric(averageActualVolumeRetailPrice)
  ){
    growthByQuantity = _.round(((averagePredictedVolume / averagePredictedVolumeRetailPrice) / (averageActualVolume / averageActualVolumeRetailPrice) - 1) * 100, 2);
  }

  return growthByQuantity;
}

const getOneRetailersMsGrowthByValueAndQuantity = (msDataRows, dtYStart, yAgoDtYStart, horizon, category, retailer) => {
  let growthByValue = null;
  let growthByQuantity = null;

  const {sumOfAllocatedPredictedMonthlyVolume, sumOfActualAllocatedVolumeShare, avgRetailPrice} = _.reduce(msDataRows, (acc, v)=>{
    if (
      v[25] === retailer
      && (category === ALL ? true : v[2] === category)
    ){
      if (v[5] === dtYStart && v[1] === horizon){
        acc.sumOfAllocatedPredictedMonthlyVolume = _.add(acc.sumOfAllocatedPredictedMonthlyVolume, _.toNumber(v[22]))
      }
      if (v[5] === yAgoDtYStart){
        acc.sumOfActualAllocatedVolumeShare = _.add(acc.sumOfAllocatedPredictedMonthlyVolume, _.toNumber(v[24]))
      }
    }

    if (v[32] === retailer){
      acc.avgRetailPrice.sum = _.add(acc.avgRetailPrice.sum, _.toNumber(v[31]));
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
  growthByQuantity = getPercentage(a, b);

  return {growthByValue, growthByQuantity}
}

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
    if (row[4] === predictionStartDt && row[5] === predictionEndDt && row[13] === clientModel && (category === ALL ? true : row[2] === category)){
      const rowRetailer = row[14];
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

  const {sumOfAdjForecaseGsv, sumOfAdjForecaseQty} = _.reduce(clientForecastAdjustedData, (acc, row) =>{
    if (row[4] === predictionStartDt && row[5] === predictionEndDt && row[13] === clientModel && (category === ALL ? true : row[2] === category)){
      const rowRetailer = row[14];
      const filterNamedRetailer = _.get(retailerMapping, `${rowRetailer}`);
      if (retailer === ALL || (filterNamedRetailer && filterNamedRetailer === retailer)){
        acc.sumOfAdjForecaseGsv = _.add(acc.sumOfAdjForecaseGsv, _.toNumber(row[11]));
        acc.sumOfAdjForecaseGsv = _.add(acc.sumOfAdjForecaseGsv, _.toNumber(row[9]))
      }
    }
    return acc;
  }, {
    sumOfAdjForecaseGsv: null,
    sumOfAdjForecaseQty: null
  })

  let {sumOfActualNetGsv, sumOfActualNetQty, sumOfActualYagoNetGsv, sumOfActualYagoNetQty} = _.reduce(clientActualData, (acc, row) =>{
    const dtP = dfns.parse(row[2], DB_DATE_FORMAT, new Date());
    const rowRetailer = row[6];
    const filterNamedRetailer = _.get(retailerMapping, `${rowRetailer}`);

    if (
      (category === ALL ? true : row[1] === category)
      && (retailer === ALL || (filterNamedRetailer && filterNamedRetailer === retailer))
    ){
      const isDateInCurrentRange = !(dfns.isBefore(dtP, predictionStartDtP) || dfns.isAfter(dtP, predictionEndDtP));
      const isDateInYagoRange = !(dfns.isBefore(dtP, yAgoStartP) || dfns.isAfter(dtP, yAgoEndP));
      if (isDateInCurrentRange){
        acc.sumOfActualNetGsv = _.add(acc.sumOfActualNetGsv, _.toNumber(row[4]));
        acc.sumOfActualNetQty = _.add(acc.sumOfActualNetQty, _.toNumber(row[3]))
      }
      if (isDateInYagoRange){
        acc.sumOfActualYagoNetGsv = _.add(acc.sumOfActualYagoNetGsv, _.toNumber(row[4]));
        acc.sumOfActualYagoNetQty = _.add(acc.sumOfActualYagoNetQty, _.toNumber(row[3]))
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
  const adjClientForecastGrowthByValue = getPercentage(sumOfAdjForecaseGsv, sumOfActualYagoNetGsv);
  const adjClientForecastGrowthByQty = getPercentage(sumOfAdjForecaseQty, sumOfActualYagoNetQty);
  const actualGrowthByValue = getPercentage(sumOfActualNetGsv, sumOfActualYagoNetGsv);
  const actualGrowthByQty = getPercentage(sumOfActualNetQty, sumOfActualYagoNetQty);

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

const getActualMarketSharePct = (marketShareData, category, yAgoStartP, yAgoEndP)=>{
  const {sumOfMonthlyPosSales, sumOfScaledDownTotalMonthlyMarketSize} = _.reduce(marketShareData, (acc, row)=>{
    if ((category === ALL ? true : row[1] === category)){
      const dtP = dfns.parse(row[15], DB_DATE_FORMAT, new Date());
      const isDateInCurrentRange = !(dfns.isBefore(dtP, yAgoStartP) || dfns.isAfter(dtP, yAgoEndP));
      if (isDateInCurrentRange){
        acc.sumOfMonthlyPosSales = _.add(acc.sumOfMonthlyPosSales, _.toNumber(row[9]));
        acc.sumOfScaledDownTotalMonthlyMarketSize = _.add(acc.sumOfScaledDownTotalMonthlyMarketSize, _.toNumber(row[12]));
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

const getPredictedAndActualVolume = (msDataRows, dtYStart, horizon, category) => {
  const {predictedVolume, actualVolume} = _.reduce(msDataRows, (acc, v) => {
    if (v[5] === dtYStart && v[1] === horizon && (category === ALL ? true : v[2] === category)){
      acc.predictedVolume = _.add(acc.predictedVolume, _.toNumber(v[11]));
      acc.actualVolume = _.add(acc.actualVolume, _.toNumber(v[9]));
    }
    return acc;
  }, {
    predictedVolume: null,
    actualVolume: null
  });
  return {predictedVolume, actualVolume}
}
export {
  getAllRetailersMsGrowthByValue,
  getAllRetailersMsGrowthByQuantity,
  getOneRetailersMsGrowthByValueAndQuantity,
  getGrowthPerClientDataValues,
  getActualMarketSharePct,
  getPredictedAndActualVolume
}


