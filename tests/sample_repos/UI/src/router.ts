
import * as Sentry from "@sentry/node";
import {
  EndpointManager,
  DiffManager
} from './models';
import { json } from 'body-parser';
import {
  parseDiff,
  getShortForm
} from './parser';

const express = require("express");
const router = express.Router();

const jsonParser = json();

Sentry.init({
  dsn: "https://4eb8509f6def4bbb8767e76e2e05117e@o681396.ingest.sentry.io/5774888",

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

router.get("/:service/:pr/metrics", jsonParser, async (req, res) => {
  const endpointManager = new EndpointManager(req.params.service, req.params.pr);

  try {
    const metrics = await endpointManager.getMetrics();
    res.send(metrics).status(200)
  } catch (e) {
    res.send({
      message: 'failed'
    }).status(500)
  }
});

router.post("/:service/:pr/dynamic_endpoints", jsonParser, async (req, res) => {
  const endpoint = req.body.endpoint;
  const endpointManager = new EndpointManager(req.params.service, req.params.pr);

  try {
    await endpointManager.addDynamicEndpoint(endpoint);

    res.send({
      message: 'success'
    }).status(200)
  } catch (e) {
    res.send({
      message: 'failed'
    }).status(500)
  }
});

router.delete("/:service/:pr/dynamic_endpoints", jsonParser, async (req, res) => {
  const endpoint = req.body.endpoint;
  const endpointManager = new EndpointManager(req.params.service, req.params.pr);

  try {
    await endpointManager.removeDynamicEndpoint(endpoint)
    res.send({
      message: 'success'
    }).status(200)
  } catch (e) {
    res.send({
      message: 'failed'
    }).status(500)
  }
});

router.post("/:service/:pr/reset", jsonParser, async (req, res) => {
  const endpointManager = new EndpointManager(req.params.service, req.params.pr);
  const diffManager = new DiffManager(req.params.service, req.params.pr);

  try {
    await endpointManager.reset();
    await diffManager.reset();
    res.send({
      message: 'success'
    }).status(200)
  } catch (e) {
    res.send({
      message: 'failed'
    }).status(500)
  }
});

router.get("/:service/:pr/dynamic_endpoints", jsonParser, async (req, res) => {
  const endpointManager = new EndpointManager(req.params.service, req.params.pr);

  try {
    const dynamicEndpoints = await endpointManager.getDynamicEndpoints()
    res.send(dynamicEndpoints).status(200);
  } catch (e) {
    res.send({
      message: 'failed'
    }).status(500)
  }
});

// POST request made from the vdiff consumer to update redis with the new diffs
// The new diff is parsed and then emitted to the open websockets for /service/pr
router.post("/:service/:pr", jsonParser, async (req, res, next) => {
  try {
    const diffManager = new DiffManager(req.params.service, req.params.pr);
    const diff = parseDiff(req.body)
    diffManager.addDiff(diff);

    const resp = getShortForm(diff);
    res.send(resp).status(200);
  } catch (e) {
    console.log(e);
    res.send('unexpected server error').status(500);
  }
});

// GET request made to fetch diffs. This endpoint is paginated and responds with at most PAGE_SIZE elements
// Query params:
// id: number - the id is the id of the last diff fetched so the next page can be sent.
// endpoint: string - the current endpoint the client is filtering on so only diffs of that endpoint are sent.
// hasUnresolvedConflicts: boolean - if true, only unapproved diffs will be in response. 
router.get("/:service/:pr/diffs", jsonParser, async (req, res, next) => {
  try {
    const diffManager = new DiffManager(req.params.service, req.params.pr);
    const beforeId = req.query.cursor_before;
    const afterId = req.query.cursor_after;
    const endpoint = req.query.endpoint
    const hasUnapprovedConflicts = req.query.hasUnapprovedConflicts === 'true';

    const diffs = await diffManager.query({
      endpoint,
      beforeId,
      afterId,
      unapprovedOnly: hasUnapprovedConflicts,
      limit: 51
    });
      // Send response to client
    const shortenedDiffs = diffs.map(getShortForm);
    res.send(shortenedDiffs).status(200);
  } catch (e) {
    res.send('unexpected server error').status(500);
  }
});

// POST request made to approve a diff. It will iterate all of the diffs and update state to approve matching diffs.
// Request Body:
// id: number - the id of the diff meant to be approved.
router.post("/:service/:pr/approve_difference", jsonParser, async (req, res, next) => {
  try {
    const id = req.body.id
    const diffManager = new DiffManager(req.params.service, req.params.pr);
    const diff = await diffManager.getDiff(id);
    await diffManager.approveDiffConflicts(diff);
    res.send().status(200);
  } catch (e) {
    res.send('unexpected server error').status(500);
  }
})

// POST request made to unapprove a diff. It will iterate all of the diffs and update state to remove approval for matching diffs.
// Request Body:
// id: number - the id of the diff meant to be disapproved.
router.post("/:service/:pr/unapprove_difference", jsonParser, async (req, res, next) => {
  const id = req.body.id

  try {
    const diffManager = new DiffManager(req.params.service, req.params.pr);
    const diff = await diffManager.getDiff(id);
    await diffManager.removeDiffApproval(diff);
    res.send().status(200);
  } catch(e) {
    res.send('unexpected server error').status(500);
  }
})

router.post("/:service/:pr/approve_endpoint", jsonParser, async (req, res) => {
  try {
    const endpoint = req.body.endpoint

    const endpointManager = new EndpointManager(req.params.service, req.params.pr);
    await endpointManager.addApprovedEndpoint(endpoint);

    res.send().status(200);
  } catch (e) {
    console.log(e);
    res.send('unexpected server error').status(500);
  }
})

router.post("/:service/:pr/unapprove_endpoint", jsonParser, async (req, res, next) => {
  try {
    const endpoint = req.body.endpoint

    const endpointManager = new EndpointManager(req.params.service, req.params.pr);
    await endpointManager.removeApprovedEndpoint(endpoint);

    res.send().status(200);
  } catch (e) {
    res.send('unexpected server error').status(500);
  }
})

// GET request to fetch the full responses given a diff id
router.get("/:service/:pr/diffs/:id", jsonParser, async (req, res, next) => {
  const { service, pr, id } = req.params;

  const diffManager = new DiffManager(service, pr);
  try {
    const diff = await diffManager.getDiff(id);
    if (!diff) {
      const error = new Error("Id not found");
      (error as any).code = '404'
      next(error);
    } else {
      res.send(diff).status(200);
    }
  } catch(e) {
    const error = new Error("Unexpected error");
    (error as any).code = '500'
    return next(error);
  }
});

export default router;

