import ServicesConnector from "/opt/ServicesConnector.mjs";
import addReview from "./addReview.mjs";
import getReviews from "./getReviews.mjs";

// Constants
const ADD_REVIEW = "ADD_REVIEW";
const GET_REVIEWS = "GET_REVIEWS";
//
const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
  const handling = event.handling;
  try {
    await servicesConnector.init(event);

    // Operation
    let operationResult = null;

    if (handling === ADD_REVIEW){
      if (event.params){
        operationResult = await addReview(event.params, servicesConnector)
      }
    }
    if (handling === GET_REVIEWS){
      operationResult = await getReviews(event, servicesConnector)
    }
    return {
      'statusCode': 200,
      'content-type': 'application/json',
      'body': {
        'result': operationResult
      }

    }
  } catch (err) {
    return {
      'statusCode': 500,
      'content-type': 'application/json',
      'body': err
    }
  }
}
