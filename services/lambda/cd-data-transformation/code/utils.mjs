import _ from "lodash";

const DELIMITTER_FOR_KV = "__"

const streamToString = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});


function getKeyValueFromLine(line, keyLineIndexes) {
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

function createProgrammingStruct(fileContents, keyLineIndexes){
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

function findDifference(rValue, lValue){
  const lValueMap = _.map(lValue, v => v.value);
  const rValueMap = _.map(rValue, v => v.value)
  const differences = _.difference(lValueMap, rValueMap);
  return _.map(differences, v =>{
    const indexOfDifference = _.indexOf(lValueMap, v);
    return lValue[indexOfDifference];
  });
}

function toLine(v){
  let line = "";
  _.forEach(v, v1 => {
    if (_.size(v1.toLine()) > 1){
      line += `${v1.toLine()}\n`
    }
  })
  return line;
}

function convertToFileContents(programmingStruct){
  let fileContent = "";
  _.forEach(_.values(programmingStruct), (v)=>{
    fileContent += toLine(v);
  });
  return fileContent;
}

export {
  streamToString,
  getKeyValueFromLine,
  createProgrammingStruct,
  findDifference,
  toLine,
  convertToFileContents
}
