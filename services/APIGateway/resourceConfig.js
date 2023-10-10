module.exports = {
  "dashboard_filters": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-FilterOptions",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))"
        }`
      }
    }
  },
  "heat_map_historical": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-HeatMapHistorical",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
          "customer": "$input.params('customer')",
          "category": "$input.params('category')",
          "valueORvolume": "$input.params('valueORvolume')",
          "lag": "$input.params('lag')"
        }`
      }
    }
  },
  "heatmapdashboard": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-HeatMapDashboard",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
          "customers": "$input.params('customers')",
          "categories": "$input.params('categories')",
          "valueORvolume": "$input.params('valueORvolume')",
          "lag": "$input.params('lag')"
        }`
      }
    }
  },
  "historical_model_accuracy": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-ModelAccuracyHistorical",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
          "category": "$input.params('category')",
          "horizon": "$input.params('horizon')",
          "viewType": "$input.params('forecastPeriodType')"
        }`
      }
    }

  },
  "internalcharts": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-InternalChartsDashboard",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
          "customer": "$input.params('customers')",
          "category": "$input.params('categories')",
          "valueORvolume": "$input.params('valueORvolume')",
          "msTimeHorizon": "$input.params('msTimeHorizon')",
          "internalModel": "$input.params('internalModel')"
        }`
      }
    }
  },
  "key_demand_driver_drill_down": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-KeyDemandDriverDrillDown",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
          "category": "$input.params('category')",
          "horizon": "$input.params('horizon')",
          "driver": "$input.params('driver')"
        }`
      }
    }
  },
  "maindashboard": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-DemandPlannerDashboard",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')",
          "categories": "$input.params('categories')",
          "msModels": "$input.params('msModels')",
          "splits": "$input.params('splits')",
          "valueORvolume": "$input.params('valueORvolume')",
          "isFixed": "$input.params('isFixed')",
          "isMonthlyMode": "$input.params('isMonthlyMode')"
        }`
      }
    }
  },
  "modelaccuracy": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-ModelAccuracyDashboard",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "category": "$input.params('category')",
          "horizon": "$input.params('horizon')",
          "marketSensingRefreshDate": "$input.params('marketSensingRefreshDate')"
        }`
      }
    }
  },
  "reviews": {
    "GET": {
      "integrationRequest": {
        "lambda": "dd-ForecastReview",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "refreshDate": "$input.params('refreshDate')",
          "customer": "$input.params('customer')",
          "category": "$input.params('category')",
          "valueOrQuantity": "$input.params('valueOrQuantity')",
          "periodStart": "$input.params('periodStart')",
          "periodEnd": "$input.params('periodEnd')",
          "forecastPeriodType": "$input.params('forecastPeriodType')",
          "handling": "GET_REVIEWS"
        }`
      }
    },
    "POST": {
      "integrationRequest": {
        "lambda": "dd-ForecastReview",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "params": $input.json('$'),
          "handling": "ADD_REVIEW"
        }`
      }
    }
  },
  "uiconfig": {
    "POST": {
      "integrationRequest": {
        "lambda": "dd-ui-config",
        "proxy": false,
        "mappingTemplate": `{
          "scope" : "$context.authorizer.claims.scope",
          "origin": "$util.escapeJavaScript($input.params().header.get('origin'))",
          "params": $input.json('$')
        }`
      }
    }
  }
}
