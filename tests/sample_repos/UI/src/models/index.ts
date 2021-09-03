
import redisClient from '../redis';

class RedisRecordManager {
  prefix: string;
  service: string;
  pr: string;

  constructor(service: string, pr: string) {
    this.service = service;
    this.pr = pr;
    this.prefix = `${service}:${pr}`;
  }
}

export type Diff = {
  id: string;
  timestamp: number;
  endpoint?: string;
  originalEndpoint: string;

  originallyInParity: boolean;
  approvedViaEndpoint: boolean;
  approvedConflict: boolean;
  conflicts: string[];
  conflictHash: string;

  req: any;
  resp: any;
  repl: any;
}

type EndpointQueryParams = {
  endpoint: string,
  beforeId?: string,
  afterId?: string
  unapprovedOnly?: boolean;
  limit?: number;
}

type NoEndpointQueryParams = {
  beforeId?: string,
  afterId?: string
  unapprovedOnly?: boolean;
  limit?: number;
}

// Prevent from entering same dynamic endpoint

type QueryParams = EndpointQueryParams | NoEndpointQueryParams;

export class DiffManager extends RedisRecordManager {
  // If contains diffs, check if they have already been approved
  mapKey = () => `${this.prefix}:diffs`;
  timestampIndexKey = () => `${this.prefix}:diffs-by-timestamp`;
  endpointIndexKey = () => `${this.prefix}:diffs-by-endpoint`;
  endpointUnapprovedIndexKey = () => `${this.prefix}:unapproved-diffs-by-endpoint`;
  unapprovedIndexKey = () => `${this.prefix}:unapproved-diff`;
  approvedDiffsKey = () => `${this.prefix}:approved-diffs`;
  conflictIndexKey = () => `${this.prefix}:diffs-by-conflict`;

  reset = () => {
    redisClient.del(this.mapKey());
    redisClient.del(this.timestampIndexKey());
    redisClient.del(this.endpointIndexKey());
    redisClient.del(this.endpointUnapprovedIndexKey());
    redisClient.del(this.unapprovedIndexKey());
    redisClient.del(this.approvedDiffsKey());
    redisClient.del(this.conflictIndexKey());
  }

  async getDiff(id) {
    const diff = await redisClient.hget(this.mapKey(), id);
    return JSON.parse(diff);
  }

  // Updates diffs in redis cache
  async saveDiffs(diffs: Diff[]) {
    const setDiffArgs: string[] = [];

    for (const diff of diffs) {
      setDiffArgs.push(diff.id, JSON.stringify(diff));
    }

    await redisClient.hmset(this.mapKey(), ...setDiffArgs);
  }

  async addDiff(diff: Diff) {
    const endpointManager = new EndpointManager(this.service, this.pr);

    const dynamicEndpoints = await endpointManager.getDynamicEndpoints();
    await this.processEndpointForDiff(diff, dynamicEndpoints);

    diff.approvedConflict = await this.haveDiffConflictsBeenApproved(diff);
    diff.approvedViaEndpoint = await endpointManager.isEndpointApproved(diff.endpoint);

    const metricsCache = await endpointManager.getMetrics();
    if (metricsCache) {
      endpointManager.addDiffToMetrics(diff, metricsCache);
      await endpointManager.saveMetrics(metricsCache);
    }

    // Create main record for diff
    await this.saveDiffs([diff]);

    // Add diff to timestamp index so order is preserved as new diffs added
    await this.indexByTimestamp(diff);
    await this.indexByConflict(diff);
    await this.indexIfUnapproved(diff);
    await this.indexByEndpoint(diff);

    // Add basic endpoint to set of basic endpoints
    await endpointManager.addBasicEndpoint(diff.endpoint);
  }

  async getApprovedDiffConflicts() {
    const conflicts = await redisClient.smembers(this.approvedDiffsKey());
    return new Set(conflicts);
  }

  async approveDiffConflicts(diff: Diff) {
    await redisClient.sadd(this.approvedDiffsKey(), diff.conflictHash);

    const affectedDiffs = await this.queryByConflict(diff.conflictHash);
    await this.reprocessDiffs({
      diffs: affectedDiffs,
      reprocessApproval: true
    });
  }

  async removeDiffApproval(diff: Diff) {
    await redisClient.srem(this.approvedDiffsKey(), diff.conflictHash);

    const affectedDiffs = await this.queryByConflict(diff.conflictHash);
    await this.reprocessDiffs({
      diffs: affectedDiffs,
      reprocessApproval: true
    });
  }

  async haveDiffConflictsBeenApproved(diff: Diff, approvedConflicts?: Set<any>) {
    if (approvedConflicts) {
      return approvedConflicts.has(diff.conflictHash);
    } else {
      const isApproved = await redisClient.sismember(this.approvedDiffsKey(), diff.conflictHash);
      return Boolean(isApproved);
    }
  }

