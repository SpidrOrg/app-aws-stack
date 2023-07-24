import _ from "lodash";
import {
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand
} from "@aws-sdk/client-athena";

const ATHENA_QUERY_STATES = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
}

const logs = [];
export default async function makeAthenaQuery(athenaClient, tenantId, env, query, maxSleep = 40){
  const queryStart = await athenaClient.send(new StartQueryExecutionCommand({
    QueryString: query,
    QueryExecutionContext: {'Database': `${tenantId}-database${env ? `${env}` : ''}`},
    WorkGroup: `${tenantId}-athena-workgroup${env ? `${env}` : ''}`
  }));

  const queryId = queryStart.QueryExecutionId;

  let queryState = ATHENA_QUERY_STATES.QUEUED;

  while ((queryState === ATHENA_QUERY_STATES.QUEUED || queryState === ATHENA_QUERY_STATES.RUNNING) && maxSleep > 0) {
    const checkQueryRunningResult = await athenaClient.send(new GetQueryExecutionCommand({QueryExecutionId: queryId}));
    logs.push(JSON.stringify(checkQueryRunningResult))
    queryState = _.get(checkQueryRunningResult, "QueryExecution.Status.State");
    if (queryState === ATHENA_QUERY_STATES.SUCCEEDED) {
      break;
    }
    logs.push(`${tenantId}:::queryState ${JSON.stringify(queryState)}`)

    // Sleep for 1 second before checking again
    await new Promise(resolve => setTimeout(() => resolve(), 1000));

    maxSleep = maxSleep - 1;
  }

  let results = {
    logs
  };

  if (queryState === ATHENA_QUERY_STATES.SUCCEEDED) {
    let rows = [];
    let nextToken = null;
    while (true){
      const getQueryResultsCommandInput = {
        QueryExecutionId: queryId
      }
      if (nextToken){
        getQueryResultsCommandInput.NextToken = nextToken;
      }
      const queryOutput = await athenaClient.send(new GetQueryResultsCommand(getQueryResultsCommandInput));
      rows.push(..._.get(queryOutput, "ResultSet.Rows", []));
      if (!(queryOutput && queryOutput.NextToken)){
        break;
      } else {
        nextToken = queryOutput.NextToken;
      }
    }

    const headers = _.reduce(_.get(rows[0], "Data", []), (acc, v) => {
      acc.push(_.values(v)[0]);
      return acc;
    }, []);

    const data = [];
    _.forEach(_.slice(rows, 1), row => {
      const d = _.reduce(_.get(row, "Data", []), (acc, v) => {
        acc.push(_.values(v)[0]);
        return acc;
      }, []);
      data.push(d);
    });

    results = {
      headers,
      data,
      logs
    }

  }

  return results;
}
