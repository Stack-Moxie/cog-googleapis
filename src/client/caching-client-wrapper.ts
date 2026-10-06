import { ClientWrapper } from '../client/client-wrapper';
import { promisify } from 'util';

class CachingClientWrapper {
  // cachePrefix is scoped to the specific scenario, request, and requestor
  public cachePrefix = `${this.idMap.scenarioId}${this.idMap.requestorId}${this.idMap.connectionId}`;

  constructor(private client: ClientWrapper, public redisClient: any, public idMap: any) {
    this.client = client;
    this.redisClient = redisClient;
    this.idMap = idMap;
  }

  // Redis methods for get, set, and delete
  // -------------------------------------------------------------------

  // Async getter/setter
  public getAsync = promisify(this.redisClient.get).bind(this.redisClient);

  public setAsync = promisify(this.redisClient.setex).bind(this.redisClient);

  public delAsync = promisify(this.redisClient.del).bind(this.redisClient);

  public async getCache(key: string) {
    try {
      const stored = await this.getAsync(key);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (err) {
      console.log(err); // eslint-disable-line no-console
    }
  }

  public async setCache(key: string, value: any) {
    try {
      // arrOfKeys will store an array of all cache keys used in this scenario run
      // so it can be cleared easily
      const arrOfKeys = await this.getCache(`cachekeys|${this.cachePrefix}`) || [];
      arrOfKeys.push(key);
      await this.setAsync(key, 55, JSON.stringify(value));
      await this.setAsync(`cachekeys|${this.cachePrefix}`, 55, JSON.stringify(arrOfKeys));
    } catch (err) {
      console.log(err); // eslint-disable-line no-console
    }
  }

  public async delCache(key: string) {
    try {
      await this.delAsync(key);
    } catch (err) {
      console.log(err); // eslint-disable-line no-console
    }
  }

  public async clearCache() {
    try {
      // clears all the cachekeys used in this scenario run
      const keysToDelete = await this.getCache(`cachekeys|${this.cachePrefix}`) || [];
      if (keysToDelete.length) {
        keysToDelete.forEach(async (key: string) => this.delAsync(key));
      }
      await this.setAsync(`cachekeys|${this.cachePrefix}`, 55, '[]');
    } catch (err) {
      console.log(err); // eslint-disable-line no-console
    }
  }

  // postmastertools aware methods
  // -------------------------------------------------------------------

  public async getDomainTrafficStatsLastPage(domainName: string): Promise<any> {
    return this.client.getDomainTrafficStatsLastPage(domainName);
  }

  public async getDomainTrafficStatsDate(domainName: string, date: string): Promise<any> {
    return this.client.getDomainTrafficStatsDate(domainName, date);
  }

  public async getPostmasterCompliance(domain: string): Promise<any> {
    return this.client.getPostmasterCompliance(domain);
  }

  public async queryPostmasterMetric(
    domain: string,
    metric: string,
    startDate: string,
    endDate: string,
    granularity: 'DAILY' | 'OVERALL',
  ): Promise<any> {
    return this.client.queryPostmasterMetric(domain, metric, startDate, endDate, granularity);
  }
}

export { CachingClientWrapper };