  isDiffApproved = (diff: Diff) => {
    return (
      diff.approvedConflict ||
      diff.originallyInParity ||
      diff.approvedViaEndpoint
    );
  }

  async getDiffsByIds(ids: string[]) {
    if (ids.length > 0) {
      const diffs = await redisClient.hmget(this.mapKey(), ...ids);
      return diffs.map(diff => JSON.parse(diff));
    } else {
      return [];
    }
  }

  async getAllDiffs(): Promise<Diff[]> {
    const key = this.mapKey();
    const diffs = await redisClient.hgetall(key);
    const diffsArray = Object.values(diffs);
    return diffsArray.map(d => JSON.parse(d as string));
  }

  async indexByTimestamp(diff: Diff) {
    await redisClient.zadd(this.timestampIndexKey(), 0, `${diff.timestamp}|${diff.id}`);
  }

  async indexByConflict(diff: Diff) {
    await redisClient.zadd(this.conflictIndexKey(), 0, `${diff.conflictHash}|${diff.id}`);
  }

  async indexByEndpoint(diff: Diff) {
    const newEndpointIndexValue = `${diff.endpoint}|${diff.timestamp}|${diff.id}`;

    await redisClient.zadd(this.endpointIndexKey(), 0, newEndpointIndexValue);
  }

  async indexIfUnapproved(diff: Diff) {
    // Using lexographic index, as per redis's recommendations
    const isApproved = this.isDiffApproved(diff);

    const indexValue = `${diff.timestamp}|${diff.id}`
    const endpointIndexValue = `${diff.endpoint}|${diff.timestamp}|${diff.id}`

    if (!isApproved) {
      await redisClient.zadd(this.unapprovedIndexKey(), 0, indexValue);
      await redisClient.zadd(this.endpointUnapprovedIndexKey(), 0, endpointIndexValue);
    } else {
      await redisClient.zrem(this.unapprovedIndexKey(), indexValue);
      await redisClient.zrem(this.endpointUnapprovedIndexKey(), endpointIndexValue);
    }
  }

  async updateEndpoint(diff: Diff, endpoint: string) {
    // Using lexographic index, as per redis's recommendations
    const oldEndpointIndexValue = `${diff.endpoint}|${diff.timestamp}|${diff.id}`;
    await redisClient.zrem(this.endpointIndexKey(), oldEndpointIndexValue);
    await redisClient.zrem(this.endpointUnapprovedIndexKey(), oldEndpointIndexValue);

    diff.endpoint = endpoint;

    await this.saveDiffs([diff]); 
    await this.indexByEndpoint(diff);
    await this.indexIfUnapproved(diff);
  }

  async queryByConflict(conflict: string) {
    const indexedIds = await redisClient.zrangebylex(
      this.conflictIndexKey(),
      `(${conflict}`,
      `(${conflict}~`
    );

    const ids = indexedIds.map(indexed => {
      const sections = indexed.split('|');
      return sections[sections.length - 1] ;
    });

    return this.getDiffsByIds(ids);
  }

  async query(params: QueryParams) {
    if ('endpoint' in params && params.endpoint) {
      return this._queryWithEndpoint(params);
    } else {
      return this._queryWithoutEndpoint(params);
    }
  }

  async _queryWithoutEndpoint(params: NoEndpointQueryParams) {
    const {
      beforeId,
      afterId,
      unapprovedOnly,
      limit
    } = params;
    const limitArgs: ['LIMIT', 0, number] = limit ? ['LIMIT', 0, limit] : [] as any

    let indexedIds = [];
    const indexKey = unapprovedOnly
      ? this.unapprovedIndexKey()
      : this.timestampIndexKey();

    if (beforeId) {
      const boundaryDiff = await this.getDiff(beforeId);
      indexedIds = await redisClient.zrevrangebylex(
        indexKey,
        `(${boundaryDiff.timestamp}|${boundaryDiff.id}`,
        '-',
        ...limitArgs
      );
      indexedIds.reverse();
    } else if (afterId) {
      const boundaryDiff = await this.getDiff(afterId);
      indexedIds = await redisClient.zrangebylex(
        indexKey,
        `(${boundaryDiff.timestamp}|${boundaryDiff.id}`,
        '+',
        ...limitArgs
      );
    } else {
      indexedIds = await redisClient.zrangebylex(
        indexKey,
        '-',
        '+',
        ...limitArgs
      );
    }

    const ids = indexedIds.map(indexed => {
      const sections = indexed.split('|');
      return sections[sections.length - 1] ;
    });

    return this.getDiffsByIds(ids);
  };

