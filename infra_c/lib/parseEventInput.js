const eventInput = require("./eventInput.json");

module.exports = function (){
  const toReturn = {};

  Object.keys(eventInput).forEach(key =>{
    const firstKey = Object.keys(eventInput[key])[0]
    toReturn[key] = eventInput[key][firstKey]
  })

  return toReturn
}

