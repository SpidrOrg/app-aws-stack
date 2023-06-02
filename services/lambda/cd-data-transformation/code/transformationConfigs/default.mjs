import _ from "lodash";
import dateFns from "date-fns";
import {DB_DATE_FORMAT, RAW_FOLDER, TRANSFORM_FOLDER} from "../constants.mjs";

export default {
  actuals: {
    rawFileKey: (fileKey) => {
      const pathSplits = _.split(fileKey, "/");
      return pathSplits[0] === RAW_FOLDER && pathSplits[1] === "client_actual"
    },
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
    rawFileKey: (fileKey) => {
      const pathSplits = _.split(fileKey, "/");
      return pathSplits[0] === RAW_FOLDER && pathSplits[1] === "client_forecast"
    },
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
    rawFileKey: (fileKey)=>{
      const pathSplits = _.split(fileKey, "/");
      return pathSplits[0] === RAW_FOLDER && pathSplits[1] === "client_price_per_unit"
    },
    filePreProcessing: (fileKey, fileContents)=>{
      // Identify if file is for 'price_all_customers'
      const lineZero = _.get(_.split(fileContents, "\n"), '[0]');
      if (_.size(_.split(lineZero, ",")) === 6) {
        // If there are 6 columns we will assume that the file uploaded is price_all_customers
        let modifiedFileContent = "";
        const lines = _.split(fileContents, "\n");
        const transformedLines = [];

        _.forEach(lines, (line, lineNumber) =>{
          if (line && _.trim(line).length > 1){
            let elements = _.split(line, ",");
            try {
              const jdaDt = elements[1];
              const jdaDtP = dateFns.parse(jdaDt, "d-MMM-yy", new Date())
              elements[1] = dateFns.format(jdaDtP, "M/d/yyyy");
            } catch (e){
              console.log(e);
            }
            elements = [..._.slice(elements, 0, 5), lineNumber === 0 ? "retailer" : "all", ..._.slice(elements, 5)];
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
    rawFileKey: (fileKey) => {
      const pathSplits = _.split(fileKey, "/");
      return pathSplits[0] === RAW_FOLDER && pathSplits[1] === "client_market_share"
    },
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
    rawFileKey: (fileKey) => {
      const pathSplits = _.split(fileKey, "/");
      return pathSplits[0] === RAW_FOLDER && pathSplits[1] === "y_data"
    },
    transformFileKey: () => `${TRANSFORM_FOLDER}/mlops/y_data/y_data.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  },
  variable_treatment: {
    rawFileKey: (fileKey) => {
      const pathSplits = _.split(fileKey, "/");
      return pathSplits[0] === RAW_FOLDER && pathSplits[1] === "variable_treatment"
    },
    transformFileKey: () => `${TRANSFORM_FOLDER}/variable_treatment/variable_treatment.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  },
  htas_ope_allocation_split_sanitized: {
    rawFileKey: (fileKey) => fileKey === `${RAW_FOLDER}/htas_ope_allocation_split_sanitized.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/mlops/htas_ope_allocation/htas_ope_allocation_split_sanitized.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  },
  powertools_pta_allocation: {
    rawFileKey: (fileKey) => fileKey === `${RAW_FOLDER}/powertools_pta_allocation_split_sanitized.csv`,
    transformFileKey: () => `${TRANSFORM_FOLDER}/mlops/powertools_pta_allocation/powertools_pta_allocation_split_sanitized.csv`,
    primaryKeyIndexes: [],
    lineTransformationConfig: []
  }
}