  async _queryWithEndpoint(params: EndpointQueryParams) {
    const {
      endpoint,
      beforeId,
      afterId,
      unapprovedOnly,
      limit
    } = params;

    const limitArgs: ['LIMIT', 0, number] = limit ? ['LIMIT', 0, limit] : [] as any;

    let indexedIds = [];
    const indexKey = unapprovedOnly
      ? this.endpointUnapprovedIndexKey()
      : this.endpointIndexKey();

    if (beforeId) {
      const boundaryDiff = await this.getDiff(beforeId);
      indexedIds = await redisClient.zrevrangebylex(
        indexKey,
        `(${endpoint}|${boundaryDiff.timestamp}|${boundaryDiff.id}`,
        `(${endpoint}`,
        ...limitArgs
      );
      indexedIds.reverse();
    } else if (afterId) {
      const boundaryDiff = await this.getDiff(afterId);
      indexedIds = await redisClient.zrangebylex(
        indexKey,
        `(${endpoint}|${boundaryDiff.timestamp}|${boundaryDiff.id}`,
        `(${endpoint}~`,
        ...limitArgs
      );
    } else {
      indexedIds = await redisClient.zrangebylex(
        indexKey,
        `(${endpoint}`,
        `(${endpoint}~`,
        ...limitArgs
      );
    }

    const ids = indexedIds.map(indexed => {
      const sections = indexed.split('|');
      return sections[sections.length - 1] ;
    });

    return this.getDiffsByIds(ids);
  }

  async processEndpointForDiff(diff: Diff, dynamicEndpoints: string[]) {
    diff.endpoint = diff.originalEndpoint;
    for (const dynamicEndpoint of dynamicEndpoints) {
      if (matchDynamicEndpoint(dynamicEndpoint, diff.originalEndpoint)) {
        diff.endpoint = dynamicEndpoint;
        break;
      }
    }
  }

  async reprocessDiffs(options: {
    reprocessEndpoint?: boolean;
    reprocessApproval?: boolean;
    updateMetrics?: boolean;
    diffs?: Diff[];
  }) {
    const { reprocessEndpoint, reprocessApproval, diffs: diffsParam } = options;

    const diffs = diffsParam || await this.getAllDiffs();

    const endpointManager = new EndpointManager(this.service, this.pr);
    const dynamicEndpoints = await endpointManager.getDynamicEndpoints();
    const approvedEndpoints = await endpointManager.getApprovedEndpoints();
    const approvedConflicts = await this.getApprovedDiffConflicts();

    for (const diff of diffs) {
      if (reprocessEndpoint) {
        await this.processEndpointForDiff(diff, dynamicEndpoints);
      }

      if (reprocessApproval) {
        diff.approvedConflict = await this.haveDiffConflictsBeenApproved(diff, approvedConflicts);
        diff.approvedViaEndpoint = await endpointManager.isEndpointApproved(diff.endpoint, approvedEndpoints);
      }

      if (reprocessEndpoint) {
        await this.indexByEndpoint(diff);
      }

      if (reprocessApproval) {
        await this.indexIfUnapproved(diff);
      }
    }

    await this.saveDiffs(diffs);
    await endpointManager.clearMetricsCache();
  }
}

const trimEndSlash = (str: string) => {
  if (str[str.length - 1] === '/') {
    return str.substr(0, str.length - 1);
  } else {
    return str;
  }
}

export const matchDynamicEndpoint = (endpoint, dynamicEndpoint) => {
  const endpointSections = trimEndSlash(endpoint).split('/');
  const dynamicEndpointSections = trimEndSlash(dynamicEndpoint).split('/');

  if (endpointSections.length !== dynamicEndpointSections.length) {
    return false;
  }

  for (let i = 0; i < endpointSections.length; i++) {
    const section = endpointSections[i];
    const dynamicSection = endpointSections[i];

    const isWildcard = dynamicSection.length > 0 && dynamicSection[0] === ':';

    if (
      !isWildcard &&
      section !== dynamicSection
    ) {
      return false;
    }
  }

  return true;
}

export class EndpointManager extends RedisRecordManager {
  basicEndpointsKey = () => `${this.prefix}:basic_endpoints`;
  dynamicEndpointsKey = () => `${this.prefix}:dynamic_endpoints`;
  metricsCacheKey = () => `${this.prefix}:endpoint_metrics`;
  approvedEndpointsKey = () => `${this.prefix}:approved_endpoints`;

  reset = () => {
    redisClient.del(this.basicEndpointsKey());
    redisClient.del(this.dynamicEndpointsKey());
    redisClient.del(this.metricsCacheKey());
    redisClient.del(this.approvedEndpointsKey());
  }

