import dateFns from "date-fns";
import {DB_DATE_FORMAT, RAW_FOLDER, TRANSFORM_FOLDER} from "./constants.mjs";
import _ from "lodash";

export default {
  actuals: {
    rawFileKey: () => `${RAW_FOLDER}/JDA_baseline.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/client_actual/client_actuals.csv`,
    primaryKeyIndexes: [1, 2, 6],          //setting primary key for programming struct.
    lineTransformationConfig: [{}, {
      transformer: v => {
        const dateP = dateFns.parse(v, "d-MMM-yy", new Date())   //change date format.
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    }, {
      default: () => 0     //setting default values to 0 for numbers
    }, {
      default: () => 0
    },{
      default: () => 0
    },{},{
      default: () => 0
    }, {}, {}, {
      default: () => 0
    }]
  },
  forecast: {
    rawFileKey: () => `${RAW_FOLDER}/JDA_new.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/client_forecast/client_forecast.csv`,
    primaryKeyIndexes: [2, 3, 4, 5, 13, 14],      //setting primary key for programming struct.
    lineTransformationConfig: [{},{},{
      transformer: v => {
        const dateP = dateFns.parse(v, "d-MMM-yy", new Date())      //change date format.
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    }, {
      transformer: v => {
        const dateP = dateFns.parse(v, "MMM-dd-yyyy", new Date())
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    }, {
      transformer: v => {
        const dateP = dateFns.parse(v, "d-MMM-yy", new Date())
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    }, {}, {}, {
      default: () => 0            //setting default values to 0 for numbers
    },{
      default: () => 0
    }, {
      default: () => 0
    }, {
      default: () => 0
    }, {
      default: () => 0
    }, {}, {}
    ],
    addColumns: [{
      columnName: "time_horizon_mapping",
      value: (elements)=>{
        const clientTimeHorizon = elements[0];
        return `${_.trim(clientTimeHorizon)}`.replace("JDA_lag", "").replace("-", "_") + "m"
      }
    }, {
      columnName: "model_mapping",
      value: (elements)=>{
        const clientModel = elements[12];
        const clientCategory = elements[1];
        return clientCategory + "_" + _.head(_.split(clientModel, " ")).replace("-", "_") + "m"
      }
    }]
  },
  pricePerUnit: {
    rawFileKey: (event)=>{
      const fileKey = _.get(event, "Records[0].s3.object.key");
      if (_.includes([`${RAW_FOLDER}/Price_by_customer.csv`, `${RAW_FOLDER}/Price_all_customer.csv`],  fileKey)){
        return fileKey;
      }
    },
    filePreProcessing: (fileKey, fileContents)=>{
      if (fileKey === `${RAW_FOLDER}/Price_all_customer.csv`){
        let modifiedFileContent = "";
        const lines = _.split(fileContents, "\n");
        const transformedLines = [];

        _.forEach(lines, (line, lineNumber) =>{
          if (line && line.length > 5){
            let elements = _.split(line, ",");
            try {
              const jdaDt = elements[1];
              const jdaDtP = dateFns.parse(jdaDt, "d-MMM-yy", new Date())
              elements[1] = dateFns.format(jdaDtP, "M/d/yyyy");
            } catch (e){
              console.log(e);
            }
            elements = [..._.slice(elements, 0, 5),lineNumber === 0 ? "retailer" : "all", ..._.slice(elements, 5)];
            transformedLines.push(elements.join(","));
          }
        })
        modifiedFileContent = transformedLines.join("\n");
        return modifiedFileContent
      } else {
        return fileContents;
      }
    },
    transformFileKey: () => `${TRANSFORM_FOLDER}/client_price_per_unit/client_price_per_unit.csv`,
    primaryKeyIndexes: [1, 2, 6],
    lineTransformationConfig: [{}, {
      transformer: v => {
        const dateP = dateFns.parse(v, "M/d/yyyy", new Date())
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    }, {
      default: () => 0
    },{
      default: () => 0
    }, {
      default: () => 0
    },{}, {}]
  },
  marketShare: {
    rawFileKey: () => `${RAW_FOLDER}/Market_share.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/client_market_share/client_market_share.csv`,
    primaryKeyIndexes: [2, 15],
    filePreProcessing: (fileKey, fileContents)=>{
      let modifiedFileContent = "";
      const lines = _.split(fileContents, "\n");
      const transformedLines = [];

      _.forEach(lines, line =>{
        if (line && line.length > 5){
          while(true){
            const matches = line.match(/".*?"/);
            if (matches && matches[0]) {
              line = line.replace(matches[0], matches[0].replaceAll(",", "").replaceAll("\"", ""))
            } else {
              break;
            }
          }
          transformedLines.push(line);
        }
      })
      modifiedFileContent = transformedLines.join("\n");
      return modifiedFileContent
    },
    lineTransformationConfig: [{}, {
      transformer: v => {
        const dateP = dateFns.parse(_.split(v, " ")[0], "M/d/yyyy", new Date())
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    },{},{},{},{
      default: () => 0
    },{
      default: () => 0
    },{},{
      default: () => 0
    },{
      default: () => 0
    },{},{},{},{},{
      transformer: v => {
        const dateP = dateFns.parse(v, "d-MMM-yy", new Date())
        return dateFns.format(dateP, DB_DATE_FORMAT);
      }
    },{},{},{},{}]
  },
  ydata: {
    rawFileKey: () => `${RAW_FOLDER}/y_data.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/mlops/y_data/y_data.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  },
  htas_ope_allocation_split_sanitized: {
    rawFileKey: () => `${RAW_FOLDER}/htas_ope_allocation_split_sanitized.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/mlops/htas_ope_allocation/htas_ope_allocation_split_sanitized.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  },
  powertools_pta_allocation: {
    rawFileKey: () => `${RAW_FOLDER}/powertools_pta_allocation_split_sanitized.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/mlops/powertools_pta_allocation/powertools_pta_allocation_split_sanitized.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  },
  variable_treatment: {
    rawFileKey: () => `${RAW_FOLDER}/variable_treatment.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/variable_treatment/variable_treatment.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  }
}
