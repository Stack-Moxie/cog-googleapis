import {
  BaseStep, Field, StepInterface, ExpectedRecord,
} from '../../core/base-step';
import {
  Step, FieldDefinition, StepDefinition, RecordDefinition, StepRecord,
} from '../../proto/cog_pb';
import * as util from '@run-crank/utilities';
import * as assertValid from 'assert';

export class TrafficStatsFieldEquals extends BaseStep implements StepInterface {
  protected stepName: string = 'Check a field on Google Postmaster Traffic Stats';

  protected stepExpression: string = 'the (?<field>[a-zA-Z0-9_-]+) field on Google Postmaster Traffic Stats for (?<domain>[a-zA-Z0-9_.-]+) on (?<date>\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z)?)? should (?<operator>be set|not be set|be less than|be greater than|be one of|be|contain|not be one of|not be|not contain|match|not match) ?(?<expectation>.+)?';

  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;

  protected actionList: string[] = ['check'];

  protected targetObject: string = 'TrafficStats';

  protected expectedFields: Field[] = [{
    field: 'domain',
    type: FieldDefinition.Type.STRING,
    description: 'Domain to check',
  }, {
    field: 'date',
    type: FieldDefinition.Type.STRING,
    description: 'Date for the traffic stats in YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss:000Z format',
  }, {
    field: 'field',
    type: FieldDefinition.Type.STRING,
    description: 'Field name to check',
  }, {
    field: 'operator',
    type: FieldDefinition.Type.STRING,
    optionality: FieldDefinition.Optionality.OPTIONAL,
    description: 'Check Logic (be, not be, contain, not contain, be greater than, be less than, be set, not be set, be one of, or not be one of)',
  }, {
    field: 'expectation',
    type: FieldDefinition.Type.ANYSCALAR,
    description: 'Expected field value',
    optionality: FieldDefinition.Optionality.OPTIONAL,
  }];

  protected expectedRecords: ExpectedRecord[] = [{
    id: 'TrafficStats',
    type: RecordDefinition.Type.KEYVALUE,
    fields: [{
      field: 'name',
      type: FieldDefinition.Type.STRING,
      description: 'API URI for the traffic stats',
    }, {
      field: 'userReportedSpamRatio',
      type: FieldDefinition.Type.NUMERIC,
      description: 'User reported spam ratio',
      optionality: FieldDefinition.Optionality.OPTIONAL,
    }, {
      field: 'domainReputation',
      type: FieldDefinition.Type.STRING,
      description: 'Domain reputation',
    }, {
      field: 'spfSuccessRatio',
      type: FieldDefinition.Type.NUMERIC,
      description: 'SPF success ratio',
    }, {
      field: 'dkimSuccessRatio',
      type: FieldDefinition.Type.NUMERIC,
      description: 'DKIM success ratio',
    }, {
      field: 'dmarcSuccessRatio',
      type: FieldDefinition.Type.NUMERIC,
      description: 'dmarc success ratio',
    }, {
      field: 'inboundEncryptionRatio',
      type: FieldDefinition.Type.NUMERIC,
      description: 'Inbound encryption ratio',
    }],
    dynamicFields: true,
  }];

