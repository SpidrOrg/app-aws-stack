import _ from "lodash";
import {millify} from "millify";

const DELIMITTER_FOR_KV = "__"

export const removeTrailingComma = (paragraph) => {
  return paragraph.substring(0, _.lastIndexOf(paragraph, ","));
}

export const removeEmptyLines = (paragraph) => {
  let compressedParagraph = "";
  _.forEach(_.split(paragraph, "\n"), line => {
    if (_.size(_.trim(line)) >= 1){
      compressedParagraph += `${line}\n`;
    }
  });
  return compressedParagraph;
}

export const escapeSqlSingleQuote = (val)=>{
  return `${val}`.replaceAll("'", "''");
}

export const streamToString = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});


export function getKeyValueFromLine(line, keyLineIndexes) {
  const lineParts = _.split(line, ",");
  const key = _.join(_.reduce(lineParts, (acc, v, i)=> {
    if (_.includes(keyLineIndexes, i)){
      acc.push(v)
    }
    return acc;
  }, []), DELIMITTER_FOR_KV);
  const value = _.join(_.reduce(lineParts, (acc, v, i)=> {
    if (_.includes(keyLineIndexes, i) === false && i !== 0){
      acc.push(v)
    }
    return acc;
  }, []), DELIMITTER_FOR_KV);

  return {key, value, ts: _.get(lineParts, "[0]"), toLine: ()=> line}
}

export function createProgrammingStruct(fileContents, keyLineIndexes){
  const programmingStruct = {};
  const linesSplitted = fileContents.split(/\r?\n/);

  _.forEach(linesSplitted, line =>{
    const {key, value, ts, toLine} = getKeyValueFromLine(line, keyLineIndexes);
    if (programmingStruct.hasOwnProperty(`${key}`) === false){
      programmingStruct[key] = [];
    }
    programmingStruct[key].push({value, ts, toLine})
  });
  return programmingStruct
}

export function findDifference(rValue, lValue){
  const lValueMap = _.map(lValue, v => v.value);
  const rValueMap = _.map(rValue, v => v.value)
  const differences = _.difference(lValueMap, rValueMap);
  return _.map(differences, v =>{
    const indexOfDifference = _.indexOf(lValueMap, v);
    return lValue[indexOfDifference];
  });
}

export function toLine(v){
  let line = "";
  _.forEach(v, v1 => {
    if (_.size(v1.toLine()) > 1){
      line += `${v1.toLine()}\n`
    }
  })
  return line;
}

export function convertToFileContents(programmingStruct){
  let fileContent = "";
  _.forEach(_.values(programmingStruct), (v)=>{
    fileContent += toLine(v);
  });
  return fileContent;
}

export const removeSpaceAndSpecialChars = (val)=>{
  return `${val}`.replaceAll("'", "").replaceAll(".", "").replaceAll(" ", "");
}

const UNI = 1;
const THOUSAND = 1000;
const MILLION = 1000000;
const BILLION = 1000000000;
const TRILLION = 1000000000000;

const UNIT_VALUE_MAP = {
  "": UNI,
  "k": THOUSAND,
  "mn": MILLION,
  "bn": BILLION,
  "tn": TRILLION
}

export function getMultiplierAndUnit(num){
  if (num > 100 * TRILLION) {
    return {
      value: num,
      unit: "NA",
      multiplier: null
    }
  }
  const val = _.toNumber(num);
  if (!val || _.isNaN(val)){
    return {
      value: 0,
      unit: "NA",
      multiplier: null
    }
  }
  const transformed = millify(val, {units: _.keys(UNIT_VALUE_MAP), space: true, precision:2});
  const [value, unit] = _.split(transformed, " ");

  return {
    value,
    unit,
    multiplier: UNIT_VALUE_MAP[unit]
  }
}

export function getNumeric(val){
  const numericTry = _.toNumber(val);
  if (_.isNaN(numericTry)){
    return 0
  }
  return numericTry;
}