  async addApprovedEndpoint(endpoint: string) {
    const diffManager = new DiffManager(this.service, this.pr);
    const diffs = await diffManager.query({ endpoint });

    await redisClient.sadd(this.approvedEndpointsKey(), endpoint);

    for (const diff of diffs) {
      diff.approvedViaEndpoint = true;
    }

    await diffManager.reprocessDiffs({
      reprocessApproval: true,
      diffs
    });
  }

  async removeApprovedEndpoint(endpoint: string) {
    await redisClient.srem(this.approvedEndpointsKey(), endpoint);

    const diffManager = new DiffManager(this.service, this.pr);
    const diffs = await diffManager.query({ endpoint });

    await diffManager.reprocessDiffs({
      diffs,
      reprocessApproval: true
    });
  }

  async getApprovedEndpoints() {
    const endpoints = await redisClient.smembers(this.approvedEndpointsKey());
    return new Set(endpoints);
  }

  async isEndpointApproved(endpoint: string, approvedEndpoints?: Set<any>): Promise<any> {
    if (approvedEndpoints) {
      return approvedEndpoints.has(endpoint);
    }
    
    const isApproved = await redisClient.sismember(this.approvedEndpointsKey(), endpoint);
    return Boolean(isApproved);
  }

  async addBasicEndpoint(endpoint: string) {
    await redisClient.sadd(this.basicEndpointsKey(), endpoint);
  }

  async getBasicEndpoints() {
    const endpoints = await redisClient.smembers(this.basicEndpointsKey());
    return endpoints;
  }

  async addDynamicEndpoint(endpoint: string) {
    await redisClient.lpush(this.dynamicEndpointsKey(), endpoint);

    const matchingBasicEndpoints = await this.getBasicEndpointsMatchingDynamicEndpoint(endpoint);
    await this.reassignDiffsToNewEndpoint(matchingBasicEndpoints, endpoint);

    this.clearMetricsCache()
  }

  async removeDynamicEndpoint(endpoint: string) {
    await redisClient.lrem(this.dynamicEndpointsKey(), 1, endpoint);

    const diffManager = new DiffManager(this.service, this.pr);
    const diffs = await diffManager.query({ endpoint });

    await diffManager.reprocessDiffs({
      diffs,
      reprocessEndpoint: true,
      reprocessApproval: true
    });
  }

  async getDynamicEndpoints() {
    const dynamicEndpoints = await redisClient.lrange(this.dynamicEndpointsKey(), 0, -1);
    return dynamicEndpoints;
  }

  async getBasicEndpointsMatchingDynamicEndpoint(dynamicEndpoint: string): Promise<string[]> {
    const basicEndpoints = await this.getBasicEndpoints();
    const matchingBasicEndpoints: string[] = [];

    for (const basicEndpoint of basicEndpoints) {
      if (matchDynamicEndpoint(basicEndpoint, dynamicEndpoint)) {
        matchingBasicEndpoints.push(basicEndpoint);
      }
    }

    return matchingBasicEndpoints;
  }

  async reassignDiffsToNewEndpoint(fromEndpoints: string[], toEndpoint: string) {
    const diffManager = new DiffManager(this.service, this.pr);

    for (const endpoint of fromEndpoints) {
      const diffs = await diffManager.query({ endpoint });
      for (const diff of diffs) {
        await diffManager.updateEndpoint(diff, toEndpoint);
      }
    }
  }

  addDiffToMetrics = (diff: Diff, metrics: any) => {
    const diffManager = new DiffManager(this.service, this.pr);

    const endpointMetrics = metrics[diff.endpoint] || {
      total: 0,
      success: 0,
      approved: false
    };

    endpointMetrics.total += 1;
    endpointMetrics.success += diffManager.isDiffApproved(diff);

    metrics[diff.endpoint] = endpointMetrics;
  }

  async saveMetrics(metrics: any) {
    await redisClient.set(this.metricsCacheKey(), JSON.stringify(metrics));
  }

  async clearMetricsCache() {
    await redisClient.del(this.metricsCacheKey());
  }

  async getMetricsCache() {
    const cache = await redisClient.get(this.metricsCacheKey());
    return JSON.parse(cache);
  }

  async getMetrics() {
    const cached = await this.getMetricsCache();
    if (!cached) {
      const metrics = await this.computeMetrics();
      await this.saveMetrics(metrics);
      return metrics;
    } else {
      return cached;
    }
  }

  async computeMetrics() {
    const metrics = {};

    const diffManager = new DiffManager(this.service, this.pr);
    const diffs = await diffManager.getAllDiffs();
    const approvedEndpoints = await this.getApprovedEndpoints();

    for (const diff of diffs) {
      this.addDiffToMetrics(diff, metrics);
    }

    for (const endpoint in metrics) {
      metrics[endpoint].approved = approvedEndpoints.has(endpoint);
    }

    return metrics;
  }
}