  static convertDateFormat(dateString) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);

    return `${year}-${month}-${day}`;
  }

  async executeStep(step: Step) {
    const stepData: any = step.getData().toJavaScript();
    const {
      domain, date, field, operator, expectation,
    } = stepData;

    try {
      assertValid(domain, 'Domain is required');
      assertValid(TrafficStatsFieldEquals.isValidISODate(date), 'Date must be a valid ISO 8601 format');
      assertValid(field, 'Field is required');
      assertValid(operator, 'Operator is required');
      assertValid(expectation !== undefined, 'Expectation is required');

      // Convert ISO date to YYYYMMDD format
      const formattedDate = TrafficStatsFieldEquals.convertToYYYYMMDD(date);
      // Fetch the traffic stats from the API
      let trafficStats = await this.client.getDomainTrafficStatsDate(domain, formattedDate);
      let actualDate = formattedDate;
      let actual = trafficStats[field];
      if (field === 'userReportedSpamRatio' && !actual) actual = '0';

      if (actual === undefined || actual === null || actual === '') {
        // If the field is missing or empty, search backward for the last valid entry
        const lastValidStats = await this.findLastValidTrafficStats(domain, field);
        if (lastValidStats) {
          trafficStats = lastValidStats;
          actualDate = TrafficStatsFieldEquals.convertDateFormat(trafficStats.name.split('/')[3]);
          actual = trafficStats[field];
          if (field === 'userReportedSpamRatio' && !actual) actual = '0';
        } else {
          throw new Error(`No valid ${field} data found for the domain ${domain} in the available records.`);
        }
      }

      if (!trafficStats) {
        throw new Error('No data available for the specified field and domain.');
      }

      // Assert the value
      const result = util.assert(operator, actual, expectation, field);
      const records = this.createRecords(trafficStats, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));

      let response = result.message;
      if (actualDate !== formattedDate) {
        response += `\nNo record found on ${TrafficStatsFieldEquals.convertToYYYY_MM_DD(date)}. Checked the most recent record on ${actualDate}.`;
      }

      if (field === 'userReportedSpamRatio') {
        // Calculate the rolling average for the last 30 days
        const rollingAverage = await this.client.getRollingAverageForField(domain, field);
        response += `\n The rolling 30-day average for ${field} is ${rollingAverage > -1 ? rollingAverage.toFixed(4) : 'N/A'}`;
        response += '\n Google recommends to keep spam rates below 0.10 percent and avoid ever exceeding 0.30 percent';
      }

      return result.valid ? this.pass(response, [], records)
        : this.fail(response, [], records);
    } catch (e) {
      console.log('e', e);
      // If the API returns a 404, there is no data for the domain on the given date, so still return a pass
      // If the API has previous data, compare against the last data point
      if (e.message.includes('Requested entity was not found.')) {
        try {
          const lastPageTrafficStats = await this.client.getDomainTrafficStatsLastPage(domain);
          if (lastPageTrafficStats.length === 0) {
            const result = {};
            result['valid'] = true;
            result['message'] = ' No data is available for your domain';
            const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
            return this.pass(result['message'], [], records);
          }
          // For userReportedSpamRatio, find the most recent record (which may have missing/null value = 0)
          // For other fields, find the most recent record with a valid value
          let validStats;
          if (field === 'userReportedSpamRatio') {
            // Find the most recent record regardless of whether userReportedSpamRatio is present
            validStats = lastPageTrafficStats.trafficStats && lastPageTrafficStats.trafficStats.length > 0
              ? lastPageTrafficStats.trafficStats[lastPageTrafficStats.trafficStats.length - 1]
              : null;
          } else {
            // For other fields, find the most recent record with a valid value
            validStats = await this.findLastValidTrafficStats(domain, field);
          }
          if (!validStats) {
            const result = {};
            result['valid'] = true;
            result['message'] = ` No valid ${field} data is available for your domain`;
            const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
            return this.pass(result['message'], [], records);
          }
          const trafficStats = validStats;
          let actual = trafficStats[field];
          if (field === 'userReportedSpamRatio' && !actual) actual = '0';
          const actualDate = TrafficStatsFieldEquals.convertDateFormat(trafficStats.name.split('/')[3]);
          const result = util.assert(operator, actual, expectation, field);
          const records = this.createRecords(trafficStats, domain, actualDate);
          let response = result.message;
          if (field === 'userReportedSpamRatio') {
            // Calculate the rolling average for the last 30 days
            const rollingAverage = await this.client.getRollingAverageForField(domain, field);
            response += `\n The rolling 30-day average for ${field} is ${rollingAverage > -1 ? rollingAverage.toFixed(4) : 'N/A'}`;
            response += `\n Google recommends to keep spam rates below 0.001 (0.1 percent) and avoid ever exceeding 0.003 (0.3 percent)
              \n No record found on ${TrafficStatsFieldEquals.convertToYYYY_MM_DD(date)}.  Checked the last record on ${actualDate}`;
          } else {
            response += `\n No record found on ${TrafficStatsFieldEquals.convertToYYYY_MM_DD(date)}.  Checked the last record on ${actualDate}`;
          }
          return result.valid ? this.pass(response, [], records)
            : this.fail(response, [], records);
        } catch (err) {
          const result = {};
          result['valid'] = true;
          result['message'] = ' No data is available for your domain';
          const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
          return this.pass(result['message'], [], records);
        }
      }
      if (e.message.includes('access_denied')) {
        const result = {};
        result['message'] = 'Access to Google Postmaster Tools was denied. This could be due to one of the following reasons:\n'
          + '1. The OAuth2 token has expired - please re-authenticate your Google connection\n'
          + '2. The domain has not been verified in Google Postmaster Tools\n'
          + '3. The authenticated user does not have sufficient permissions to access Postmaster Tools\n'
          + 'Please verify your domain in Google Postmaster Tools and ensure your OAuth2 credentials are valid.';
        const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
        return this.error(result['message'], [], records);
      }
      if (e.message.includes('The caller does not have permission')) {
        const result = {};
        result['message'] = ' Please authorize your email address to access the Gmail Postmaster Tools API.  See the documentation for more information.';
        const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
        return this.error(result['message'], [], records);
      }
      if (e.message.includes('No refresh token or refresh handler callback is set.')) {
        const result = {};
        result['message'] = ' This scenario requires a Gmail Postmaster Tools Integration.  Please create Google APIs connection before running your scenario.';
        const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
        return this.error(result['message'], [], records);
      }
      if (e.message.includes('invalid_grant')) {
        const result = {};
        result['message'] = 'The OAuth2 refresh token is invalid or expired. This could be due to:\n'
          + '1. The refresh token has expired (they can expire after 6 months of inactivity)\n'
          + '2. The user revoked access to the application\n'
          + '3. The Google application credentials have changed\n'
          + 'Please re-authenticate your Google connection to generate a new refresh token.';
        const records = this.createRecords({}, domain, TrafficStatsFieldEquals.convertToYYYY_MM_DD(date));
        return this.error(result['message'], [], records);
      }
      return this.error(' There was an error checking the traffic stats field: %s', [e.toString()]);
    }
  }

  // Helper function to convert ISO date to YYYY-MM-DD format
  private static convertToYYYY_MM_DD(isoDate: string): string {
    const date = new Date(isoDate);
    const year = date.getUTCFullYear();
    const month = (`0${date.getUTCMonth() + 1}`).slice(-2); // Months are zero-based
    const day = (`0${date.getUTCDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
  }

  // Helper function to convert ISO date to YYYYMMDD format
  private static convertToYYYYMMDD(isoDate: string): string {
    const date = new Date(isoDate);
    const year = date.getUTCFullYear();
    const month = (`0${date.getUTCMonth() + 1}`).slice(-2); // Months are zero-based
    const day = (`0${date.getUTCDate()}`).slice(-2);
    return `${year}${month}${day}`;
  }

  // Helper function to validate ISO 8601 date format
  private static isValidISODate(date: string): boolean {
    const regex = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?/;
    return regex.test(date);
  }

  public createRecords(trafficStats, domain, date): StepRecord[] {
    const records = [];
    // Base Record
    records.push(this.keyValue('TrafficStats', `Checked Traffic Stats for ${domain} on ${date}`, trafficStats));
    return records;
  }

  private async findLastValidTrafficStats(domain: string, field: string) {
    let lastValidStats = null;
    let pageToken = null;
    let iterations = 0;
    const maxIterations = 20;

    do {
      const response = await this.client.getDomainTrafficStatsLastPage(domain, pageToken);
      const statsList = response.trafficStats || [];

      // Find the last valid stat with the specified field that has a defined value
      // For userReportedSpamRatio, we want to include 0.0 as a valid value
      lastValidStats = statsList.reverse().find(stats => {
        if (field === 'userReportedSpamRatio') {
          return stats[field] !== undefined && stats[field] !== null;
        }
        return stats[field] !== undefined && stats[field] !== null && stats[field] !== '';
      });

      pageToken = response.nextPageToken;
      iterations++;
    } while (!lastValidStats && pageToken && iterations < maxIterations);

    return lastValidStats;
  }
}

export { TrafficStatsFieldEquals as Step };
