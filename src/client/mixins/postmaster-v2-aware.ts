import {
  ComplianceReport,
  MetricPoint,
  POSTMASTER_METRICS,
  PostmasterMonitorError,
  normalizeCompliance,
  normalizeStats,
  toGoogleDate,
} from '../postmaster-v2';

export class PostmasterV2Mixin {
  oauth2Client: any;

  public async getPostmasterCompliance(domain: string): Promise<ComplianceReport> {
    const url = `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}/complianceStatus`;
    const payload = await this.postmasterRequest(url);
    return normalizeCompliance(payload);
  }

  public async queryPostmasterMetric(
    domain: string,
    metric: string,
    startDate: string,
    endDate: string,
    granularity: 'DAILY' | 'OVERALL',
  ): Promise<MetricPoint[]> {
    const definition = POSTMASTER_METRICS[metric];
    if (!definition) {
      throw new PostmasterMonitorError('config', `Unknown Postmaster metric "${metric}".`);
    }
    const url = `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}/domainStats:query`;
    const points: MetricPoint[] = [];
    let pageToken = '';
    let page = 0;
    do {
      const body: any = {
        metricDefinitions: [{
          name: metric,
          baseMetric: { standardMetric: definition.standardMetric },
        }],
        timeQuery: {
          dateRanges: {
            dateRanges: [{
              start: toGoogleDate(startDate),
              end: toGoogleDate(endDate),
            }],
          },
        },
        aggregationGranularity: granularity,
        pageSize: 200,
      };
      if (definition.filter) {
        body.metricDefinitions[0].filter = definition.filter;
      }
      if (pageToken) {
        body.pageToken = pageToken;
      }
      const payload = await this.postmasterRequest(url, body);
      points.push(...normalizeStats(payload));
      pageToken = payload && payload.nextPageToken ? payload.nextPageToken : '';
      page += 1;
    } while (pageToken && page < 10);
    return points;
  }

  private async postmasterRequest(url: string, body?: any): Promise<any> {
    try {
      await this.oauth2Client.getAccessToken();
      const response = await this.oauth2Client.request({
        url,
        method: body ? 'POST' : 'GET',
        data: body,
        headers: { 'Content-Type': 'application/json' },
      });
      return response && response.data !== undefined ? response.data : response;
    } catch (error) {
      if (error instanceof PostmasterMonitorError) {
        throw error;
      }
      const status = error && error.response && error.response.status;
      const message = `${error && error.message ? error.message : error}`;
      if (status === 401 || status === 403 || /invalid_grant|access_denied|permission|unauthorized/i.test(message)) {
        throw new PostmasterMonitorError('reconnect', message);
      }
      if (status === 400 || status === 404) {
        throw new PostmasterMonitorError('config', message);
      }
      throw new PostmasterMonitorError('request', message);
    }
  }
}
