import _ from "lodash";
import dateFns from "date-fns";

export default function (fileContents, fileConfig, addColumns = []){
  // Variable for transformed file
  let transformedFileContents = "";

  // Get all lines in the File
  const linesSplitted = fileContents.split(/\r?\n/);

  // Iterate through each line and transform
  linesSplitted.forEach((line, index) => {
    const elements = _.map(_.split(line, ","), v => _.trim(v));

    // Check if elements length is equal to file config items length
    if (_.size(elements) === _.size(fileConfig)){
      try {
        const modifiedElements = [];
        _.forEach(elements, (v, i)=>{
          const config = fileConfig[i];

          if (_.isEmpty(v) && config.default){
            modifiedElements[i] = config.default(v, elements)
          } else if (config.transformer) {
            modifiedElements[i] = config.transformer(v);
          } else {
            modifiedElements[i] = v;
          }
        });

        // Add additional Column if any
        _.forEach(addColumns, (addConfig)=>{
          modifiedElements.push(addConfig.value(elements, modifiedElements))
        })

        // Add timestamp as the first column
        const newLine = `${dateFns.format(new Date(), "yyyy-MM-dd")},${modifiedElements.join(",")}`
        transformedFileContents += newLine;

        // Do not add new line for the last line
        if (index < _.size(linesSplitted) - 2){
          transformedFileContents += "\n";
        }
      } catch (e) {
        // Any error with any element in the line will cause the entire line to neither being converted nor being added
        console.log(`ERROR WHILE TRANSFORMING FOR Line #${index} ${e}`, "Elements: ", elements);
        if (index === 0){
          const additionalColumns = _.map(addColumns, v => v.columnName);
          transformedFileContents += `ts,${elements.join(",")}${additionalColumns.join(",")}\n`;
        }
      }
    }
  });

  return transformedFileContents;
}
