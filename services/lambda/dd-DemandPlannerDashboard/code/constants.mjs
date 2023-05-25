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
}];

const envPeriodConfig = process.env.PERIOD_CONFIG ?? {};

export const getPeriodConfig = () =>({
  default: defaultPeriodConfig,
  ...envPeriodConfig
});

export const numberOfHistoricPeriods = 6;
