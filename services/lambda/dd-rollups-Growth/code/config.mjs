const horizonToLagStartLagEndMapping = {
  "1_3m": {
    lagStart: 1,
    lagEnd: 3
  },
  "4_6m": {
    lagStart: 4,
    lagEnd: 6
  },
  "7_9m": {
    lagStart: 7,
    lagEnd: 9
  },
  "10_12m": {
    lagStart: 10,
    lagEnd: 12
  },
  "1m": {
    lagStart: 1,
    lagEnd: 1
  },
  "2m": {
    lagStart: 2,
    lagEnd: 2
  },
  "3m": {
    lagStart: 3,
    lagEnd: 3
  },
  "4m": {
    lagStart: 4,
    lagEnd: 4
  },
  "5m": {
    lagStart: 5,
    lagEnd: 5
  },
  "6m": {
    lagStart: 6,
    lagEnd: 6
  },
}

const defaultPeriodConfig = [{
  lag: 1,
  ms_model: "1_3m",
  client_model: "1-3 Months"
}, {
  lag: 4,
  ms_model: "4_6m",
  client_model: "4-6 Months"
}, {
  lag: 7,
  ms_model: "7_9m",
  client_model: "1-3 Months"
}, {
  lag: 10,
  ms_model: "10_12m",
  client_model: "4-6 Months"
}, {
  lag: 1,
  ms_model: "1m",
  client_model: "1-3 Months"
},{
  lag: 2,
  ms_model: "2m",
  client_model: "1-3 Months"
},{
  lag: 3,
  ms_model: "3m",
  client_model: "1-3 Months"
},{
  lag: 4,
  ms_model: "4m",
  client_model: "4-6 Months"
},{
  lag: 5,
  ms_model: "5m",
  client_model: "4-6 Months"
}, {
  lag: 6,
  ms_model: "6m",
  client_model: "4-6 Months"
}];

const envPeriodConfig = process.env.PERIOD_CONFIG ?? {};

const getPeriodConfig = () =>({
  default: defaultPeriodConfig,
  ...envPeriodConfig
});

export {
  horizonToLagStartLagEndMapping,
  getPeriodConfig
}
