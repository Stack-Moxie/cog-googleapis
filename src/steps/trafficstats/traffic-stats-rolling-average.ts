import {
  BaseStep, Field, StepInterface,
} from '../../core/base-step';
import {
  Step, FieldDefinition, StepDefinition, StepRecord,
} from '../../proto/cog_pb';
import * as util from '@run-crank/utilities';
import * as assertValid from 'assert';

export class TrafficStatsRollingAverage extends BaseStep implements StepInterface {
  protected stepName: string = 'Check rolling average of a field on Google Postmaster Traffic Stats';

  protected stepExpression: string = 'the rolling average of the (?<field>[a-zA-Z0-9_-]+) field on Google Postmaster Traffic Stats for (?<domain>[a-zA-Z0-9_.-]+) should (?<operator>be less than|be greater than|be) (?<expectation>.+)';

  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;

  protected actionList: string[] = ['check'];

  protected targetObject: string = 'TrafficStatsRollingAverage';

  protected expectedFields: Field[] = [{
    field: 'domain',
    type: FieldDefinition.Type.STRING,
    description: 'Domain to check',
  }, {
    field: 'field',
    type: FieldDefinition.Type.STRING,
    description: 'Field name to check the rolling average for',
  }, {
    field: 'operator',
    type: FieldDefinition.Type.STRING,
    description: 'Operator for comparison (e.g., "be greater than")',
  }, {
    field: 'expectation',
    type: FieldDefinition.Type.NUMERIC,
    description: 'Expected value for the rolling average',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData().toJavaScript();
    const {
      domain, field, operator, expectation,
    } = stepData;

    try {
      assertValid(domain, 'Domain is required');
      assertValid(field, 'Field is required');
      assertValid(operator, 'Operator is required');
      assertValid(expectation !== undefined, 'Expectation is required');

      const rollingAverage = await this.client.getRollingAverageForField(domain, field);
      const result = util.assert(operator, rollingAverage, expectation, field);

      let response = result.message;
      response += `\nChecked the rolling 30-day average for ${field} on ${domain}, which is ${rollingAverage > -1 ? rollingAverage.toFixed(4) : 'N/A'}.`;

      const records = this.createRecords(domain, field, rollingAverage);
      return result.valid ? this.pass(response, [], records) : this.fail(response, [], records);
    } catch (e) {
      if (e.message.includes('access_denied')) {
        const result = {};
        result['message'] = 'Access to Google Postmaster Tools was denied. This could be due to one of the following reasons:\n'
          + '1. The OAuth2 token has expired - please re-authenticate your Google connection\n'
          + '2. The domain has not been verified in Google Postmaster Tools\n'
          + '3. The authenticated user does not have sufficient permissions to access Postmaster Tools\n'
          + 'Please verify your domain in Google Postmaster Tools and ensure your OAuth2 credentials are valid.';
        const records = this.createRecords(domain, field, -1);
        return this.error(result['message'], [], records);
      }
      if (e.message.includes('The caller does not have permission')) {
        const result = {};
        result['message'] = ' Please authorize your email address to access the Gmail Postmaster Tools API.  See the documentation for more information.';
        const records = this.createRecords(domain, field, -1);
        return this.error(result['message'], [], records);
      }
      if (e.message.includes('No refresh token or refresh handler callback is set.')) {
        const result = {};
        result['message'] = ' This scenario requires a Gmail Postmaster Tools Integration.  Please create Google APIs connection before running your scenario.';
        const records = this.createRecords(domain, field, -1);
        return this.error(result['message'], [], records);
      }
      if (e.message.includes('invalid_grant')) {
        const result = {};
        result['message'] = 'The OAuth2 refresh token is invalid or expired. This could be due to:\n'
          + '1. The refresh token has expired (they can expire after 6 months of inactivity)\n'
          + '2. The user revoked access to the application\n'
          + '3. The Google application credentials have changed\n'
          + 'Please re-authenticate your Google connection to generate a new refresh token.';
        const records = this.createRecords(domain, field, -1);
        return this.error(result['message'], [], records);
      }
      return this.error('There was an error checking the rolling average for the traffic stats field: %s', [e.toString()]);
    }
  }

  private createRecords(domain: string, field: string, rollingAverage: number): StepRecord[] {
    // Construct a StepRecord to represent the rolling average result
    const records = [];
    rollingAverage = rollingAverage > -1 ? rollingAverage : 0;
    records.push(this.keyValue('TrafficStatsRollingAverage', `Checked Traffic Stats for ${domain} and ${field}`, { rollingAverage }));
    return records;
  }
}

export { TrafficStatsRollingAverage as Step };
